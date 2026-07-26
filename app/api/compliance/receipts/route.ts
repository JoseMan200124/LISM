import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { createOpaqueToken } from "@/lib/qr-security";
import { COMPLIANCE_CODE_PREFIX, isRegulated, missingReceiptFields, permitCovers } from "@/lib/compliance-reagents";
import { computeNextCode } from "@/lib/research";

// Recepción de una entrada: el papeleo que exige la autoridad (proveedor,
// factura, orden de compra, licencia, permiso y responsable que recibió) más el
// movimiento que suma la existencia.
//
// La recepción puede crear un frasco nuevo con su etiqueta QR o sumar a un lote
// que ya existe. En ambos casos el saldo lo calcula el trigger de
// inventory_movements: aquí no se toca `quantity` a mano.

const createSchema = z.object({
  // Destino: un lote existente o uno nuevo a partir del catálogo.
  inventoryItemId: databaseIdSchema.optional(),
  catalogId: databaseIdSchema.optional(),
  newItem: z.object({
    sku: z.string().min(2).max(80),
    name: z.string().min(2).max(180),
    categoryName: z.string().min(2).max(120),
    unit: z.string().min(1).max(40),
    storageLocationName: z.string().max(160).optional(),
    reorderPoint: z.coerce.number().nonnegative().optional(),
  }).optional(),
  // Papeleo
  vendor: z.string().min(1).max(200),
  invoiceNumber: z.string().min(1).max(120),
  purchaseOrderNumber: z.string().max(120).optional(),
  licenseNumber: z.string().max(120).optional(),
  permitNumber: z.string().max(120).optional(),
  permitId: databaseIdSchema.optional().nullable(),
  purchaseRequestId: databaseIdSchema.optional().nullable(),
  lotNumber: z.string().max(100).optional(),
  receivedQuantity: z.coerce.number().positive(),
  unit: z.string().max(40).optional(),
  unitPrice: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().max(10).optional(),
  receivedOn: z.string().date(),
  expiresOn: z.string().date().optional().nullable(),
  receivedByName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
}).refine((value) => value.inventoryItemId || value.newItem, {
  message: "Indica el lote que recibe la entrada o los datos del envase nuevo.",
  path: ["inventoryItemId"],
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasAnyPermission(session, ["inventory.view", "purchasing.view"])) {
    return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const itemId = new URL(request.url).searchParams.get("itemId");
  const sql = getSql();
  const rows = await sql`
    SELECT r.id, r.receipt_code, r.vendor, r.invoice_number, r.purchase_order_number,
           r.license_number, r.permit_number, r.lot_number, r.received_quantity, r.unit,
           r.received_on, r.expires_on, r.notes, r.created_at,
           i.sku, i.name AS item_name, c.name AS catalog_name, c.category,
           COALESCE(u.full_name, r.received_by_name) AS received_by_name,
           (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'inventory_receipt' AND a.entity_id = r.id) AS document_count
    FROM inventory_receipts r
    LEFT JOIN inventory_items i ON i.id = r.inventory_item_id
    LEFT JOIN reagent_catalog c ON c.id = r.catalog_id
    LEFT JOIN users u ON u.id = r.received_by
    WHERE r.laboratory_id = ${session.laboratoryId}
      AND (${itemId ?? null}::uuid IS NULL OR r.inventory_item_id = ${itemId ?? null}::uuid)
    ORDER BY r.received_on DESC, r.created_at DESC
    LIMIT 300
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) {
    return NextResponse.json({ message: "No tienes permiso para registrar entradas de inventario." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos de la entrada.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();

  // Clasificación: decide qué papeleo es obligatorio.
  let catalog: Record<string, unknown> | null = null;
  if (payload.catalogId) {
    const rows = await sql`SELECT * FROM reagent_catalog WHERE id = ${payload.catalogId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    catalog = (rows[0] as Record<string, unknown>) ?? null;
    if (!catalog) return NextResponse.json({ message: "El reactivo del catálogo no existe en este laboratorio." }, { status: 404 });
  }

  let item: Record<string, unknown> | null = null;
  if (payload.inventoryItemId) {
    const rows = await sql`
      SELECT i.*, c.category AS catalog_category
      FROM inventory_items i LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
      WHERE i.id = ${payload.inventoryItemId} AND i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE' LIMIT 1
    `;
    item = (rows[0] as Record<string, unknown>) ?? null;
    if (!item) return NextResponse.json({ message: "El lote indicado no existe o está archivado." }, { status: 404 });
  }

  const controlled = Boolean(
    (catalog && isRegulated(String(catalog.category))) ||
    (item && (item.is_controlled || isRegulated(String(item.catalog_category ?? "")))),
  );

  const missing = missingReceiptFields(payload as unknown as Record<string, unknown>, controlled);
  if (missing.length > 0) {
    return NextResponse.json(
      { success: false, error: "MISSING_RECEIPT_FIELDS", message: `Faltan datos obligatorios de la recepción: ${missing.join(", ")}.`, fields: missing },
      { status: 400 },
    );
  }

  // Si se declara un permiso, tiene que estar vigente: recibir material
  // controlado al amparo de una licencia vencida es justo lo que se sanciona.
  if (payload.permitId) {
    const permits = await sql`SELECT status, expires_on, permit_number FROM regulatory_permits WHERE id = ${payload.permitId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    const permit = permits[0] as { status: string; expires_on: string | null; permit_number: string } | undefined;
    if (!permit) return NextResponse.json({ message: "El permiso indicado no existe." }, { status: 404 });
    if (!permitCovers(permit)) {
      return NextResponse.json(
        { success: false, error: "PERMIT_NOT_VALID", message: `El permiso ${permit.permit_number} no está vigente: no puede amparar esta entrada.` },
        { status: 409 },
      );
    }
  }

  const unit = payload.unit || String(item?.unit ?? "unidades");

  // Envase nuevo: se crea el lote con su etiqueta QR y hereda del catálogo.
  if (!item && payload.newItem) {
    const categories = await sql`
      INSERT INTO inventory_categories (laboratory_id, code, name)
      VALUES (${session.laboratoryId}, ${payload.newItem.categoryName.slice(0, 40).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}, ${payload.newItem.categoryName})
      ON CONFLICT (laboratory_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
      RETURNING id
    `;
    let storageLocationId: string | null = null;
    if (payload.newItem.storageLocationName) {
      const locations = await sql`
        INSERT INTO storage_locations (laboratory_id, code, name)
        VALUES (${session.laboratoryId}, ${payload.newItem.storageLocationName.slice(0, 50).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}, ${payload.newItem.storageLocationName})
        ON CONFLICT (laboratory_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
        RETURNING id
      `;
      storageLocationId = String(locations[0].id);
    }
    const created = await sql`
      INSERT INTO inventory_items (
        laboratory_id, category_id, storage_location_id, catalog_id, sku, name, vendor, lot_number,
        quantity, initial_quantity, reorder_point, unit, expires_at, received_at, cas_number,
        item_type, is_controlled, control_kind, requires_usage_log, hazard_pictograms, hazard_statements,
        safety_sheet_url, storage_conditions, created_by
      ) VALUES (
        ${session.laboratoryId}, ${String(categories[0].id)}, ${storageLocationId}, ${payload.catalogId ?? null},
        ${payload.newItem.sku}, ${payload.newItem.name}, ${payload.vendor}, ${payload.lotNumber ?? ""},
        0, ${payload.receivedQuantity}, ${payload.newItem.reorderPoint ?? 0}, ${payload.newItem.unit},
        ${payload.expiresOn ?? null}, ${payload.receivedOn}, ${catalog?.cas_number ?? null},
        'REAGENT', ${controlled}, ${controlled ? (catalog?.category === "PRECURSOR" ? "PRECURSOR" : "DUAL_USE") : null}, ${controlled},
        ${JSON.stringify(catalog?.hazard_pictograms ?? [])}::jsonb, ${catalog?.hazard_statements ?? null},
        ${catalog?.sds_url ?? null}, ${catalog?.storage_conditions ?? null}, ${session.userId}
      ) RETURNING *
    `;
    item = created[0] as Record<string, unknown>;
    await sql`
      INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
      VALUES (${session.laboratoryId}, 'INVENTORY_ITEM', ${String(item.id)}, ${createOpaqueToken()}, ${payload.newItem.sku})
      ON CONFLICT (laboratory_id, entity_type, entity_id) DO UPDATE SET status = 'ACTIVE'
    `;
  }

  // El movimiento de entrada: es lo que suma la existencia y alimenta el kardex.
  const movements = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
      performed_by, responsible_user_id, reason_code, reference_type
    ) VALUES (
      ${session.laboratoryId}, ${String(item!.id)}, 'RECEIPT', ${payload.receivedQuantity},
      ${`Factura ${payload.invoiceNumber} · ${payload.vendor}${payload.lotNumber ? ` · lote ${payload.lotNumber}` : ""}`},
      ${session.userId}, ${session.userId}, 'RECEPCION', 'inventory_receipt'
    ) RETURNING id, previous_quantity, resulting_quantity
  `;

  const year = new Date().getFullYear();
  const existingCodes = await sql`
    SELECT receipt_code AS code FROM inventory_receipts
    WHERE laboratory_id = ${session.laboratoryId} AND receipt_code LIKE ${`${COMPLIANCE_CODE_PREFIX.receipt}-${year}-%`}
  `;
  const receiptCode = computeNextCode((existingCodes as Array<{ code: string }>).map((row) => String(row.code)), COMPLIANCE_CODE_PREFIX.receipt, year, 4);

  const receipts = await sql`
    INSERT INTO inventory_receipts (
      laboratory_id, receipt_code, inventory_item_id, catalog_id, purchase_request_id, movement_id,
      vendor, invoice_number, purchase_order_number, license_number, permit_number, permit_id,
      lot_number, received_quantity, unit, unit_price, currency, received_on, expires_on,
      received_by, received_by_name, notes, created_by
    ) VALUES (
      ${session.laboratoryId}, ${receiptCode}, ${String(item!.id)}, ${payload.catalogId ?? item!.catalog_id ?? null},
      ${payload.purchaseRequestId ?? null}, ${String(movements[0].id)},
      ${payload.vendor}, ${payload.invoiceNumber}, ${payload.purchaseOrderNumber ?? null},
      ${payload.licenseNumber ?? null}, ${payload.permitNumber ?? null}, ${payload.permitId ?? null},
      ${payload.lotNumber ?? null}, ${payload.receivedQuantity}, ${unit}, ${payload.unitPrice ?? null},
      ${payload.currency ?? null}, ${payload.receivedOn}, ${payload.expiresOn ?? null},
      ${session.userId}, ${payload.receivedByName ?? session.name}, ${payload.notes ?? null}, ${session.userId}
    ) RETURNING *
  `;

  // La solicitud de compra queda cerrada como recibida, con quién la recibió.
  if (payload.purchaseRequestId) {
    await sql`
      UPDATE purchase_requests SET
        status = 'RECEIVED', received_by = ${session.userId}, received_at = now(),
        invoice_number = COALESCE(${payload.invoiceNumber}, invoice_number),
        purchase_order_number = COALESCE(${payload.purchaseOrderNumber ?? null}, purchase_order_number),
        license_number = COALESCE(${payload.licenseNumber ?? null}, license_number),
        permit_number = COALESCE(${payload.permitNumber ?? null}, permit_number),
        updated_at = now()
      WHERE id = ${payload.purchaseRequestId} AND laboratory_id = ${session.laboratoryId}
    `;
  }

  await writeAuditEvent(session, {
    action: "INVENTORY_RECEIPT_REGISTERED",
    entityType: "inventory_receipt",
    entityId: String(receipts[0].id),
    newValue: { ...receipts[0], previousQuantity: movements[0].previous_quantity, resultingQuantity: movements[0].resulting_quantity },
    reason: `Entrada ${receiptCode}: ${payload.receivedQuantity} ${unit} de ${payload.vendor} (factura ${payload.invoiceNumber})`,
    metadata: { controlled, itemId: String(item!.id) },
    request,
  });

  return NextResponse.json({ data: { ...receipts[0], inventory_item_id: item!.id, sku: item!.sku } }, { status: 201 });
}
