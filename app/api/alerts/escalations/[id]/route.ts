import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({ waitMinutes: z.coerce.number().int().positive().optional(), recipientConfig: z.record(z.string(), z.unknown()).optional(), channelConfig: z.array(z.enum(["IN_APP", "EMAIL", "WHATSAPP"])).min(1).optional(), targetSeverity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional().nullable(), repeatMinutes: z.coerce.number().int().positive().optional().nullable(), subsequentAction: z.enum(["NOTIFY", "REASSIGN", "RAISE_SEVERITY"]).optional(), status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional() }).refine((v) => Object.keys(v).length > 0, "No hay cambios.");
async function getId(context: { params: Promise<{ id: string }> }) { const { id } = await context.params; return databaseIdSchema.safeParse(id).success ? id : null; }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession(); if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para editar escalamientos." }, { status: 403 });
  const id = await getId(context); if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ message: "Escalamiento inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const sql = getSql(); const previous = await sql`SELECT * FROM alert_escalations WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`; if (!previous.length) return NextResponse.json({ message: "Escalamiento no encontrado." }, { status: 404 }); const p = parsed.data;
  const rows = await sql`UPDATE alert_escalations SET wait_minutes = COALESCE(${p.waitMinutes ?? null}, wait_minutes), recipient_config = COALESCE(${p.recipientConfig ? JSON.stringify(p.recipientConfig) : null}::jsonb, recipient_config), channel_config = COALESCE(${p.channelConfig ? JSON.stringify(p.channelConfig) : null}::jsonb, channel_config), target_severity = COALESCE(${p.targetSeverity ?? null}, target_severity), repeat_minutes = COALESCE(${p.repeatMinutes ?? null}, repeat_minutes), subsequent_action = COALESCE(${p.subsequentAction ?? null}, subsequent_action), status = COALESCE(${p.status ?? null}, status), updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: p.status === "ARCHIVED" ? "ALERT_ESCALATION_ARCHIVED" : "ALERT_ESCALATION_UPDATED", entityType: "alert_escalation", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Actualización de escalamiento", request }); return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) { const id = await getId(context); if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 }); return PATCH(new Request(request.url, { method: "PATCH", headers: { "content-type": "application/json", cookie: request.headers.get("cookie") ?? "" }, body: JSON.stringify({ status: "ARCHIVED" }) }), { params: Promise.resolve({ id }) }); }
