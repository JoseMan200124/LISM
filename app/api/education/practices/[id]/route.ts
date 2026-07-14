import { NextResponse } from "next/server";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { createPracticeShareToken } from "@/lib/share-token";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar prácticas." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at,
      ep.instructions, ep.status, u.full_name AS teacher_name
    FROM educational_practices ep
    LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.id = ${id} AND ep.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ message: "Práctica no encontrada." }, { status: 404 });
  // Solo quien administra prácticas puede generar el enlace para compartir.
  const shareToken = hasPermission(session, "education.manage")
    ? await createPracticeShareToken(id, session.laboratoryId)
    : null;
  return NextResponse.json({ data: { ...rows[0], shareToken }, mode: "database" });
}
