import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { computeNextPurchaseCode, demoPurchaseRequests } from "@/lib/purchasing";
import { loadSignaturePolicy, signRecord } from "@/lib/signature-service";

const STATUSES = ["DRAFT", "PENDING", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

const schema = z.object({
  title: z.string().min(3).max(200),
  supplier: z.string().max(200).optional(),
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  currency: z.string().min(1).max(10).optional(),
  neededBy: z.string().date().optional().nullable(),
  notes: z.string().max(2000).optional(),
  items: z.array(z.object({
    inventoryItemId: z.string().uuid().optional().nullable(),
    description: z.string().min(1).max(300),
    quantity: z.coerce.number().positive(),
    unit: z.string().min(1).max(40),
    estimatedUnitPrice: z.coerce.number().nonnegative().optional().nullable(),
    notes: z.string().max(500).optional(),
  })).min(1, "Añade al menos un artículo a la solicitud.").max(100),
  // Contraseña de quien solicita: firma electrónicamente la solicitud en el
  // mismo acto de crearla, igual que antes se firmaba la requisición en papel.
  signaturePassword: z.string().max(200).optional(),
  // Datos regulatorios de la compra. Obligatorios cuando la solicitud incluye
  // reactivos controlados o de doble uso: sin licencia ni permiso vigentes no
  // se puede adquirir el material.
  purchaseOrderNumber: z.string().max(120).optional(),
  licenseNumber: z.string().max(120).optional(),
  permitNumber: z.string().max(120).optional(),
  permitId: z.string().uuid().optional().nullable(),
});

async function nextRequestCode(sql: ReturnType<typeof getSql>, laboratoryId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await sql`
    SELECT request_code FROM purchase_requests
    WHERE laboratory_id = ${laboratoryId} AND request_code LIKE ${`OC-${year}-%`}
  `;
  return computeNextPurchaseCode(rows.map((row) => String(row.request_code)), year);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "purchasing.view")) return NextResponse.json({ message: "No tienes permiso para consultar compras." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: demoPurchaseRequests, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      pr.id, pr.request_code, pr.title, pr.supplier, pr.status, pr.priority, pr.currency,
      pr.needed_by, pr.created_at,
      COUNT(pri.id)::int AS item_count,
      COALESCE(SUM(pri.quantity * COALESCE(pri.estimated_unit_price, 0)), 0) AS estimated_total
    FROM purchase_requests pr
    LEFT JOIN purchase_request_items pri ON pri.purchase_request_id = pr.id
    WHERE pr.laboratory_id = ${session.laboratoryId}
    GROUP BY pr.id
    ORDER BY (pr.status IN ('RECEIVED', 'CANCELLED')), pr.needed_by NULLS LAST, pr.created_at DESC
    LIMIT 250
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "purchasing.manage")) return NextResponse.json({ message: "No tienes permiso para crear solicitudes de compra." }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de la solicitud inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  const status = payload.status ?? "DRAFT";

  // Un borrador todavía no compromete nada: la firma se exige cuando la
  // solicitud sale a circulación (cualquier estado distinto de DRAFT).
  const policy = await loadSignaturePolicy(session.laboratoryId);
  const signatureRequired = policy.purchaseRequest && status !== "DRAFT";
  if (signatureRequired && !payload.signaturePassword) {
    return NextResponse.json(
      { success: false, error: "SIGNATURE_REQUIRED", message: "Esta solicitud debe ir firmada. Confirma tu contraseña para firmarla." },
      { status: 400 },
    );
  }

  if (!hasDatabase()) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), request_code: "OC-DEMO-001", title: payload.title, status, priority: payload.priority ?? "NORMAL", supplier: payload.supplier ?? null, currency: payload.currency ?? "GTQ", needed_by: payload.neededBy ?? null }, mode: "demo" }, { status: 201 });
  }

  const sql = getSql();
  // Valida que los artículos ligados pertenezcan al laboratorio.
  const linkedIds = payload.items.map((item) => item.inventoryItemId).filter((id): id is string => Boolean(id));
  if (linkedIds.length) {
    const found = await sql`SELECT id FROM inventory_items WHERE laboratory_id = ${session.laboratoryId} AND id = ANY(${linkedIds})`;
    if (found.length !== new Set(linkedIds).size) return NextResponse.json({ message: "Uno de los artículos vinculados no pertenece a este laboratorio." }, { status: 400 });
  }

  // ¿La solicitud incluye material controlado? Lo decide el servidor a partir
  // de los artículos ligados y del catálogo, no lo que declare el usuario.
  let hasControlled = false;
  if (linkedIds.length) {
    const controlledRows = await sql`
      SELECT count(*)::int AS total FROM inventory_items i
      LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
      WHERE i.laboratory_id = ${session.laboratoryId} AND i.id = ANY(${linkedIds})
        AND (i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
    `.catch(() => [{ total: 0 }]);
    hasControlled = Number(controlledRows[0]?.total ?? 0) > 0;
  }

  if (hasControlled && status !== "DRAFT") {
    const missing: string[] = [];
    if (!payload.licenseNumber?.trim()) missing.push("Número de licencia");
    if (!payload.permitNumber?.trim()) missing.push("Número de permiso");
    if (missing.length) {
      return NextResponse.json(
        {
          success: false,
          error: "REGULATORY_DATA_REQUIRED",
          message: `La solicitud incluye reactivos controlados: faltan ${missing.join(" y ")}.`,
          fields: missing,
        },
        { status: 400 },
      );
    }
  }

  const requestCode = await nextRequestCode(sql, session.laboratoryId);
  const items = payload.items.map((item) => ({
    inventory_item_id: item.inventoryItemId ?? null,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    estimated_unit_price: item.estimatedUnitPrice ?? null,
    notes: item.notes ?? null,
  }));

  let rows;
  try {
    rows = await sql`
      WITH created AS (
        INSERT INTO purchase_requests (
          laboratory_id, request_code, title, supplier, status, priority, currency, needed_by, notes,
          requested_by, created_by, purchase_order_number, license_number, permit_number, permit_id, has_controlled_items
        )
        VALUES (${session.laboratoryId}, ${requestCode}, ${payload.title}, ${payload.supplier ?? null}, ${status}, ${payload.priority ?? "NORMAL"}, ${payload.currency ?? "GTQ"}, ${payload.neededBy ?? null}, ${payload.notes ?? null}, ${session.userId}, ${session.userId},
                ${payload.purchaseOrderNumber ?? null}, ${payload.licenseNumber ?? null}, ${payload.permitNumber ?? null}, ${payload.permitId ?? null}, ${hasControlled})
        RETURNING *
      ), created_items AS (
        INSERT INTO purchase_request_items (laboratory_id, purchase_request_id, inventory_item_id, description, quantity, unit, estimated_unit_price, notes)
        SELECT ${session.laboratoryId}, c.id, i.inventory_item_id, i.description, i.quantity, i.unit, i.estimated_unit_price, i.notes
        FROM created c, jsonb_to_recordset(${JSON.stringify(items)}::jsonb) AS i(inventory_item_id uuid, description varchar, quantity numeric, unit varchar, estimated_unit_price numeric, notes text)
      ) SELECT * FROM created
    `;
  } catch (error) {
    console.error("[api/purchasing] POST", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible crear la solicitud de compra. Intenta nuevamente." }, { status: 500 });
  }

  // La firma se estampa con el registro ya creado, sobre su contenido exacto.
  if (payload.signaturePassword) {
    const signature = await signRecord(session, {
      password: payload.signaturePassword,
      entityType: "purchase_request",
      entityId: String(rows[0].id),
      meaning: "REQUEST",
      content: { requestCode, title: payload.title, supplier: payload.supplier ?? null, neededBy: payload.neededBy ?? null, items },
      request,
    });
    if (!signature.ok) {
      // Sin firma válida la solicitud no puede quedar en circulación: se
      // conserva como borrador para que nadie la tramite sin respaldo.
      if (signatureRequired) {
        await sql`UPDATE purchase_requests SET status = 'DRAFT', updated_at = now() WHERE id = ${String(rows[0].id)} AND laboratory_id = ${session.laboratoryId}`;
      }
      return NextResponse.json({ success: false, error: "SIGNATURE_FAILED", message: signature.message }, { status: signature.status });
    }
    if (signature.signatureId) {
      await sql`UPDATE purchase_requests SET request_signature_id = ${signature.signatureId} WHERE id = ${String(rows[0].id)} AND laboratory_id = ${session.laboratoryId}`;
    }
  }

  await writeAuditEvent(session, { action: "PURCHASE_REQUEST_CREATED", entityType: "purchase_request", entityId: String(rows[0].id), newValue: rows[0], reason: "Alta de solicitud de compra", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
