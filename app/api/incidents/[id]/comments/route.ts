import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({ body: z.string().min(2).max(4000), commentType: z.enum(["COMMENT", "FOLLOW_UP", "EVIDENCE", "STATUS_CHANGE"]).default("FOLLOW_UP"), attachmentId: databaseIdSchema.optional() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "incidents.manage")) return NextResponse.json({ message: "No tienes permiso para dar seguimiento." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Comentario inválido.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), incident_id: id, ...parsed.data }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const incident = await sql`SELECT id FROM incidents WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!incident.length) return NextResponse.json({ message: "Incidencia no encontrada." }, { status: 404 });
  if (parsed.data.attachmentId) {
    const attachment = await sql`SELECT id FROM attachments WHERE id = ${parsed.data.attachmentId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    if (!attachment.length) return NextResponse.json({ message: "Evidencia no encontrada." }, { status: 400 });
  }
  const rows = await sql`INSERT INTO incident_comments (laboratory_id, incident_id, body, comment_type, attachment_id, created_by) VALUES (${session.laboratoryId}, ${id}, ${parsed.data.body}, ${parsed.data.commentType}, ${parsed.data.attachmentId ?? null}, ${session.userId}) RETURNING *`;
  await writeAuditEvent(session, { action: "INCIDENT_COMMENT_CREATED", entityType: "incident", entityId: id, newValue: { commentId: rows[0].id, commentType: parsed.data.commentType }, reason: "Seguimiento de incidencia", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
