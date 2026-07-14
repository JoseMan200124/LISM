import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { inventoryRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { createDemoQrLabel, createOpaqueToken } from "@/lib/qr-security";
import { missingRequiredFields, type CustomFieldDefinition } from "@/lib/custom-fields";

const inventorySchema = z.object({
  sku: z.string().min(2).max(80),
  name: z.string().min(2).max(180),
  categoryId: databaseIdSchema.optional(),
  categoryName: z.string().min(2).max(120).optional(),
  storageLocationId: databaseIdSchema.optional().nullable(),
  storageLocationName: z.string().min(2).max(160).optional(),
  lotNumber: z.string().max(100).optional().default(""),
  quantity: z.coerce.number().nonnegative(),
  reorderPoint: z.coerce.number().nonnegative().default(0),
  unit: z.string().min(1).max(40),
  expiresAt: z.string().date().optional().nullable(),
  receivedAt: z.string().date().optional().nullable(),
  vendor: z.string().max(180).optional().default(""),
  internalFormula: z.string().max(220).optional().default(""),
  safetySheetUrl: z.string().url().optional().or(z.literal("")),
  // No se fuerza a true (§3.6): el control de consumo es opcional por artículo.
  // La UI decide el valor por defecto según el tipo (reactivo/medio -> true).
  requiresUsageLog: z.boolean().optional().default(false),
  customValues: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.categoryId || value.categoryName, {
  message: "Debes indicar la categoría mediante categoryId o categoryName.",
  path: ["categoryId"],
});

function catalogCode(prefix: string, value: string, maximumLength: number) {
  const simplified = value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${prefix}-${simplified || "GENERAL"}`.slice(0, maximumLength);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar inventario." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: inventoryRows, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      i.id,
      i.sku,
      i.name,
      c.name AS category,
      i.lot_number,
      COALESCE(l.name, 'Sin ubicación') AS location,
      i.quantity,
      i.reorder_point,
      i.unit,
      i.expires_at,
      i.custom_values,
      CASE
        WHEN i.quantity <= i.reorder_point THEN 'REORDER'
        WHEN i.expires_at IS NOT NULL AND i.expires_at <= current_date + interval '30 day' THEN 'WATCH'
        ELSE 'AVAILABLE'
      END AS status
    FROM inventory_items i
    JOIN inventory_categories c ON c.id = i.category_id AND c.laboratory_id = i.laboratory_id
    LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
    WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
    ORDER BY i.name ASC
  `;

  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "No tienes permiso para crear lotes de inventario." }, { status: 403 });

  const parsed = inventorySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de inventario inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) {
    const id = crypto.randomUUID();
    const location = payload.storageLocationName || "Sin ubicación";
    const label = createDemoQrLabel({
      entityType: "INVENTORY_ITEM",
      entityId: id,
      labelCode: payload.sku,
      displayName: payload.name,
      location,
      status: payload.quantity <= payload.reorderPoint ? "Reponer" : "Disponible",
      summary: [
        { label: "Categoría", value: payload.categoryName || "Inventario" },
        { label: "Fórmula", value: payload.internalFormula || "No registrada" },
        { label: "Lote", value: payload.lotNumber || "Sin lote" },
        { label: "Existencia", value: `${payload.quantity} ${payload.unit}` },
        { label: "Stock mínimo", value: `${payload.reorderPoint} ${payload.unit}` },
        { label: "Vencimiento", value: payload.expiresAt || "Sin vencimiento" },
      ],
    });
    return NextResponse.json({ data: { id, ...payload, qrIdentifierId: label.id, qrToken: label.opaqueToken, mode: "demo" } }, { status: 201 });
  }

  const sql = getSql();

  // Valida en servidor los campos personalizados obligatorios del módulo (§3.7).
  const defs = await sql`
    SELECT field_key, required_mode, status FROM custom_field_definitions
    WHERE laboratory_id = ${session.laboratoryId} AND module_key = 'inventory' AND status = 'ACTIVE'
  ` as unknown as CustomFieldDefinition[];
  const missing = missingRequiredFields(defs, payload.customValues);
  if (missing.length > 0) {
    return NextResponse.json({ success: false, error: "MISSING_CUSTOM_FIELDS", message: "Faltan campos personalizados obligatorios.", fields: missing }, { status: 400 });
  }
  const customValues = payload.customValues ?? {};

  let categoryId = payload.categoryId;
  if (!categoryId && payload.categoryName) {
    const categories = await sql`
      INSERT INTO inventory_categories (laboratory_id, code, name)
      VALUES (${session.laboratoryId}, ${catalogCode("CAT", payload.categoryName, 50)}, ${payload.categoryName})
      ON CONFLICT (laboratory_id, code)
      DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
      RETURNING id
    `;
    categoryId = String(categories[0].id);
  }

  let storageLocationId = payload.storageLocationId;
  if (!storageLocationId && payload.storageLocationName) {
    const locations = await sql`
      INSERT INTO storage_locations (laboratory_id, code, name)
      VALUES (${session.laboratoryId}, ${catalogCode("UBI", payload.storageLocationName, 60)}, ${payload.storageLocationName})
      ON CONFLICT (laboratory_id, code)
      DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
      RETURNING id
    `;
    storageLocationId = String(locations[0].id);
  }

  const rows = await sql`
    INSERT INTO inventory_items (
      laboratory_id, category_id, storage_location_id, sku, name, vendor, lot_number,
      quantity, reorder_point, unit, expires_at, received_at, safety_sheet_url, internal_formula,
      requires_usage_log, custom_values, created_by
    ) VALUES (
      ${session.laboratoryId}, ${categoryId}, ${storageLocationId ?? null}, ${payload.sku}, ${payload.name}, ${payload.vendor || null}, ${payload.lotNumber},
      ${payload.quantity}, ${payload.reorderPoint}, ${payload.unit}, ${payload.expiresAt ?? null}, ${payload.receivedAt ?? null}, ${payload.safetySheetUrl || null}, ${payload.internalFormula || null},
      ${payload.requiresUsageLog}, ${JSON.stringify(customValues)}::jsonb, ${session.userId}
    )
    RETURNING id, sku, name, quantity, reorder_point, unit, status
  `;

  const qrRows = await sql`
    INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
    VALUES (${session.laboratoryId}, 'INVENTORY_ITEM', ${String(rows[0].id)}, ${createOpaqueToken()}, ${payload.sku})
    ON CONFLICT (laboratory_id, entity_type, entity_id)
    DO UPDATE SET status = 'ACTIVE'
    RETURNING id, opaque_token, label_code
  `;

  await writeAuditEvent(session, {
    action: "INVENTORY_ITEM_CREATED",
    entityType: "inventory_item",
    entityId: String(rows[0].id),
    newValue: { ...rows[0], qrIdentifierId: qrRows[0].id },
    reason: "Alta de lote de inventario con etiqueta QR segura",
    metadata: { sku: payload.sku, qrIdentifierId: qrRows[0].id },
    request,
  });

  return NextResponse.json({ data: { ...rows[0], qrIdentifierId: qrRows[0].id, qrToken: qrRows[0].opaque_token } }, { status: 201 });
}
