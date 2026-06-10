import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { inventoryRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const inventorySchema = z.object({
  sku: z.string().min(2).max(80),
  name: z.string().min(2).max(180),
  categoryId: databaseIdSchema,
  storageLocationId: databaseIdSchema.optional().nullable(),
  lotNumber: z.string().max(100).optional().default(""),
  quantity: z.coerce.number().nonnegative(),
  reorderPoint: z.coerce.number().nonnegative().default(0),
  unit: z.string().min(1).max(40),
  expiresAt: z.string().date().optional().nullable(),
});

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

  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...parsed.data, mode: "demo" } }, { status: 201 });

  const sql = getSql();
  const payload = parsed.data;
  const rows = await sql`
    INSERT INTO inventory_items (
      laboratory_id, category_id, storage_location_id, sku, name, lot_number,
      quantity, reorder_point, unit, expires_at, created_by
    ) VALUES (
      ${session.laboratoryId}, ${payload.categoryId}, ${payload.storageLocationId ?? null}, ${payload.sku}, ${payload.name}, ${payload.lotNumber},
      ${payload.quantity}, ${payload.reorderPoint}, ${payload.unit}, ${payload.expiresAt ?? null}, ${session.userId}
    )
    RETURNING id, sku, name, quantity, reorder_point, unit, status
  `;

  await writeAuditEvent(session, {
    action: "INVENTORY_ITEM_CREATED",
    entityType: "inventory_item",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Alta de lote de inventario",
    metadata: { sku: payload.sku },
    request,
  });

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
