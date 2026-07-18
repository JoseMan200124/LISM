import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { inventoryMovements } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { convertQuantity } from "@/lib/units";

const schema = z.object({
  inventoryItemId: databaseIdSchema,
  movementType: z.enum(["RECEIPT", "CONSUMPTION", "ADJUSTMENT", "TRANSFER", "DISPOSAL"]),
  quantity: z.coerce.number().positive(),
  // Unidad en la que el usuario registró la cantidad. Si difiere de la unidad
  // del artículo, el servidor convierte (mL↔L, g↔kg, …) antes de descontar.
  unit: z.string().max(40).optional(),
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

function signedQuantity(quantity: number, payload: z.infer<typeof schema>) {
  if (payload.movementType === "RECEIPT") return quantity;
  if (payload.movementType === "ADJUSTMENT") return payload.direction === "IN" ? quantity : -quantity;
  if (payload.movementType === "TRANSFER") return 0;
  return -quantity;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar movimientos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: inventoryMovements, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT m.id, i.sku, i.name, i.lot_number, i.unit, m.movement_type, m.quantity_delta,
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

  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, quantityDelta: signedQuantity(payload.quantity, payload) }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const items = await sql`SELECT id, sku, name, quantity, unit, requires_usage_log, storage_location_id FROM inventory_items WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'`;
  const item = items[0] as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });
  if (item.requires_usage_log && payload.movementType === "CONSUMPTION" && payload.note.trim().length < 3) {
    return NextResponse.json({ message: "Este reactivo requiere indicar el uso o práctica relacionada." }, { status: 400 });
  }

  // Conversión de unidades: la cantidad puede venir en otra unidad compatible.
  const itemUnit = String(item.unit ?? "unidades");
  let quantity = payload.quantity;
  if (payload.unit && payload.unit.trim()) {
    const converted = convertQuantity(payload.quantity, payload.unit, itemUnit);
    if (converted === null) {
      return NextResponse.json({ message: `La unidad "${payload.unit}" no es compatible con la unidad del artículo (${itemUnit}).` }, { status: 400 });
    }
    if (converted <= 0) {
      return NextResponse.json({ message: `La cantidad convertida a ${itemUnit} es demasiado pequeña para registrarse.` }, { status: 400 });
    }
    quantity = converted;
  }
  const quantityDelta = signedQuantity(quantity, payload);

  // Validación amistosa de saldo: el trigger de la base también lo impide,
  // pero aquí se explica cuánto hay disponible y en qué unidad.
  const available = Number(item.quantity);
  if (quantityDelta < 0 && Math.abs(quantityDelta) > available) {
    return NextResponse.json({ message: `La cantidad supera la existencia disponible (${available} ${itemUnit}).` }, { status: 400 });
  }
  if (payload.movementType === "TRANSFER") {
    const locations = await sql`SELECT id FROM storage_locations WHERE laboratory_id = ${session.laboratoryId} AND id = ANY(${[payload.fromLocationId!, payload.toLocationId!]})`;
    if (locations.length !== 2 || String(item.storage_location_id ?? "") !== payload.fromLocationId) return NextResponse.json({ message: "Verifica la ubicación actual y la ubicación de destino." }, { status: 400 });
    if (quantity > available) return NextResponse.json({ message: `La cantidad a transferir supera la existencia (${available} ${itemUnit}).` }, { status: 400 });
  }
  const conversionNote = payload.unit && payload.unit.trim() && quantity !== payload.quantity
    ? `${payload.note ? `${payload.note} ` : ""}[Registrado: ${payload.quantity} ${payload.unit} = ${quantity} ${itemUnit}]`
    : payload.note;
  const rows = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
      performed_by, responsible_user_id, reference_type, reference_id, reason_code, from_location_id, to_location_id, transferred_quantity
    ) VALUES (
      ${session.laboratoryId}, ${payload.inventoryItemId}, ${payload.movementType}, ${quantityDelta}, ${conversionNote},
      ${session.userId}, ${session.userId}, ${payload.referenceType ?? null}, ${payload.referenceId ?? null}, ${payload.reasonCode}, ${payload.fromLocationId ?? null}, ${payload.toLocationId ?? null}, ${payload.movementType === "TRANSFER" ? quantity : null}
    ) RETURNING *
  `;
  if (payload.movementType === "TRANSFER") await sql`UPDATE inventory_items SET storage_location_id = ${payload.toLocationId!}, updated_at = now() WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId}`;
  await writeAuditEvent(session, { action: "INVENTORY_MOVEMENT_CREATED", entityType: "inventory_item", entityId: payload.inventoryItemId, previousValue: { quantity: rows[0].previous_quantity }, newValue: { quantity: rows[0].resulting_quantity }, reason: payload.note || payload.reasonCode, metadata: { movementId: rows[0].id, movementType: payload.movementType }, request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
