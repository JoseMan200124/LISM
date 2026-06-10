import { NextResponse } from "next/server";
import { z } from "zod";
import { defaultAlertRules, defaultCustomFields, laboratoryProfiles, roleTemplates, workflowTemplates } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const customFieldSchema = z.object({
  kind: z.literal("CUSTOM_FIELD"),
  moduleKey: z.string().min(2).max(80),
  fieldKey: z.string().min(2).max(100).regex(/^[a-z0-9_]+$/),
  label: z.string().min(2).max(180),
  fieldType: z.enum(["TEXT", "NUMBER", "DATE", "FILE", "SELECT", "NUMBER_WITH_UNIT", "BOOLEAN"]),
  requiredMode: z.enum(["OPTIONAL", "REQUIRED", "CONDITIONAL"]).default("OPTIONAL"),
  includeInReport: z.boolean().default(false),
  includeInQr: z.boolean().default(false),
});

const alertRuleSchema = z.object({
  kind: z.literal("ALERT_RULE"),
  ruleKey: z.string().min(2).max(100).regex(/^[A-Z0-9_]+$/),
  name: z.string().min(2).max(200),
  sourceType: z.string().min(2).max(80),
  triggerType: z.string().min(2).max(60),
  conditionConfig: z.record(z.string(), z.unknown()).default({}),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).default("WARNING"),
});

const requestSchema = z.discriminatedUnion("kind", [customFieldSchema, alertRuleSchema]);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para consultar la configuración." }, { status: 403 });

  if (!hasDatabase()) {
    return NextResponse.json({
      mode: "demo",
      profiles: laboratoryProfiles,
      customFields: defaultCustomFields,
      alertRules: defaultAlertRules,
      workflows: workflowTemplates,
      roles: roleTemplates,
    });
  }

  const sql = getSql();
  const [settings, customFields, alertRules, workflows, roles] = await Promise.all([
    sql`SELECT * FROM laboratory_settings WHERE laboratory_id = ${session.laboratoryId}`,
    sql`SELECT * FROM custom_field_definitions WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' ORDER BY module_key, sort_order, label`,
    sql`SELECT * FROM alert_rules WHERE laboratory_id = ${session.laboratoryId} ORDER BY name`,
    sql`SELECT wd.*, wv.version_number, wv.status AS version_status FROM workflow_definitions wd LEFT JOIN LATERAL (SELECT * FROM workflow_versions wv WHERE wv.workflow_id = wd.id ORDER BY version_number DESC LIMIT 1) wv ON TRUE WHERE wd.laboratory_id = ${session.laboratoryId}`,
    sql`SELECT * FROM custom_roles WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' ORDER BY name`,
  ]);
  return NextResponse.json({ mode: "database", settings: settings[0] ?? null, profiles: laboratoryProfiles, customFields, alertRules, workflows, roles });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para modificar la configuración." }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Configuración inválida.", issues: parsed.error.issues }, { status: 400 });

  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...parsed.data }, mode: "demo" }, { status: 201 });
  const sql = getSql();

  if (parsed.data.kind === "CUSTOM_FIELD") {
    const payload = parsed.data;
    const rows = await sql`
      INSERT INTO custom_field_definitions (
        laboratory_id, module_key, field_key, label, field_type, required_mode,
        include_in_report, include_in_qr, created_by
      ) VALUES (
        ${session.laboratoryId}, ${payload.moduleKey}, ${payload.fieldKey}, ${payload.label}, ${payload.fieldType}, ${payload.requiredMode},
        ${payload.includeInReport}, ${payload.includeInQr}, ${session.userId}
      ) RETURNING *
    `;
    await writeAuditEvent(session, { action: "CUSTOM_FIELD_CREATED", entityType: "custom_field_definition", entityId: String(rows[0].id), newValue: rows[0], request });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  }

  const payload = parsed.data;
  const rows = await sql`
    INSERT INTO alert_rules (
      laboratory_id, rule_key, name, source_type, trigger_type, condition_config, severity, created_by
    ) VALUES (
      ${session.laboratoryId}, ${payload.ruleKey}, ${payload.name}, ${payload.sourceType}, ${payload.triggerType}, ${JSON.stringify(payload.conditionConfig)}::jsonb, ${payload.severity}, ${session.userId}
    ) RETURNING *
  `;
  await writeAuditEvent(session, { action: "ALERT_RULE_CREATED", entityType: "alert_rule", entityId: String(rows[0].id), newValue: rows[0], request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
