import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { dispatchPush } from "@/lib/push";
import { notifyDirectMessage } from "@/lib/push-events";

// Mensajería interna de la institución. El alcance es la organización, no el
// laboratorio: quien lleva el laboratorio de química tiene que poder escribirle
// al de biología, y ambos pertenecen a la misma institución.

const createSchema = z.object({
  // Hilo existente o destinatarios para abrir uno nuevo.
  threadId: databaseIdSchema.optional(),
  recipientIds: z.array(databaseIdSchema).min(1).max(30).optional(),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
}).refine((value) => value.threadId || value.recipientIds, {
  message: "Indica el hilo o a quién quieres escribir.",
  path: ["recipientIds"],
});

/** Bandeja: hilos del usuario con su último mensaje y los no leídos. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Los accesos de invitado no incluyen mensajería." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], unreadTotal: 0, mode: "demo" });

  const url = new URL(request.url);
  const onlyUnreadCount = url.searchParams.get("count") === "1";
  const sql = getSql();

  const rows = await sql`
    SELECT t.id, t.kind, t.subject, t.last_message_at, t.last_message_preview,
           (
             SELECT count(*)::int FROM messages m
             WHERE m.thread_id = t.id
               AND m.sender_user_id <> ${session.userId}
               AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
           ) AS unread_count,
           (
             SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
             FROM message_thread_participants tp
             JOIN users u ON u.id = tp.user_id
             WHERE tp.thread_id = t.id AND tp.user_id <> ${session.userId}
           ) AS participants
    FROM message_thread_participants p
    JOIN message_threads t ON t.id = p.thread_id
    WHERE p.user_id = ${session.userId} AND p.organization_id = ${session.organizationId} AND p.archived_at IS NULL
    ORDER BY t.last_message_at DESC
    LIMIT 100
  `;

  const unreadTotal = (rows as Array<{ unread_count: number }>).reduce((sum, row) => sum + Number(row.unread_count ?? 0), 0);
  if (onlyUnreadCount) return NextResponse.json({ unreadTotal });
  return NextResponse.json({ data: rows, unreadTotal, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Los accesos de invitado no incluyen mensajería." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa el mensaje.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  let threadId = payload.threadId ?? null;

  if (threadId) {
    const belongs = await sql`
      SELECT 1 FROM message_thread_participants
      WHERE thread_id = ${threadId} AND user_id = ${session.userId} AND organization_id = ${session.organizationId} LIMIT 1
    `;
    if (!belongs.length) return NextResponse.json({ message: "No participas en esa conversación." }, { status: 403 });
  } else {
    // Solo se puede escribir a gente de la misma institución.
    const recipients = payload.recipientIds ?? [];
    const valid = await sql`
      SELECT DISTINCT m.user_id FROM memberships m
      WHERE m.organization_id = ${session.organizationId} AND m.status = 'ACTIVE' AND m.user_id = ANY(${recipients})
    `;
    const validIds = (valid as Array<{ user_id: string }>).map((row) => String(row.user_id)).filter((id) => id !== session.userId);
    if (!validIds.length) {
      return NextResponse.json({ message: "Los destinatarios deben pertenecer a tu institución." }, { status: 400 });
    }

    // Entre dos personas se reutiliza el hilo directo que ya exista, para que
    // la conversación no se parta en fragmentos.
    if (validIds.length === 1) {
      const existing = await sql`
        SELECT t.id FROM message_threads t
        JOIN message_thread_participants a ON a.thread_id = t.id AND a.user_id = ${session.userId}
        JOIN message_thread_participants b ON b.thread_id = t.id AND b.user_id = ${validIds[0]}
        WHERE t.organization_id = ${session.organizationId} AND t.kind = 'DIRECT'
          AND (SELECT count(*) FROM message_thread_participants p WHERE p.thread_id = t.id) = 2
        LIMIT 1
      `;
      if (existing.length) threadId = String(existing[0].id);
    }

    if (!threadId) {
      const created = await sql`
        INSERT INTO message_threads (organization_id, kind, subject, created_by, last_message_at)
        VALUES (${session.organizationId}, ${validIds.length === 1 ? "DIRECT" : "GROUP"}, ${payload.subject ?? null}, ${session.userId}, now())
        RETURNING id
      `;
      threadId = String(created[0].id);
      for (const userId of [session.userId, ...validIds]) {
        await sql`
          INSERT INTO message_thread_participants (thread_id, organization_id, user_id, last_read_at)
          VALUES (${threadId}, ${session.organizationId}, ${userId}, ${userId === session.userId ? new Date().toISOString() : null})
          ON CONFLICT (thread_id, user_id) DO NOTHING
        `;
      }
    }
  }

  const messages = await sql`
    INSERT INTO messages (thread_id, organization_id, sender_user_id, laboratory_id, body)
    VALUES (${threadId}, ${session.organizationId}, ${session.userId}, ${session.laboratoryId}, ${payload.body.trim()})
    RETURNING id, thread_id, sender_user_id, body, created_at
  `;

  await sql`
    UPDATE message_threads SET last_message_at = now(), last_message_preview = ${payload.body.trim().slice(0, 280)}
    WHERE id = ${threadId}
  `;
  await sql`
    UPDATE message_thread_participants SET last_read_at = now()
    WHERE thread_id = ${threadId} AND user_id = ${session.userId}
  `;
  // Reabre el hilo para quien lo había archivado: un mensaje nuevo vuelve a la
  // bandeja de todos los participantes.
  await sql`UPDATE message_thread_participants SET archived_at = NULL WHERE thread_id = ${threadId}`;

  const others = await sql`
    SELECT user_id FROM message_thread_participants WHERE thread_id = ${threadId} AND user_id <> ${session.userId}
  `;
  dispatchPush(notifyDirectMessage(session, {
    threadId: String(threadId),
    body: payload.body.trim(),
    recipients: (others as Array<{ user_id: string }>).map((row) => String(row.user_id)),
  }));

  await writeAuditEvent(session, {
    action: "MESSAGE_SENT",
    entityType: "message_thread",
    entityId: String(threadId),
    newValue: { messageId: messages[0].id, recipients: others.length },
    reason: "Mensaje interno enviado",
    request,
  });

  return NextResponse.json({ data: { ...messages[0], threadId } }, { status: 201 });
}
