import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { incidentRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  id: databaseIdSchema,
  action: z.enum(["ACKNOWLEDGE", "ASSIGN_TO_ME", "ASSIGN", "RESOLVE", "REOPEN"]),
  note: z.string().max(1000).optional().default(""),
  assignedUserId: databaseIdSchema.optional(),
  resolution: z.object({
    result: z.string().min(2).max(180),
    explanation: z.string().min(3).max(2000),
    responsible: z.string().min(2).max(180),
    resolvedAt: z.string().datetime(),
    evidence: z.string().max(500).optional(),
    correctiveAction: z.string().min(3).max(2000),
  }).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.view")) return NextResponse.json({ message: "No tienes permiso para consultar alertas." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: incidentRows, mode: "demo" });
  const sql = getSql();
  const rows = session.role === "PROFESSOR" ? await sql`
    SELECT a.id, a.severity, a.status, a.source_type, a.source_id, a.title, a.details,
      a.assigned_to, a.acknowledged_by, a.acknowledged_at, a.resolved_at, a.created_at,
      ar.name AS rule_name
    FROM alerts a
    LEFT JOIN alert_rules ar ON ar.id = a.alert_rule_id
    LEFT JOIN educational_practices ep ON ep.id = a.source_id AND a.source_type = 'EDUCATIONAL_PRACTICE' AND ep.laboratory_id = a.laboratory_id
    LEFT JOIN resource_reservations rr ON rr.id = a.source_id AND a.source_type = 'RESOURCE_RESERVATION' AND rr.laboratory_id = a.laboratory_id
    LEFT JOIN educational_practices rp ON rp.id = rr.practice_id AND rp.laboratory_id = a.laboratory_id
    WHERE a.laboratory_id = ${session.laboratoryId}
      AND COALESCE(ep.teacher_user_id, rp.teacher_user_id) = ${session.userId}
    ORDER BY a.created_at DESC LIMIT 250
  ` : await sql`
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
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para atender alertas." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (payload.action === "RESOLVE" && !payload.resolution) return NextResponse.json({ message: "Completa el resultado, explicación y acción correctiva." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { ...payload, actorUserId: session.userId, mode: "demo" } });
  const sql = getSql();
  const previousRows = await sql`SELECT * FROM alerts WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  const previous = previousRows[0] as Record<string, unknown> | undefined;
  if (!previous) return NextResponse.json({ message: "Alerta no encontrada." }, { status: 404 });
  if (payload.action === "ASSIGN" && payload.assignedUserId) {
    const members = await sql`SELECT 1 FROM memberships WHERE user_id = ${payload.assignedUserId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
    if (members.length === 0) return NextResponse.json({ message: "El responsable no pertenece a este laboratorio." }, { status: 400 });
  }
  const rows = payload.action === "RESOLVE"
    ? await sql`UPDATE alerts SET status = 'RESOLVED', assigned_to = COALESCE(assigned_to, ${session.userId}), acknowledged_by = COALESCE(acknowledged_by, ${session.userId}), acknowledged_at = COALESCE(acknowledged_at, now()), resolved_at = ${payload.resolution!.resolvedAt}, resolution_note = ${payload.resolution!.explanation}, resolution_details = ${JSON.stringify(payload.resolution)}::jsonb WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
    : payload.action === "REOPEN"
      ? await sql`UPDATE alerts SET status = 'OPEN', resolved_at = NULL, resolution_note = NULL, reopened_at = now() WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
      : payload.action === "ASSIGN"
        ? await sql`UPDATE alerts SET status = 'ASSIGNED', assigned_to = ${payload.assignedUserId!} WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
    : payload.action === "ASSIGN_TO_ME"
      ? await sql`UPDATE alerts SET status = 'ASSIGNED', assigned_to = ${session.userId} WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`
      : await sql`UPDATE alerts SET status = 'ACKNOWLEDGED', acknowledged_by = ${session.userId}, acknowledged_at = now() WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: `ALERT_${payload.action}`, entityType: "alert", entityId: payload.id, previousValue: previous, newValue: rows[0], reason: payload.resolution?.explanation || payload.note || payload.action, metadata: payload.resolution, request });
  return NextResponse.json({ data: rows[0] });
}
