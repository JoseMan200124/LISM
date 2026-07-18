import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

// Aprobación o rechazo de una solicitud de recuperación de descarte. Solo un
// administrador (configuration.manage) decide; aprobar crea un movimiento
// RETURN que regresa la cantidad descartada y reactiva el lote si quedó
// archivado por agotarse.

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().max(500).optional().default(""),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "Solo un administrador puede aprobar o rechazar recuperaciones." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });

  const sql = getSql();
  const requests = await sql`
    SELECT r.*, i.status AS item_status, i.sku, i.name AS item_name
    FROM inventory_restore_requests r
    JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
    WHERE r.id = ${id} AND r.laboratory_id = ${session.laboratoryId}
    LIMIT 1`;
  const restoreRequest = requests[0] as Record<string, unknown> | undefined;
  if (!restoreRequest) return NextResponse.json({ message: "Solicitud no encontrada." }, { status: 404 });
  if (String(restoreRequest.status) !== "PENDING") return NextResponse.json({ message: "Esta solicitud ya fue revisada." }, { status: 409 });

  if (parsed.data.action === "REJECT") {
    const rows = await sql`
      UPDATE inventory_restore_requests
      SET status = 'REJECTED', reviewed_by = ${session.userId}, reviewed_at = now(), review_note = ${parsed.data.note || null}
      WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
      RETURNING *`;
    await writeAuditEvent(session, {
      action: "INVENTORY_RESTORE_REJECTED",
      entityType: "inventory_restore_request",
      entityId: id,
      previousValue: restoreRequest,
      newValue: rows[0],
      reason: parsed.data.note || "Solicitud de recuperación rechazada",
      request,
    });
    return NextResponse.json({ data: rows[0] });
  }

  // Aprobación: si el lote quedó archivado por agotarse, se reactiva antes de
  // insertar el RETURN (el trigger de movimientos recalcula la existencia).
  const itemId = String(restoreRequest.inventory_item_id);
  const quantity = Math.abs(Number(restoreRequest.quantity));
  if (String(restoreRequest.item_status) === "ARCHIVED") {
    await sql`UPDATE inventory_items SET status = 'ACTIVE', updated_at = now() WHERE id = ${itemId} AND laboratory_id = ${session.laboratoryId}`;
  }
  const note = `Recuperación de descarte aprobada${parsed.data.note ? `: ${parsed.data.note}` : ""}`;
  const movements = await sql`
    INSERT INTO inventory_movements (laboratory_id, inventory_item_id, movement_type, quantity_delta, note, performed_by, responsible_user_id, reason_code)
    VALUES (${session.laboratoryId}, ${itemId}, 'RETURN', ${quantity}, ${note}, ${session.userId}, ${session.userId}, 'RESTORE_APPROVED')
    RETURNING id, previous_quantity, resulting_quantity`;
  const rows = await sql`
    UPDATE inventory_restore_requests
    SET status = 'APPROVED', reviewed_by = ${session.userId}, reviewed_at = now(),
      review_note = ${parsed.data.note || null}, restored_movement_id = ${String(movements[0].id)}
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *`;
  await writeAuditEvent(session, {
    action: "INVENTORY_RESTORE_APPROVED",
    entityType: "inventory_restore_request",
    entityId: id,
    previousValue: { quantity: movements[0].previous_quantity },
    newValue: { quantity: movements[0].resulting_quantity, movementId: movements[0].id },
    reason: parsed.data.note || "Recuperación de descarte aprobada",
    metadata: { itemId, sku: restoreRequest.sku },
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
