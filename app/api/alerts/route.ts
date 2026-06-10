import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";
import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { incidentRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  id: databaseIdSchema,
  action: z.enum(["ACKNOWLEDGE", "ASSIGN_TO_ME", "RESOLVE"]),
  note: z.string().max(1000).optional().default(""),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasAnyPermission(session, ["quality.view", "inventory.view", "equipment.view"])) return NextResponse.json({ message: "No tienes permiso para consultar alertas." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: incidentRows, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.severity, a.status, a.source_type, a.source_id, a.title, a.details,
      a.assigned_to, a.acknowledged_by, a.acknowledged_at, a.resolved_at, a.created_at,
      ar.name AS rule_name
    FROM alerts a
    LEFT JOIN alert_rules ar ON ar.id = a.alert_rule_id
    WHERE a.laboratory_id = ${session.laboratoryId}
    ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END, a.created_at DESC
    LIMIT 250
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "quality.manage")) return NextResponse.json({ message: "No tienes permiso para atender alertas." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (payload.action === "RESOLVE" && payload.note.trim().length < 3) return NextResponse.json({ message: "Indica cómo se resolvió la alerta." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { ...payload, actorUserId: session.userId, mode: "demo" } });
  const sql = getSql();
  const previousRows = await sql`SELECT * FROM alerts WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  const previous = previousRows[0] as Record<string, unknown> | undefined;
  if (!previous) return NextResponse.json({ message: "Alerta no encontrada." }, { status: 404 });
  const rows = payload.action === "RESOLVE"
    ? await sql`UPDATE alerts SET status = 'RESOLVED', assigned_to = COALESCE(assigned_to, ${session.userId}), acknowledged_by = COALESCE(acknowledged_by, ${session.userId}), acknowledged_at = COALESCE(acknowledged_at, now()), resolved_at = now(), resolution_note = ${payload.note} WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
    : payload.action === "ASSIGN_TO_ME"
      ? await sql`UPDATE alerts SET status = 'ASSIGNED', assigned_to = ${session.userId} WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
      : await sql`UPDATE alerts SET status = CASE WHEN status = 'OPEN' THEN 'IN_REVIEW' ELSE status END, acknowledged_by = ${session.userId}, acknowledged_at = now() WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: `ALERT_${payload.action}`, entityType: "alert", entityId: payload.id, previousValue: previous, newValue: rows[0], reason: payload.note || payload.action, request });
  return NextResponse.json({ data: rows[0] });
}
