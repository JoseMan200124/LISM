import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { equipmentPlans } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  equipmentId: databaseIdSchema,
  planType: z.enum(["VERIFICATION", "CALIBRATION", "MAINTENANCE", "QUALIFICATION", "CLEANING"]),
  name: z.string().min(2).max(180),
  frequencyValue: z.coerce.number().int().positive().optional(),
  frequencyUnit: z.enum(["USE", "DAY", "WEEK", "MONTH", "YEAR"]).optional(),
  nextDueAt: z.string().datetime().optional(),
  blocksUseWhenOverdue: z.boolean().default(false),
  reminderDays: z.array(z.coerce.number().int().nonnegative()).default([90, 60, 30, 0]),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar planes de equipo." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: equipmentPlans, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT p.*, e.code AS equipment_code, e.name AS equipment_name
    FROM equipment_plans p
    JOIN equipment e ON e.id = p.equipment_id AND e.laboratory_id = p.laboratory_id
    WHERE p.laboratory_id = ${session.laboratoryId}
    ORDER BY p.next_due_at NULLS LAST, e.name
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para gestionar planes de equipo." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Plan inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...parsed.data }, mode: "demo" }, { status: 201 });
  const payload = parsed.data;
  const sql = getSql();
  const equipment = await sql`SELECT id FROM equipment WHERE id = ${payload.equipmentId} AND laboratory_id = ${session.laboratoryId} AND status <> 'RETIRED' LIMIT 1`;
  if (!equipment.length) return NextResponse.json({ message: "Equipo no encontrado o retirado." }, { status: 404 });
  if (payload.frequencyUnit !== "USE" && !payload.nextDueAt) return NextResponse.json({ message: "Indica la próxima fecha para una frecuencia de calendario." }, { status: 400 });
  const rows = await sql`
    INSERT INTO equipment_plans (
      laboratory_id, equipment_id, plan_type, name, frequency_value, frequency_unit,
      next_due_at, reminder_days, blocks_use_when_overdue
    ) VALUES (
      ${session.laboratoryId}, ${payload.equipmentId}, ${payload.planType}, ${payload.name}, ${payload.frequencyValue ?? null}, ${payload.frequencyUnit ?? null},
      ${payload.frequencyUnit === "USE" ? null : payload.nextDueAt ?? null}, ${JSON.stringify(payload.reminderDays)}::jsonb, ${payload.blocksUseWhenOverdue}
    ) RETURNING *
  `;
  await writeAuditEvent(session, { action: "EQUIPMENT_PLAN_CREATED", entityType: "equipment_plan", entityId: String(rows[0].id), newValue: rows[0], request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
