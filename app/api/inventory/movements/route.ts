import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { inventoryMovements } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  inventoryItemId: databaseIdSchema,
  movementType: z.enum(["RECEIPT", "CONSUMPTION", "ADJUSTMENT", "TRANSFER", "DISPOSAL"]),
  quantity: z.coerce.number().positive(),
  direction: z.enum(["IN", "OUT"]).optional(),
  reasonCode: z.string().min(2).max(80),
  note: z.string().max(1000).optional().default(""),
  referenceType: z.string().max(80).optional(),
  referenceId: databaseIdSchema.optional(),
  fromLocationId: databaseIdSchema.optional(),
  toLocationId: databaseIdSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.movementType === "TRANSFER" && (!value.fromLocationId || !value.toLocationId || value.fromLocationId === value.toLocationId)) {
    ctx.addIssue({ code: "custom", path: ["toLocationId"], message: "La transferencia requiere ubicaciones de origen y destino diferentes." });
  }
});

function signedQuantity(payload: z.infer<typeof schema>) {
  if (payload.movementType === "RECEIPT") return payload.quantity;
  if (payload.movementType === "ADJUSTMENT") return payload.direction === "IN" ? payload.quantity : -payload.quantity;
  if (payload.movementType === "TRANSFER") return 0;
  return -payload.quantity;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar movimientos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: inventoryMovements, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT m.id, i.sku, i.name, i.lot_number, m.movement_type, m.quantity_delta,
      m.previous_quantity, m.resulting_quantity, m.reason_code, m.note,
      u.full_name AS performed_by, m.performed_at
    FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
    LEFT JOIN users u ON u.id = m.performed_by
    WHERE m.laboratory_id = ${session.laboratoryId}
    ORDER BY m.performed_at DESC LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.move")) return NextResponse.json({ message: "No tienes permiso para registrar movimientos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Movimiento inválido.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  const quantityDelta = signedQuantity(payload);

  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, quantityDelta }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const items = await sql`SELECT id, sku, name, quantity, requires_usage_log, storage_location_id FROM inventory_items WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'`;
  const item = items[0] as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });
  if (item.requires_usage_log && payload.movementType === "CONSUMPTION" && payload.note.trim().length < 3) {
    return NextResponse.json({ message: "Este reactivo requiere indicar el uso o práctica relacionada." }, { status: 400 });
  }
  if (payload.movementType === "TRANSFER") {
    const locations = await sql`SELECT id FROM storage_locations WHERE laboratory_id = ${session.laboratoryId} AND id = ANY(${[payload.fromLocationId!, payload.toLocationId!]})`;
    if (locations.length !== 2 || String(item.storage_location_id ?? "") !== payload.fromLocationId) return NextResponse.json({ message: "Verifica la ubicación actual y la ubicación de destino." }, { status: 400 });
    if (payload.quantity > Number(item.quantity)) return NextResponse.json({ message: "La cantidad a transferir supera la existencia." }, { status: 400 });
  }
  const rows = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
      performed_by, responsible_user_id, reference_type, reference_id, reason_code, from_location_id, to_location_id, transferred_quantity
    ) VALUES (
      ${session.laboratoryId}, ${payload.inventoryItemId}, ${payload.movementType}, ${quantityDelta}, ${payload.note},
      ${session.userId}, ${session.userId}, ${payload.referenceType ?? null}, ${payload.referenceId ?? null}, ${payload.reasonCode}, ${payload.fromLocationId ?? null}, ${payload.toLocationId ?? null}, ${payload.movementType === "TRANSFER" ? payload.quantity : null}
    ) RETURNING *
  `;
  if (payload.movementType === "TRANSFER") await sql`UPDATE inventory_items SET storage_location_id = ${payload.toLocationId!}, updated_at = now() WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId}`;
  await writeAuditEvent(session, { action: "INVENTORY_MOVEMENT_CREATED", entityType: "inventory_item", entityId: payload.inventoryItemId, previousValue: { quantity: rows[0].previous_quantity }, newValue: { quantity: rows[0].resulting_quantity }, reason: payload.note || payload.reasonCode, metadata: { movementId: rows[0].id, movementType: payload.movementType }, request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
