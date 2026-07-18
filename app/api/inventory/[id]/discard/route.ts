import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { missingControlledFields, controlledLogErrorMessage } from "@/lib/controlled-reagents";

// Descarte dedicado (§3.6): acción separada de consumo/ajuste. Registra un
// movimiento DISPOSAL con cantidad, motivo, fecha y observación; si se descarta
// toda la existencia, marca el lote como archivado (agotado). No crea filas nuevas.
const schema = z.object({
  quantity: z.coerce.number().positive(),
  reason: z.string().min(2).max(120),
  note: z.string().max(1000).optional().default(""),
  discardedAt: z.string().datetime({ offset: true }).optional(),
  // Registro de consumo obligatorio si el reactivo es controlado (doble uso /
  // precursor): un descarte también descuenta existencia.
  usageArea: z.string().max(200).optional(),
  usagePurpose: z.string().max(1000).optional(),
  usedByPerson: z.string().max(200).optional(),
  authorizedBy: z.string().max(200).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  // El descarte requiere permiso de gestión de inventario (no solo mover).
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "No tienes permiso para descartar inventario." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de descarte inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const items = await sql`SELECT id, sku, name, quantity, is_controlled FROM inventory_items WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
  const item = items[0] as { id: string; quantity: number; is_controlled?: boolean } | undefined;
  if (!item) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });
  if (payload.quantity > Number(item.quantity)) {
    return NextResponse.json({ success: false, error: "OVER_QUANTITY", message: `No puedes descartar más de la existencia actual (${item.quantity}).` }, { status: 400 });
  }
  // Un reactivo controlado tampoco puede descartarse (descontarse) sin el
  // registro de consumo con trazabilidad completa.
  if (item.is_controlled) {
    const missing = missingControlledFields({ usageArea: payload.usageArea, usagePurpose: payload.usagePurpose, usedByPerson: payload.usedByPerson });
    if (missing.length > 0) {
      return NextResponse.json({ success: false, error: "CONTROLLED_LOG_REQUIRED", message: controlledLogErrorMessage(missing), fields: missing }, { status: 400 });
    }
  }
  // El trigger de inventory_movements recalcula la existencia (quantity_delta negativo).
  const note = `Descarte: ${payload.reason}${payload.note ? ` — ${payload.note}` : ""}`;
  const rows = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note, performed_by, reason_code, performed_at,
      usage_area, usage_purpose, used_by_person, authorized_by
    ) VALUES (
      ${session.laboratoryId}, ${id}, 'DISPOSAL', ${-Math.abs(payload.quantity)}, ${note}, ${session.userId}, ${payload.reason}, ${payload.discardedAt ?? new Date().toISOString()},
      ${payload.usageArea?.trim() || null}, ${payload.usagePurpose?.trim() || null}, ${payload.usedByPerson?.trim() || null}, ${payload.authorizedBy?.trim() || null}
    ) RETURNING id, resulting_quantity
  `;
  const resulting = Number(rows[0].resulting_quantity);
  let archived = false;
  if (resulting <= 0) {
    await sql`UPDATE inventory_items SET status = 'ARCHIVED', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
    archived = true;
  }
  await writeAuditEvent(session, {
    action: "INVENTORY_ITEM_DISCARDED",
    entityType: "inventory_item",
    entityId: id,
    newValue: { movementId: rows[0].id, resultingQuantity: resulting, archived },
    reason: payload.reason,
    metadata: { quantity: payload.quantity },
    request,
  });
  return NextResponse.json({ data: { movementId: rows[0].id, resultingQuantity: resulting, archived } }, { status: 201 });
}
