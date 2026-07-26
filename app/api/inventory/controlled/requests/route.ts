import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { convertQuantity } from "@/lib/units";
import { computeNextRequestCode, DEFAULT_CONTROLLED_POLICY } from "@/lib/controlled-reagents";
import { canAuthorizeControlled, isMissingAuthorizationMigration, loadControlledPolicy } from "@/lib/controlled-usage-service";
import { dispatchPush } from "@/lib/push";
import { notifyControlledRequest } from "@/lib/push-events";
import { loadSignaturePolicy, signRecord } from "@/lib/signature-service";

// Solicitudes de autorización de uso de reactivos controlados: la versión
// digital de la hoja que antes se llenaba en papel, se llevaba al responsable y
// se regresaba firmada para poder usar el reactivo.
//
// GET  — lista según el rol: quien autoriza ve todo el laboratorio, el resto ve
//        solo sus solicitudes. ?scope=inbox limita a las pendientes por
//        autorizar; ?itemId=… filtra por reactivo; ?usable=1 devuelve solo las
//        autorizaciones vigentes con las que el usuario ya puede consumir.
// POST — crea la solicitud (queda PENDING y notifica al responsable).

const createSchema = z.object({
  inventoryItemId: databaseIdSchema,
  quantity: z.coerce.number().positive(),
  unit: z.string().max(40).optional(),
  usedByPerson: z.string().min(2).max(200),
  usageArea: z.string().min(2).max(200),
  usagePurpose: z.string().min(2).max(1000),
  plannedFor: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(1000).optional(),
  // Firma de quien solicita: reemplaza la firma manuscrita de la hoja de papel.
  signaturePassword: z.string().max(200).optional(),
});

async function nextRequestCode(sql: ReturnType<typeof getSql>, laboratoryId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await sql`
    SELECT request_code FROM controlled_usage_requests
    WHERE laboratory_id = ${laboratoryId} AND request_code LIKE ${`AU-${year}-%`}
  `;
  return computeNextRequestCode(rows.map((row) => String(row.request_code)), year);
}

