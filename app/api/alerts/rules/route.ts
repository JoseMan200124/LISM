import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";
import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

// Fuentes de regla NO relevantes al perfil educativo (§3.5): resultados
// clínicos / OOS. Se excluyen de la vista.
const NON_EDUCATIONAL_SOURCES = new Set(["RESULT", "SPECIMEN", "ORDER"]);

const patchSchema = z.object({
  id: databaseIdSchema,
  active: z.boolean(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasAnyPermission(session, ["quality.view", "inventory.view", "equipment.view", "configuration.manage"])) {
    return NextResponse.json({ message: "No tienes permiso para consultar reglas de alerta." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT id, rule_key, name, source_type, trigger_type, severity, active,
      recipient_config, channel_config, escalation_config
    FROM alert_rules
    WHERE laboratory_id = ${session.laboratoryId}
    ORDER BY active DESC, name ASC
  `;
  const filtered = rows.filter((r) => !NON_EDUCATIONAL_SOURCES.has(String(r.source_type)));
  return NextResponse.json({ data: filtered, mode: "database" });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para editar reglas de alerta." }, { status: 403 });
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
