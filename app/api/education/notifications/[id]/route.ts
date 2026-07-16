import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

const schema = z.object({
  title: z.string().min(2).max(180).optional(), body: z.string().min(2).max(2000).optional(),
  audience: z.enum(["STUDENTS", "PROFESSORS", "ALL"]).optional(), publishAt: z.string().datetime({ offset: true }).optional(),
  action: z.enum(["UPDATE", "CANCEL", "ARCHIVE"]).default("UPDATE"),
});

async function findNotice(id: string, labId: string, creatorId?: string) {
  const sql = getSql();
  return creatorId ? sql`SELECT * FROM educational_notifications WHERE id = ${id} AND laboratory_id = ${labId} AND created_by = ${creatorId} LIMIT 1`
    : sql`SELECT * FROM educational_notifications WHERE id = ${id} AND laboratory_id = ${labId} LIMIT 1`;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql();
  const rows = session.role === "STUDENT" ? await sql`
    SELECT DISTINCT n.*, ep.title AS practice_title, ep.practice_code, u.full_name AS created_by_name
    FROM educational_notifications n
    LEFT JOIN educational_practices ep ON ep.id = n.practice_id AND ep.laboratory_id = n.laboratory_id
    LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = n.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE'
    LEFT JOIN educational_group_members gm ON gm.group_id = COALESCE(n.group_id, ep.group_id) AND gm.laboratory_id = n.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE'
    LEFT JOIN users u ON u.id = n.created_by
    WHERE n.id = ${id} AND n.laboratory_id = ${session.laboratoryId} AND n.publish_at <= now() AND n.status IN ('PUBLISHED','SCHEDULED') AND n.audience IN ('STUDENTS','ALL')
      AND (n.practice_id IS NULL AND n.group_id IS NULL OR pp.id IS NOT NULL OR gm.id IS NOT NULL) LIMIT 1
  ` : await findNotice(id, session.laboratoryId, session.role === "PROFESSOR" ? session.userId : undefined);
  if (!rows.length) return NextResponse.json({ message: "Aviso no encontrado." }, { status: 404 });
  return NextResponse.json({ data: rows[0] });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const previous = await findNotice(id, session.laboratoryId, session.role === "PROFESSOR" ? session.userId : undefined);
  if (!previous.length) return NextResponse.json({ message: "Aviso no encontrado." }, { status: 404 });
  const payload = parsed.data;
  const alreadyPublished = new Date(String(previous[0].publish_at)) <= new Date() && String(previous[0].status) === "PUBLISHED";
  if (payload.action === "UPDATE" && alreadyPublished && (payload.title || payload.body || payload.audience)) return NextResponse.json({ message: "Un aviso ya enviado no se edita silenciosamente. Archívalo y publica uno nuevo." }, { status: 409 });
  const status = payload.action === "ARCHIVE" ? "ARCHIVED" : payload.action === "CANCEL" ? "CANCELLED" : previous[0].status;
  const sql = getSql();
  const rows = await sql`UPDATE educational_notifications SET title = COALESCE(${payload.title ?? null}, title), body = COALESCE(${payload.body ?? null}, body), audience = COALESCE(${payload.audience ?? null}, audience), publish_at = COALESCE(${payload.publishAt ?? null}, publish_at), status = ${status}, archived_at = CASE WHEN ${payload.action === "ARCHIVE"} THEN now() ELSE archived_at END, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
  await writeAuditEvent(session, { action: `EDUCATIONAL_NOTIFICATION_${payload.action}`, entityType: "educational_notification", entityId: id, previousValue: previous[0], newValue: rows[0], request });
  return NextResponse.json({ data: rows[0] });
}
