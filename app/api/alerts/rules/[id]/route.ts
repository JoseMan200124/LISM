import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";
import { EDUCATIONAL_ALERT_SOURCES } from "@/lib/alert-rules";

const patchSchema = z.object({
  name: z.string().min(3).max(200).optional(),
  sourceType: z.enum(EDUCATIONAL_ALERT_SOURCES).optional(),
  triggerType: z.enum(["THRESHOLD", "DATE_WINDOW", "DATE_OVERDUE", "STATUS", "AGE", "MISSING_LOG"]).optional(),
  conditionConfig: z.record(z.string(), z.unknown()).optional(),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional(),
  recipientConfig: z.record(z.string(), z.unknown()).optional(),
  channelConfig: z.array(z.enum(["IN_APP", "EMAIL", "WHATSAPP"])).min(1).optional(),
  escalationConfig: z.record(z.string(), z.unknown()).optional(),
  active: z.boolean().optional(),
  duplicate: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, "No hay cambios.");

async function idFrom(context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para consultar reglas." }, { status: 403 });
  const id = await idFrom(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const rows = await getSql()`SELECT * FROM alert_rules WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  return rows.length ? NextResponse.json({ data: rows[0] }) : NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para editar reglas." }, { status: 403 });
  const id = await idFrom(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Regla inválida.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT * FROM alert_rules WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length) return NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
  if (parsed.data.duplicate) {
    const copy = await sql`INSERT INTO alert_rules (laboratory_id, rule_key, name, source_type, trigger_type, condition_config, severity, recipient_config, channel_config, escalation_config, repeat_config, requires_acknowledgement, active, created_by) SELECT laboratory_id, rule_key || '_COPY_' || upper(substr(gen_random_uuid()::text,1,8)), name || ' (copia)', source_type, trigger_type, condition_config, severity, recipient_config, channel_config, escalation_config, repeat_config, requires_acknowledgement, FALSE, ${session.userId} FROM alert_rules WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
    await writeAuditEvent(session, { action: "ALERT_RULE_DUPLICATED", entityType: "alert_rule", entityId: String(copy[0].id), newValue: copy[0], reason: `Duplicada desde ${id}`, request });
    return NextResponse.json({ data: copy[0] }, { status: 201 });
  }
  const value = parsed.data;
  const rows = await sql`UPDATE alert_rules SET name = COALESCE(${value.name ?? null}, name), source_type = COALESCE(${value.sourceType ?? null}, source_type), trigger_type = COALESCE(${value.triggerType ?? null}, trigger_type), condition_config = COALESCE(${value.conditionConfig ? JSON.stringify(value.conditionConfig) : null}::jsonb, condition_config), severity = COALESCE(${value.severity ?? null}, severity), recipient_config = COALESCE(${value.recipientConfig ? JSON.stringify(value.recipientConfig) : null}::jsonb, recipient_config), channel_config = COALESCE(${value.channelConfig ? JSON.stringify(value.channelConfig) : null}::jsonb, channel_config), escalation_config = COALESCE(${value.escalationConfig ? JSON.stringify(value.escalationConfig) : null}::jsonb, escalation_config), active = COALESCE(${value.active ?? null}, active), updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: "ALERT_RULE_UPDATED", entityType: "alert_rule", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Edición de regla educativa", request });
  return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para archivar reglas." }, { status: 403 });
  const id = await idFrom(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, status: "ARCHIVED" }, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT * FROM alert_rules WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length) return NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
  const rows = await sql`UPDATE alert_rules SET active = FALSE, status = 'ARCHIVED', archived_at = now(), updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: "ALERT_RULE_ARCHIVED", entityType: "alert_rule", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Archivo sin borrado físico", request });
  return NextResponse.json({ data: rows[0] });
}
