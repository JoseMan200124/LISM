import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { EDUCATIONAL_ALERT_SOURCES } from "@/lib/alert-rules";

// Fuentes de regla NO relevantes al perfil educativo (§3.5): resultados
// clínicos / OOS. Se excluyen de la vista.
const NON_EDUCATIONAL_SOURCES = new Set(["RESULT", "SPECIMEN", "ORDER"]);

const patchSchema = z.object({
  id: databaseIdSchema,
  active: z.boolean(),
});

const createSchema = z.object({
  name: z.string().min(3).max(200),
  sourceType: z.enum(EDUCATIONAL_ALERT_SOURCES),
  triggerType: z.enum(["THRESHOLD", "DATE_WINDOW", "DATE_OVERDUE", "STATUS", "AGE", "MISSING_LOG"]),
  conditionConfig: z.record(z.string(), z.unknown()).default({}),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]),
  recipientConfig: z.record(z.string(), z.unknown()).default({ roles: ["LAB_ADMIN", "HEAD_OF_LAB"] }),
  channelConfig: z.array(z.enum(["IN_APP", "EMAIL", "WHATSAPP"])).min(1).default(["IN_APP"]),
  escalationConfig: z.record(z.string(), z.unknown()).default({}),
});

function ruleKey(name: string): string {
  return `${name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 70)}_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) {
    return NextResponse.json({ message: "No tienes permiso para consultar reglas de alerta." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT id, rule_key, name, source_type, trigger_type, severity, active,
      recipient_config, channel_config, escalation_config
    FROM alert_rules
    WHERE laboratory_id = ${session.laboratoryId} AND status <> 'ARCHIVED'
    ORDER BY active DESC, name ASC
  `;
  const filtered = rows.filter((r) => !NON_EDUCATIONAL_SOURCES.has(String(r.source_type)));
  return NextResponse.json({ data: filtered, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para crear reglas." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Regla inválida.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), rule_key: ruleKey(parsed.data.name), ...parsed.data, active: true }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const payload = parsed.data;
  const rows = await sql`
    INSERT INTO alert_rules (laboratory_id, rule_key, name, source_type, trigger_type, condition_config, severity, recipient_config, channel_config, escalation_config, created_by)
    VALUES (${session.laboratoryId}, ${ruleKey(payload.name)}, ${payload.name}, ${payload.sourceType}, ${payload.triggerType}, ${JSON.stringify(payload.conditionConfig)}::jsonb, ${payload.severity}, ${JSON.stringify(payload.recipientConfig)}::jsonb, ${JSON.stringify(payload.channelConfig)}::jsonb, ${JSON.stringify(payload.escalationConfig)}::jsonb, ${session.userId})
    RETURNING *
  `;
  await writeAuditEvent(session, { action: "ALERT_RULE_CREATED", entityType: "alert_rule", entityId: String(rows[0].id), newValue: rows[0], reason: "Creación de regla educativa", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para editar reglas de alerta." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { ...payload, mode: "demo" } });
  const sql = getSql();
  const previous = await sql`SELECT * FROM alert_rules WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
  const rows = await sql`
    UPDATE alert_rules SET active = ${payload.active}, updated_at = now()
    WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, rule_key, name, active
  `;
  await writeAuditEvent(session, {
    action: payload.active ? "ALERT_RULE_ACTIVATED" : "ALERT_RULE_DEACTIVATED",
    entityType: "alert_rule",
    entityId: payload.id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: "Cambio de estado de regla de alerta",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
