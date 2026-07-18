import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

// Recuperación de descartes hechos por error (§retro cliente): quien descartó
// puede solicitar regresar la existencia y un administrador aprueba o rechaza
// desde la bitácora. La aprobación crea un movimiento RETURN compensatorio.

const createSchema = z.object({
  movementId: databaseIdSchema,
  reason: z.string().min(3).max(500),
});

function isMissingMigration(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("inventory_restore_requests") || text.includes("42P01");
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar solicitudes." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const canReview = hasPermission(session, "configuration.manage");
  try {
    const rows = canReview
      ? await sql`
        SELECT r.*, i.sku, i.name AS item_name, i.unit, i.status AS item_status,
          ru.full_name AS requested_by_name, rv.full_name AS reviewed_by_name,
          m.quantity_delta, m.performed_at AS discarded_at, m.note AS discard_note
        FROM inventory_restore_requests r
        JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
        JOIN inventory_movements m ON m.id = r.movement_id AND m.laboratory_id = r.laboratory_id
        LEFT JOIN users ru ON ru.id = r.requested_by
        LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.laboratory_id = ${session.laboratoryId}
        ORDER BY r.created_at DESC LIMIT 200`
      : await sql`
        SELECT r.*, i.sku, i.name AS item_name, i.unit, i.status AS item_status,
          ru.full_name AS requested_by_name, rv.full_name AS reviewed_by_name,
          m.quantity_delta, m.performed_at AS discarded_at, m.note AS discard_note
        FROM inventory_restore_requests r
        JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
        JOIN inventory_movements m ON m.id = r.movement_id AND m.laboratory_id = r.laboratory_id
        LEFT JOIN users ru ON ru.id = r.requested_by
        LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.laboratory_id = ${session.laboratoryId} AND r.requested_by = ${session.userId}
        ORDER BY r.created_at DESC LIMIT 200`;
    return NextResponse.json({ data: rows, canReview, mode: "database" });
  } catch (error) {
    if (isMissingMigration(error)) return NextResponse.json({ data: [], canReview, mode: "pending-migration" });
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.move")) return NextResponse.json({ message: "No tienes permiso para solicitar recuperaciones." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Indica el descarte y el motivo de la recuperación.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...parsed.data }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  try {
    const movements = await sql`
      SELECT m.id, m.inventory_item_id, m.movement_type, m.quantity_delta
      FROM inventory_movements m
      WHERE m.id = ${parsed.data.movementId} AND m.laboratory_id = ${session.laboratoryId}
      LIMIT 1`;
    const movement = movements[0] as { id: string; inventory_item_id: string; movement_type: string; quantity_delta: number } | undefined;
    if (!movement) return NextResponse.json({ message: "Movimiento no encontrado." }, { status: 404 });
    if (String(movement.movement_type) !== "DISPOSAL") return NextResponse.json({ message: "Solo los descartes pueden recuperarse." }, { status: 400 });

    const existing = await sql`SELECT id, status FROM inventory_restore_requests WHERE movement_id = ${movement.id} LIMIT 1`;
    if (existing.length > 0) return NextResponse.json({ message: "Este descarte ya tiene una solicitud de recuperación." }, { status: 409 });

    const quantity = Math.abs(Number(movement.quantity_delta));
    const rows = await sql`
      INSERT INTO inventory_restore_requests (laboratory_id, inventory_item_id, movement_id, quantity, reason, requested_by)
      VALUES (${session.laboratoryId}, ${movement.inventory_item_id}, ${movement.id}, ${quantity}, ${parsed.data.reason}, ${session.userId})
      RETURNING *`;
    await writeAuditEvent(session, {
      action: "INVENTORY_RESTORE_REQUESTED",
      entityType: "inventory_restore_request",
      entityId: String(rows[0].id),
      newValue: rows[0],
      reason: parsed.data.reason,
      metadata: { movementId: movement.id, quantity },
      request,
    });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    if (isMissingMigration(error)) return NextResponse.json({ message: "La recuperación de descartes estará disponible al aplicar la actualización de base de datos (migración 0017)." }, { status: 503 });
    throw error;
  }
}
