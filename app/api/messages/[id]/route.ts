import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Conversación: sus mensajes y la marca de leído. Los mensajes no se editan ni
// se borran; archivar solo los quita de la bandeja de quien archiva.

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Sin acceso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const threads = await sql`
    SELECT t.id, t.kind, t.subject, t.created_at
    FROM message_threads t
    JOIN message_thread_participants p ON p.thread_id = t.id AND p.user_id = ${session.userId}
    WHERE t.id = ${id} AND t.organization_id = ${session.organizationId}
    LIMIT 1
  `;
  if (!threads.length) return NextResponse.json({ message: "Conversación no encontrada." }, { status: 404 });

  const [messages, participants] = await Promise.all([
    sql`
      SELECT m.id, m.body, m.created_at, m.sender_user_id,
             u.full_name AS sender_name, l.name AS laboratory_name
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_user_id
      LEFT JOIN laboratories l ON l.id = m.laboratory_id
      WHERE m.thread_id = ${id}
      ORDER BY m.created_at ASC
      LIMIT 500
    `,
    sql`
      SELECT p.user_id, u.full_name, u.email
      FROM message_thread_participants p JOIN users u ON u.id = p.user_id
      WHERE p.thread_id = ${id}
      ORDER BY u.full_name
    `,
  ]);

  // Abrir la conversación la marca como leída: es lo que espera cualquiera.
  await sql`
    UPDATE message_thread_participants SET last_read_at = now()
    WHERE thread_id = ${id} AND user_id = ${session.userId}
  `;

  return NextResponse.json({ data: { ...threads[0], messages, participants } });
}

const patchSchema = z.object({
  action: z.enum(["READ", "ARCHIVE", "UNARCHIVE"]),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Sin acceso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`
    UPDATE message_thread_participants SET
      last_read_at = CASE WHEN ${parsed.data.action} = 'READ' THEN now() ELSE last_read_at END,
      archived_at = CASE
        WHEN ${parsed.data.action} = 'ARCHIVE' THEN now()
        WHEN ${parsed.data.action} = 'UNARCHIVE' THEN NULL
        ELSE archived_at END
    WHERE thread_id = ${id} AND user_id = ${session.userId} AND organization_id = ${session.organizationId}
    RETURNING thread_id, last_read_at, archived_at
  `;
  if (!rows.length) return NextResponse.json({ message: "Conversación no encontrada." }, { status: 404 });
  return NextResponse.json({ data: rows[0] });
}
