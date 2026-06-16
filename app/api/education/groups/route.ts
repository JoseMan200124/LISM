import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const createSchema = z.object({
  code: z.string().min(2).max(80),
  name: z.string().min(2).max(180),
  academicPeriod: z.string().max(80).optional(),
  teacherUserId: databaseIdSchema.optional().nullable(),
});

const demoGroups = [
  { id: "00000000-0000-0000-0000-000000000021", code: "MIC-I-2026-A", name: "Microbiología I · Sección A", academicPeriod: "2026-I", teacherName: "Dra. Ana García", memberCount: 20, status: "ACTIVE" },
  { id: "00000000-0000-0000-0000-000000000022", code: "LAB-BAS-2026-A", name: "Laboratorio básico · Sección A", academicPeriod: "2026-I", teacherName: "Prof. Luis Torres", memberCount: 18, status: "ACTIVE" },
  { id: "00000000-0000-0000-0000-000000000023", code: "MIC-II-2026-B", name: "Microbiología II · Sección B", academicPeriod: "2026-I", teacherName: "Dra. Ana García", memberCount: 15, status: "ACTIVE" },
];

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar grupos." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoGroups, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      g.id, g.code, g.name, g.academic_period, g.status,
      u.full_name AS teacher_name,
      COUNT(gm.id)::int AS member_count
    FROM educational_groups g
    LEFT JOIN users u ON u.id = g.teacher_user_id
    LEFT JOIN educational_group_members gm ON gm.group_id = g.id AND gm.status = 'ACTIVE'
    WHERE g.laboratory_id = ${session.laboratoryId} AND g.status = 'ACTIVE'
    GROUP BY g.id, g.code, g.name, g.academic_period, g.status, u.full_name
    ORDER BY g.name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para crear grupos." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de grupo inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, memberCount: 0, status: "ACTIVE", mode: "demo" } }, { status: 201 });
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO educational_groups (laboratory_id, code, name, academic_period, teacher_user_id)
    VALUES (${session.laboratoryId}, ${payload.code}, ${payload.name}, ${payload.academicPeriod ?? null}, ${payload.teacherUserId ?? session.userId})
    RETURNING id, code, name, academic_period, teacher_user_id, status
  `;
  await writeAuditEvent(session, {
    action: "EDUCATIONAL_GROUP_CREATED",
    entityType: "educational_group",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Grupo educativo creado",
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
