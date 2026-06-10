import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  password: z.string().min(8),
  entityType: z.string().min(2).max(80),
  entityId: databaseIdSchema,
  meaning: z.enum(["REVIEW", "APPROVAL", "RELEASE", "INVESTIGATION_CLOSE", "DOCUMENT_APPROVAL", "LOGBOOK_CONFIRMATION"]),
  contentHash: z.string().min(16).max(128),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "signatures.create")) return NextResponse.json({ message: "No tienes permiso para firmar este registro." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Firma inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) {
    if (payload.password !== "Demo1234!") return NextResponse.json({ message: "No se pudo confirmar tu identidad." }, { status: 401 });
    return NextResponse.json({ data: { id: crypto.randomUUID(), actorUserId: session.userId, ...payload, password: undefined, signedAt: new Date().toISOString() }, mode: "demo" }, { status: 201 });
  }
  const sql = getSql();
  const users = await sql`SELECT password_hash FROM users WHERE id = ${session.userId} AND status = 'ACTIVE' LIMIT 1`;
  const user = users[0] as Record<string, string> | undefined;
  if (!user || !(await compare(payload.password, user.password_hash))) return NextResponse.json({ message: "No se pudo confirmar tu identidad." }, { status: 401 });
  const rows = await sql`
    INSERT INTO electronic_signatures (laboratory_id, actor_user_id, entity_type, entity_id, meaning, content_hash, authentication_method)
    VALUES (${session.laboratoryId}, ${session.userId}, ${payload.entityType}, ${payload.entityId}, ${payload.meaning}, ${payload.contentHash}, 'PASSWORD_REAUTH')
    RETURNING id, actor_user_id, entity_type, entity_id, meaning, content_hash, signed_at, correlation_id
  `;
  await writeAuditEvent(session, { action: "ELECTRONIC_SIGNATURE_CREATED", entityType: payload.entityType, entityId: payload.entityId, newValue: rows[0], reason: payload.meaning, request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
