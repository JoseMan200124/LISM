import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { resolveNotifications } from "@/lib/notifications";
import { getSession } from "@/lib/session";

const schema = z.object({
  key: z.string().max(160).optional(),
  all: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Solicitud inválida.", issues: parsed.error.issues }, { status: 400 });
  const { key, all } = parsed.data;
  if (!key && !all) return NextResponse.json({ message: "Indica 'key' o 'all'." }, { status: 400 });

  if (!hasDatabase()) return NextResponse.json({ data: { ok: true }, mode: "demo" });

  // Solo se puede marcar como leído lo que resuelve como visible para este
  // usuario — evita marcar claves arbitrarias o de otra institución.
  const { data: visible } = await resolveNotifications(session);
  const visibleKeys = new Set(visible.map((item) => item.key));

  const keysToMark = all ? [...visibleKeys].filter((k) => !visible.find((item) => item.key === k)?.isRead) : key ? [key] : [];
  if (key && !visibleKeys.has(key)) {
    return NextResponse.json({ message: "Notificación no encontrada." }, { status: 404 });
  }

  const sql = getSql();
  for (const notificationKey of keysToMark) {
    await sql`
      INSERT INTO user_notification_reads (user_id, notification_key)
      VALUES (${session.userId}, ${notificationKey})
      ON CONFLICT (user_id, notification_key) DO NOTHING
    `;
  }

  return NextResponse.json({ data: { ok: true, marked: keysToMark.length }, mode: "database" });
}
