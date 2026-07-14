import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { educationalPractices } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { computeNextPracticeCode, isValidPracticeRange } from "@/lib/education-practice";
import { getSession } from "@/lib/session";

const PRACTICE_STATUSES = ["DRAFT", "PLANNED", "PREPARING", "READY", "EXECUTED", "CLOSED", "CANCELLED"] as const;

const schema = z.object({
  // El código de práctica es opcional: si el cliente no lo envía se genera de
  // forma segura y única por laboratorio en el servidor (ver nextPracticeCode).
  practiceCode: z.string().min(3).max(80).optional(),
  title: z.string().min(3).max(200),
  courseName: z.string().max(180).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
  instructions: z.string().max(4000).optional(),
  status: z.enum(PRACTICE_STATUSES).optional(),
});

// Genera un código PRA-<año>-NNN único por laboratorio, siguiendo la convención
// del seed (PRA-2026-021…). Toma el mayor correlativo del año en curso y suma 1.
// Evita el error 400 previo (la UI nunca enviaba practiceCode) sin obligar al
// usuario a inventar un código manualmente.
async function nextPracticeCode(sql: ReturnType<typeof getSql>, laboratoryId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await sql`
    SELECT practice_code FROM educational_practices
    WHERE laboratory_id = ${laboratoryId} AND practice_code LIKE ${`PRA-${year}-%`}
  `;
  return computeNextPracticeCode(rows.map((row) => String(row.practice_code)), year);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar prácticas." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: educationalPractices, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at,
      ep.instructions, ep.status, ep.teacher_user_id, u.full_name AS teacher_name
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
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de práctica inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!isValidPracticeRange(payload.startsAt, payload.endsAt)) {
    return NextResponse.json({ success: false, error: "INVALID_RANGE", message: "La hora de finalización debe ser posterior a la de inicio." }, { status: 400 });
  }
  const status = payload.status ?? "PLANNED";
  if (!hasDatabase()) {
    return NextResponse.json({ data: { id: crypto.randomUUID(), practice_code: payload.practiceCode ?? "PRA-0001", title: payload.title, course_name: payload.courseName ?? null, teacher_user_id: session.userId, starts_at: payload.startsAt, ends_at: payload.endsAt ?? null, instructions: payload.instructions ?? null, status }, mode: "demo" }, { status: 201 });
  }
  const sql = getSql();
  const practiceCode = payload.practiceCode ?? await nextPracticeCode(sql, session.laboratoryId);
  let rows;
  try {
    rows = await sql`
      INSERT INTO educational_practices (laboratory_id, practice_code, title, course_name, teacher_user_id, starts_at, ends_at, instructions, status)
      VALUES (${session.laboratoryId}, ${practiceCode}, ${payload.title}, ${payload.courseName ?? null}, ${session.userId}, ${payload.startsAt}, ${payload.endsAt ?? null}, ${payload.instructions ?? null}, ${status})
      RETURNING *
    `;
  } catch (error) {
    // Colisión de código único (raro; código provisto por el usuario ya existe).
    if (error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return NextResponse.json({ success: false, error: "DUPLICATE_CODE", message: "Ya existe una práctica con ese código. Usa otro código o deja el campo vacío para generarlo automáticamente." }, { status: 409 });
    }
    console.error("[api/education/practices] POST", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible crear la práctica. Intenta nuevamente." }, { status: 500 });
  }
  await writeAuditEvent(session, { action: "EDUCATIONAL_PRACTICE_CREATED", entityType: "educational_practice", entityId: String(rows[0].id), newValue: rows[0], reason: "Programación de práctica", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