function isDuplicateCode(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("23505") || text.includes("duplicate key") || text.includes("request_code");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) {
    return NextResponse.json({ message: "No tienes permiso para consultar autorizaciones de reactivos controlados." }, { status: 403 });
  }
  const canAuthorize = canAuthorizeControlled(session);
  const canRequest = hasPermission(session, "inventory.move");
  const canManagePolicy = hasPermission(session, "configuration.manage");
  if (!hasDatabase()) {
    return NextResponse.json({ data: [], canAuthorize, canRequest, canManagePolicy, pendingCount: 0, policy: DEFAULT_CONTROLLED_POLICY, mode: "demo" });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  const itemIdParam = url.searchParams.get("itemId");
  const usableOnly = url.searchParams.get("usable") === "1";
  if (itemIdParam && !databaseIdSchema.safeParse(itemIdParam).success) {
    return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  }

  const sql = getSql();
  try {
    const policy = await loadControlledPolicy(session.laboratoryId);
    // Quien no autoriza solo ve lo suyo. La bandeja (scope=inbox) es de quien
    // autoriza; para el resto se comporta como "mis solicitudes".
    const onlyMine = !canAuthorize || scope === "mine";
    const rows = await sql`
      SELECT r.id, r.request_code, r.inventory_item_id, r.quantity, r.unit, r.status,
        r.used_by_person, r.usage_area, r.usage_purpose, r.planned_for, r.notes,
        r.approved_quantity, r.expires_at, r.review_note, r.reviewed_at,
        r.consumed_at, r.consumed_quantity, r.consumed_movement_id, r.created_at,
        r.requested_by, r.reviewed_by,
        i.sku, i.name AS item_name, i.control_kind, i.quantity AS item_quantity, i.unit AS item_unit,
        rq.full_name AS requested_by_name, rv.full_name AS reviewed_by_name
      FROM controlled_usage_requests r
      JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
      LEFT JOIN users rq ON rq.id = r.requested_by
      LEFT JOIN users rv ON rv.id = r.reviewed_by
      WHERE r.laboratory_id = ${session.laboratoryId}
        AND (${onlyMine}::boolean = FALSE OR r.requested_by = ${session.userId})
        AND (${itemIdParam}::uuid IS NULL OR r.inventory_item_id = ${itemIdParam}::uuid)
        AND (${scope === "inbox"}::boolean = FALSE OR r.status = 'PENDING')
        AND (${usableOnly}::boolean = FALSE OR (r.status = 'APPROVED' AND r.consumed_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > now())))
      ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC
      LIMIT 300
    `;
    const pendingCount = canAuthorize
      ? Number(
          (
            await sql`
              SELECT count(*)::int AS total FROM controlled_usage_requests
              WHERE laboratory_id = ${session.laboratoryId} AND status = 'PENDING'
            `
          )[0]?.total ?? 0,
        )
      : 0;
    return NextResponse.json({ data: rows, canAuthorize, canRequest, canManagePolicy, pendingCount, policy, mode: "database" });
  } catch (error) {
    if (isMissingAuthorizationMigration(error)) {
      return NextResponse.json({ data: [], canAuthorize, canRequest, canManagePolicy, pendingCount: 0, policy: DEFAULT_CONTROLLED_POLICY, mode: "pending-migration" });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  // Quien registra movimientos es quien va a consumir el reactivo y, por tanto,
  // quien solicita la autorización.
  if (!hasPermission(session, "inventory.move")) {
    return NextResponse.json({ message: "No tienes permiso para solicitar el uso de reactivos controlados." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Completa la solicitud: reactivo, cantidad, quién lo usará, área o proyecto y finalidad de uso.",
        issues: parsed.error.issues,
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  const signaturePolicy = await loadSignaturePolicy(session.laboratoryId);
  if (signaturePolicy.controlledRequest && !payload.signaturePassword) {
    return NextResponse.json(
      { success: false, error: "SIGNATURE_REQUIRED", message: "Esta solicitud debe ir firmada. Confirma tu contraseña para firmarla." },
      { status: 400 },
    );
  }

  if (!hasDatabase()) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), request_code: "AU-DEMO-001", status: "PENDING", ...payload, signaturePassword: undefined }, mode: "demo" }, { status: 201 });
  }

  const sql = getSql();
  try {
    const items = await sql`
      SELECT id, sku, name, quantity, unit, is_controlled, control_kind
      FROM inventory_items
      WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'
      LIMIT 1
    `;
    const item = items[0] as Record<string, unknown> | undefined;
    if (!item) return NextResponse.json({ message: "Reactivo no encontrado." }, { status: 404 });
    if (!item.is_controlled) {
      return NextResponse.json({ message: "Este reactivo no está marcado como controlado: su consumo no requiere autorización previa." }, { status: 400 });
    }

    // La cantidad se guarda siempre en la unidad del artículo para que el
    // consumo posterior no tenga ambigüedad.
    const itemUnit = String(item.unit ?? "unidades");
    let quantity = payload.quantity;
    if (payload.unit && payload.unit.trim() && payload.unit.trim() !== itemUnit) {
      const converted = convertQuantity(payload.quantity, payload.unit, itemUnit);
      if (converted === null) {
        return NextResponse.json({ message: `La unidad "${payload.unit}" no es compatible con la unidad del reactivo (${itemUnit}).` }, { status: 400 });
      }
      if (converted <= 0) {
        return NextResponse.json({ message: `La cantidad convertida a ${itemUnit} es demasiado pequeña para registrarse.` }, { status: 400 });
      }
      quantity = converted;
    }
    const available = Number(item.quantity);
    if (quantity > available) {
      return NextResponse.json({ message: `La cantidad solicitada (${quantity} ${itemUnit}) supera la existencia disponible (${available} ${itemUnit}).` }, { status: 400 });
    }

    // El folio se calcula y reintenta: dos solicitudes simultáneas podrían
    // pedir el mismo correlativo y la restricción única lo rechazaría.
    let created: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
      const requestCode = await nextRequestCode(sql, session.laboratoryId);
      try {
        const rows = await sql`
          INSERT INTO controlled_usage_requests (
            laboratory_id, request_code, inventory_item_id, quantity, unit,
            used_by_person, usage_area, usage_purpose, planned_for, notes, requested_by
          ) VALUES (
            ${session.laboratoryId}, ${requestCode}, ${payload.inventoryItemId}, ${quantity}, ${itemUnit},
            ${payload.usedByPerson.trim()}, ${payload.usageArea.trim()}, ${payload.usagePurpose.trim()},
            ${payload.plannedFor ?? null}, ${payload.notes?.trim() || null}, ${session.userId}
          ) RETURNING *
        `;
        created = rows[0] as Record<string, unknown>;
      } catch (error) {
        if (attempt === 4 || !isDuplicateCode(error)) throw error;
      }
    }
    if (!created) {
      return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible generar el folio de la solicitud. Intenta nuevamente." }, { status: 500 });
    }

    if (payload.signaturePassword) {
      const signature = await signRecord(session, {
        password: payload.signaturePassword,
        entityType: "controlled_usage_request",
        entityId: String(created.id),
        meaning: "REQUEST",
        content: {
          requestCode: created.request_code, sku: item.sku, quantity, unit: itemUnit,
          usedByPerson: payload.usedByPerson.trim(), usageArea: payload.usageArea.trim(), usagePurpose: payload.usagePurpose.trim(),
        },
        request,
      });
      if (!signature.ok) {
        // La solicitud no puede quedar circulando sin la firma de quien la pide.
        await sql`DELETE FROM controlled_usage_requests WHERE id = ${String(created.id)} AND laboratory_id = ${session.laboratoryId} AND status = 'PENDING'`;
        return NextResponse.json({ success: false, error: "SIGNATURE_FAILED", message: signature.message }, { status: signature.status });
      }
      if (signature.signatureId) {
        await sql`UPDATE controlled_usage_requests SET request_signature_id = ${signature.signatureId} WHERE id = ${String(created.id)} AND laboratory_id = ${session.laboratoryId}`;
      }
    }

    await writeAuditEvent(session, {
      action: "CONTROLLED_USAGE_REQUESTED",
      entityType: "controlled_usage_request",
      entityId: String(created.id),
      newValue: created,
      reason: `Solicitud de uso de reactivo controlado: ${payload.usagePurpose.trim()}`,
      metadata: { itemId: payload.inventoryItemId, sku: item.sku, quantity, unit: itemUnit },
      request,
    });

    dispatchPush(notifyControlledRequest(session, {
      requestId: String(created.id),
      itemName: String(item.name ?? "reactivo controlado"),
      quantity,
      unit: itemUnit,
      purpose: payload.usagePurpose.trim(),
    }));

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    if (isMissingAuthorizationMigration(error)) {
      return NextResponse.json({ message: "La autorización digital de reactivos controlados estará disponible al aplicar la actualización de base de datos (migración 0020)." }, { status: 503 });
    }
    console.error("[api/inventory/controlled/requests] POST", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible crear la solicitud. Intenta nuevamente." }, { status: 500 });
  }
}
