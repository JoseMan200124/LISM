import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

const schema = z.object({
  action: z.enum(["UPDATE", "PAUSE", "REACTIVATE", "ARCHIVE", "DUPLICATE"]).default("UPDATE"),
  name: z.string().min(2).max(180).optional(), planType: z.enum(["VERIFICATION", "CALIBRATION", "MAINTENANCE", "QUALIFICATION", "CLEANING"]).optional(),
  frequencyValue: z.coerce.number().int().positive().nullable().optional(), frequencyUnit: z.enum(["USE", "DAY", "WEEK", "MONTH", "YEAR"]).optional(),
  nextDueAt: z.string().datetime({ offset: true }).nullable().optional(), blocksUseWhenOverdue: z.boolean().optional(),
  reminderDays: z.array(z.coerce.number().int().nonnegative()).max(10).optional(),
});

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql(); const rows = await sql`SELECT p.*, e.code AS equipment_code, e.name AS equipment_name, COALESCE((SELECT jsonb_agg(ev ORDER BY ev.completed_at DESC) FROM equipment_events ev WHERE ev.equipment_id = p.equipment_id AND ev.laboratory_id = p.laboratory_id AND ev.event_type = p.plan_type), '[]'::jsonb) AS executions FROM equipment_plans p JOIN equipment e ON e.id = p.equipment_id AND e.laboratory_id = p.laboratory_id WHERE p.id = ${id} AND p.laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Plan no encontrado." }, { status: 404 }); return NextResponse.json({ data: rows[0] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: "Plan inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const sql = getSql(); const previous = await sql`SELECT * FROM equipment_plans WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length) return NextResponse.json({ message: "Plan no encontrado." }, { status: 404 });
  const payload = parsed.data;
  if (payload.action === "DUPLICATE") {
    const rows = await sql`INSERT INTO equipment_plans (laboratory_id, equipment_id, plan_type, name, frequency_value, frequency_unit, next_due_at, reminder_days, blocks_use_when_overdue, status, created_by) SELECT laboratory_id, equipment_id, plan_type, name || ' (copia)', frequency_value, frequency_unit, next_due_at, reminder_days, blocks_use_when_overdue, 'INACTIVE', ${session.userId} FROM equipment_plans WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
    await writeAuditEvent(session, { action: "EQUIPMENT_PLAN_DUPLICATED", entityType: "equipment_plan", entityId: String(rows[0].id), newValue: rows[0], metadata: { sourceId: id }, request }); return NextResponse.json({ data: rows[0] }, { status: 201 });
  }
  const status = payload.action === "PAUSE" ? "INACTIVE" : payload.action === "REACTIVATE" ? "ACTIVE" : payload.action === "ARCHIVE" ? "ARCHIVED" : previous[0].status;
  const frequencyUnit = payload.frequencyUnit ?? String(previous[0].frequency_unit);
  const rows = await sql`UPDATE equipment_plans SET name = COALESCE(${payload.name ?? null}, name), plan_type = COALESCE(${payload.planType ?? null}, plan_type), frequency_value = CASE WHEN ${payload.frequencyValue === undefined} THEN frequency_value ELSE ${payload.frequencyValue ?? null} END, frequency_unit = ${frequencyUnit}, next_due_at = CASE WHEN ${frequencyUnit === "USE"} THEN NULL WHEN ${payload.nextDueAt === undefined} THEN next_due_at ELSE ${payload.nextDueAt ?? null} END, blocks_use_when_overdue = COALESCE(${payload.blocksUseWhenOverdue ?? null}, blocks_use_when_overdue), reminder_days = COALESCE(${payload.reminderDays ? JSON.stringify(payload.reminderDays) : null}::jsonb, reminder_days), status = ${status}, paused_at = CASE WHEN ${payload.action === "PAUSE"} THEN now() WHEN ${payload.action === "REACTIVATE"} THEN NULL ELSE paused_at END, archived_at = CASE WHEN ${payload.action === "ARCHIVE"} THEN now() ELSE archived_at END, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: `EQUIPMENT_PLAN_${payload.action}`, entityType: "equipment_plan", entityId: id, previousValue: previous[0], newValue: rows[0], request }); return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params; if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id }, mode: "demo" }); const sql = getSql();
  const activity = await sql`SELECT p.id, p.status, EXISTS(SELECT 1 FROM equipment_events ev WHERE ev.equipment_id = p.equipment_id AND ev.laboratory_id = p.laboratory_id AND ev.event_type = p.plan_type) AS has_activity FROM equipment_plans p WHERE p.id = ${id} AND p.laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!activity.length) return NextResponse.json({ message: "Plan no encontrado." }, { status: 404 });
  if (activity[0].has_activity || String(activity[0].status) !== "DRAFT") return NextResponse.json({ message: "Solo se eliminan borradores sin actividad; archiva este plan." }, { status: 409 });
  await sql`DELETE FROM equipment_plans WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`; await writeAuditEvent(session, { action: "EQUIPMENT_PLAN_DELETED", entityType: "equipment_plan", entityId: id, reason: "Borrador sin actividad", request }); return NextResponse.json({ success: true });
}
