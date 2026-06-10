import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { educationalPractices } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";

const schema = z.object({
  practiceCode: z.string().min(3).max(80),
  title: z.string().min(3).max(200),
  courseName: z.string().max(180).optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  instructions: z.string().max(4000).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar prácticas." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: educationalPractices, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at,
      ep.instructions, ep.status, u.full_name AS teacher
    FROM educational_practices ep
    LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.laboratory_id = ${session.laboratoryId}
    ORDER BY ep.starts_at ASC
    LIMIT 250
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para programar prácticas." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de práctica inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (payload.endsAt && new Date(payload.endsAt) <= new Date(payload.startsAt)) return NextResponse.json({ message: "La hora final debe ser posterior a la hora inicial." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, teacherUserId: session.userId, status: "PLANNED" }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const rows = await sql`
    INSERT INTO educational_practices (laboratory_id, practice_code, title, course_name, teacher_user_id, starts_at, ends_at, instructions)
    VALUES (${session.laboratoryId}, ${payload.practiceCode}, ${payload.title}, ${payload.courseName ?? null}, ${session.userId}, ${payload.startsAt}, ${payload.endsAt ?? null}, ${payload.instructions ?? null})
    RETURNING *
  `;
  await writeAuditEvent(session, { action: "EDUCATIONAL_PRACTICE_CREATED", entityType: "educational_practice", entityId: String(rows[0].id), newValue: rows[0], reason: "Programación de práctica", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
