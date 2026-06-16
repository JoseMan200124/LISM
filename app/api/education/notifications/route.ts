import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const createSchema = z.object({
  practiceId: databaseIdSchema.optional().nullable(),
  groupId: databaseIdSchema.optional().nullable(),
  title: z.string().min(2).max(180),
  body: z.string().min(2).max(2000),
  audience: z.enum(["STUDENTS", "PROFESSORS", "ALL"]).default("STUDENTS"),
  publishAt: z.string().datetime({ offset: true }).optional(),
});

const demoNotifications = [
  { id: "00000000-0000-0000-0000-000000000031", title: "Recordatorio: práctica de tinción de Gram", body: "Mañana tienes práctica de tinción de Gram. Revisa la guía antes de llegar al laboratorio.", audience: "STUDENTS", publishAt: new Date().toISOString(), createdBy: "Dra. Ana García", createdAt: new Date().toISOString() },
  { id: "00000000-0000-0000-0000-000000000032", title: "Guía de preparación disponible", body: "El docente publicó la guía de tinción de Gram. Descárgala antes de la clase.", audience: "STUDENTS", publishAt: new Date().toISOString(), createdBy: "Dra. Ana García", createdAt: new Date().toISOString() },
  { id: "00000000-0000-0000-0000-000000000033", title: "Cambio de laboratorio: práctica 023", body: "La práctica PRA-2026-023 se realizará en el Laboratorio B debido a mantenimiento en el A.", audience: "STUDENTS", publishAt: new Date().toISOString(), createdBy: "Prof. Luis Torres", createdAt: new Date().toISOString() },
];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar avisos." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoNotifications, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT n.id, n.title, n.body, n.audience, n.publish_at, n.created_at,
      ep.title AS practice_title, ep.practice_code,
      eg.name AS group_name,
      u.full_name AS created_by_name
    FROM educational_notifications n
    LEFT JOIN educational_practices ep ON ep.id = n.practice_id
    LEFT JOIN educational_groups eg ON eg.id = n.group_id
    LEFT JOIN users u ON u.id = n.created_by
    WHERE n.laboratory_id = ${session.laboratoryId}
      AND n.publish_at <= now()
    ORDER BY n.publish_at DESC
    LIMIT 100
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para publicar avisos." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de aviso inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, createdBy: session.userId, mode: "demo" } }, { status: 201 });
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO educational_notifications (
      laboratory_id, practice_id, group_id, title, body, audience, publish_at, created_by
    ) VALUES (
      ${session.laboratoryId}, ${payload.practiceId ?? null}, ${payload.groupId ?? null},
      ${payload.title}, ${payload.body}, ${payload.audience},
      ${payload.publishAt ?? new Date().toISOString()}, ${session.userId}
    )
    RETURNING id, title, body, audience, publish_at, created_at
  `;
  await writeAuditEvent(session, {
    action: "EDUCATIONAL_NOTIFICATION_PUBLISHED",
    entityType: "educational_notification",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Aviso educativo publicado",
    metadata: { audience: payload.audience, practiceId: payload.practiceId },
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
