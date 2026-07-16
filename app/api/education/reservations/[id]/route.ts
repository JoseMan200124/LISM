import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

const schema = z.object({
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().min(1).max(40).optional(),
  neededAt: z.string().datetime({ offset: true }).nullable().optional(),
  status: z.enum(["PENDING", "APPROVED", "PREPARING", "READY", "PARTIAL", "REJECTED", "CONSUMED", "RETURNED", "CANCELLED"]).optional(),
  note: z.string().max(1000).optional(),
});

async function ownedReservation(id: string, laboratoryId: string, userId?: string) {
  const sql = getSql();
  return userId ? sql`SELECT r.* FROM resource_reservations r JOIN educational_practices ep ON ep.id = r.practice_id AND ep.laboratory_id = r.laboratory_id WHERE r.id = ${id} AND r.laboratory_id = ${laboratoryId} AND ep.teacher_user_id = ${userId} LIMIT 1`
    : sql`SELECT * FROM resource_reservations WHERE id = ${id} AND laboratory_id = ${laboratoryId} LIMIT 1`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  if (session.role === "STUDENT") return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const rows = await ownedReservation(id, session.laboratoryId, session.role === "PROFESSOR" ? session.userId : undefined);
  if (!rows.length) return NextResponse.json({ message: "Reserva no encontrada." }, { status: 404 });
  return NextResponse.json({ data: rows[0] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const previous = await ownedReservation(id, session.laboratoryId, session.role === "PROFESSOR" ? session.userId : undefined);
  if (!previous.length) return NextResponse.json({ message: "Reserva no encontrada." }, { status: 404 });
  const payload = parsed.data;
  const sql = getSql();
  const rows = await sql`UPDATE resource_reservations SET quantity = COALESCE(${payload.quantity ?? null}, quantity), unit = COALESCE(${payload.unit ?? null}, unit), needed_at = CASE WHEN ${payload.neededAt === undefined} THEN needed_at ELSE ${payload.neededAt ?? null} END, status = COALESCE(${payload.status ?? null}, status), notes = COALESCE(${payload.note ?? null}, notes), rejection_reason = CASE WHEN ${payload.status === "REJECTED"} THEN ${payload.note ?? null} ELSE rejection_reason END, approved_by = CASE WHEN ${payload.status === "APPROVED"} THEN ${session.userId} ELSE approved_by END, cancelled_at = CASE WHEN ${payload.status === "CANCELLED"} THEN now() ELSE cancelled_at END, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: "RESOURCE_RESERVATION_UPDATED", entityType: "resource_reservation", entityId: id, previousValue: previous[0], newValue: rows[0], reason: payload.note, request });
  return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, status: "CANCELLED" }, mode: "demo" });
  const previous = await ownedReservation(id, session.laboratoryId, session.role === "PROFESSOR" ? session.userId : undefined);
  if (!previous.length) return NextResponse.json({ message: "Reserva no encontrada." }, { status: 404 });
  const sql = getSql();
  const rows = await sql`UPDATE resource_reservations SET status = 'CANCELLED', cancelled_at = now(), updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: "RESOURCE_RESERVATION_CANCELLED", entityType: "resource_reservation", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Cancelación explícita", request });
  return NextResponse.json({ data: rows[0] });
}
