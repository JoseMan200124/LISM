import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({ alertRuleId: databaseIdSchema, waitMinutes: z.coerce.number().int().positive(), recipientConfig: z.record(z.string(), z.unknown()), channelConfig: z.array(z.enum(["IN_APP", "EMAIL", "WHATSAPP"])).min(1), targetSeverity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional(), repeatMinutes: z.coerce.number().int().positive().optional(), subsequentAction: z.enum(["NOTIFY", "REASSIGN", "RAISE_SEVERITY"]).default("NOTIFY") });

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para consultar escalamientos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const rows = await getSql()`SELECT ae.*, ar.name AS rule_name FROM alert_escalations ae JOIN alert_rules ar ON ar.id = ae.alert_rule_id AND ar.laboratory_id = ae.laboratory_id WHERE ae.laboratory_id = ${session.laboratoryId} AND ae.status <> 'ARCHIVED' ORDER BY ar.name, ae.wait_minutes`;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para crear escalamientos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Escalamiento inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...parsed.data }, mode: "demo" }, { status: 201 });
  const sql = getSql(); const p = parsed.data;
  const rule = await sql`SELECT id FROM alert_rules WHERE id = ${p.alertRuleId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rule.length) return NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
  const rows = await sql`INSERT INTO alert_escalations (laboratory_id, alert_rule_id, wait_minutes, recipient_config, channel_config, target_severity, repeat_minutes, subsequent_action, created_by) VALUES (${session.laboratoryId}, ${p.alertRuleId}, ${p.waitMinutes}, ${JSON.stringify(p.recipientConfig)}::jsonb, ${JSON.stringify(p.channelConfig)}::jsonb, ${p.targetSeverity ?? null}, ${p.repeatMinutes ?? null}, ${p.subsequentAction}, ${session.userId}) RETURNING *`;
  await writeAuditEvent(session, { action: "ALERT_ESCALATION_CREATED", entityType: "alert_escalation", entityId: String(rows[0].id), newValue: rows[0], reason: "Creación de escalamiento", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
