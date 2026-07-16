import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { isValidPracticeRange } from "@/lib/education-practice";
import { getSession, type UserSession } from "@/lib/session";
import { createPracticeShareToken } from "@/lib/share-token";
import { databaseIdSchema } from "@/lib/validation";

const statuses = ["DRAFT", "PLANNED", "PREPARING", "READY", "EXECUTED", "CLOSED", "CANCELLED", "ARCHIVED"] as const;
const patchSchema = z.object({
  action: z.enum(["UPDATE", "DUPLICATE", "CANCEL", "ARCHIVE", "CHANGE_STATUS"]).default("UPDATE"),
  title: z.string().min(3).max(200).optional(),
  courseName: z.string().max(180).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  instructions: z.string().max(4000).nullable().optional(),
  groupId: databaseIdSchema.nullable().optional(),
  location: z.string().max(180).nullable().optional(),
  status: z.enum(statuses).optional(),
  reason: z.string().min(3).max(1000).optional(),
}).superRefine((value, context) => {
  if (value.action === "CANCEL" && !value.reason) context.addIssue({ code: "custom", path: ["reason"], message: "Indica el motivo de cancelación." });
});

function roleClause(session: UserSession): "PROFESSOR" | "STUDENT" | "ALL" {
  if (session.role === "PROFESSOR") return "PROFESSOR";
  if (session.role === "STUDENT") return "STUDENT";
  return "ALL";
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar prácticas." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql();
  const access = roleClause(session);
  const rows = access === "PROFESSOR" ? await sql`
    SELECT ep.*, u.full_name AS teacher_name,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at) FROM resource_reservations r WHERE r.practice_id = ep.id AND r.laboratory_id = ep.laboratory_id), '[]'::jsonb) AS reservations,
      COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at) FROM educational_practice_documents d WHERE d.practice_id = ep.id AND d.laboratory_id = ep.laboratory_id AND d.status = 'ACTIVE'), '[]'::jsonb) || COALESCE((SELECT jsonb_agg(a ORDER BY a.uploaded_at) FROM attachments a WHERE a.entity_id = ep.id AND a.laboratory_id = ep.laboratory_id AND lower(a.entity_type) = 'educational_practice'), '[]'::jsonb) AS documents,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', pp.user_id, 'name', pu.full_name, 'role', pp.participant_role)) FROM educational_practice_participants pp JOIN users pu ON pu.id = pp.user_id WHERE pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.status = 'ACTIVE'), '[]'::jsonb) AS participants
    FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.id = ${id} AND ep.laboratory_id = ${session.laboratoryId} AND ep.teacher_user_id = ${session.userId} LIMIT 1
  ` : access === "STUDENT" ? await sql`
    SELECT ep.*, u.full_name AS teacher_name,
      '[]'::jsonb AS reservations,
      COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at) FROM educational_practice_documents d WHERE d.practice_id = ep.id AND d.laboratory_id = ep.laboratory_id AND d.status = 'ACTIVE'), '[]'::jsonb) || COALESCE((SELECT jsonb_agg(a ORDER BY a.uploaded_at) FROM attachments a WHERE a.entity_id = ep.id AND a.laboratory_id = ep.laboratory_id AND lower(a.entity_type) = 'educational_practice'), '[]'::jsonb) AS documents,
      '[]'::jsonb AS participants
    FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
    LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE'
    LEFT JOIN educational_group_members gm ON gm.group_id = ep.group_id AND gm.laboratory_id = ep.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE'
    WHERE ep.id = ${id} AND ep.laboratory_id = ${session.laboratoryId} AND (pp.id IS NOT NULL OR gm.id IS NOT NULL) LIMIT 1
  ` : await sql`
    SELECT ep.*, u.full_name AS teacher_name,
      COALESCE((SELECT jsonb_agg(r ORDER BY r.created_at) FROM resource_reservations r WHERE r.practice_id = ep.id AND r.laboratory_id = ep.laboratory_id), '[]'::jsonb) AS reservations,
      COALESCE((SELECT jsonb_agg(d ORDER BY d.created_at) FROM educational_practice_documents d WHERE d.practice_id = ep.id AND d.laboratory_id = ep.laboratory_id AND d.status = 'ACTIVE'), '[]'::jsonb) || COALESCE((SELECT jsonb_agg(a ORDER BY a.uploaded_at) FROM attachments a WHERE a.entity_id = ep.id AND a.laboratory_id = ep.laboratory_id AND lower(a.entity_type) = 'educational_practice'), '[]'::jsonb) AS documents,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('userId', pp.user_id, 'name', pu.full_name, 'role', pp.participant_role)) FROM educational_practice_participants pp JOIN users pu ON pu.id = pp.user_id WHERE pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.status = 'ACTIVE'), '[]'::jsonb) AS participants
    FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.id = ${id} AND ep.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: "Práctica no encontrada." }, { status: 404 });
  const shareToken = hasPermission(session, "education.manage") ? await createPracticeShareToken(id, session.laboratoryId) : null;
  return NextResponse.json({ data: { ...rows[0], shareToken }, mode: "database" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para administrar prácticas." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de práctica inválidos.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...parsed.data }, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT * FROM educational_practices WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length || (session.role === "PROFESSOR" && String(previous[0].teacher_user_id) !== session.userId)) return NextResponse.json({ message: "Práctica no encontrada." }, { status: 404 });
  const payload = parsed.data;
  if ((payload.startsAt || payload.endsAt !== undefined) && !isValidPracticeRange(payload.startsAt ?? String(previous[0].starts_at), payload.endsAt === undefined ? String(previous[0].ends_at ?? "") || null : payload.endsAt)) return NextResponse.json({ message: "La hora final debe ser posterior al inicio." }, { status: 400 });
  if (payload.groupId) {
    const groups = await sql`SELECT id FROM educational_groups WHERE id = ${payload.groupId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
    if (!groups.length) return NextResponse.json({ message: "El grupo no pertenece al laboratorio." }, { status: 400 });
  }
  if (payload.action === "DUPLICATE") {
    const suffix = Date.now().toString().slice(-6);
    const duplicated = await sql`INSERT INTO educational_practices (laboratory_id, practice_code, title, course_name, teacher_user_id, group_id, location, starts_at, ends_at, instructions, status, created_by) SELECT laboratory_id, practice_code || '-COPIA-' || ${suffix}, title || ' (copia)', course_name, ${session.userId}, group_id, location, starts_at, ends_at, instructions, 'DRAFT', ${session.userId} FROM educational_practices WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *`;
    await writeAuditEvent(session, { action: "EDUCATIONAL_PRACTICE_DUPLICATED", entityType: "educational_practice", entityId: String(duplicated[0].id), newValue: duplicated[0], metadata: { sourceId: id }, request });
    return NextResponse.json({ data: duplicated[0] }, { status: 201 });
  }
  const targetStatus = payload.action === "CANCEL" ? "CANCELLED" : payload.action === "ARCHIVE" ? "ARCHIVED" : payload.status ?? previous[0].status;
  const rows = await sql`
    UPDATE educational_practices SET
      title = COALESCE(${payload.title ?? null}, title), course_name = CASE WHEN ${payload.courseName === undefined} THEN course_name ELSE ${payload.courseName ?? null} END,
      starts_at = COALESCE(${payload.startsAt ?? null}, starts_at), ends_at = CASE WHEN ${payload.endsAt === undefined} THEN ends_at ELSE ${payload.endsAt ?? null} END,
      instructions = CASE WHEN ${payload.instructions === undefined} THEN instructions ELSE ${payload.instructions ?? null} END,
      group_id = CASE WHEN ${payload.groupId === undefined} THEN group_id ELSE ${payload.groupId ?? null} END,
      location = CASE WHEN ${payload.location === undefined} THEN location ELSE ${payload.location ?? null} END,
      status = ${targetStatus}, cancellation_reason = CASE WHEN ${payload.action === "CANCEL"} THEN ${payload.reason ?? null} ELSE cancellation_reason END,
      cancelled_at = CASE WHEN ${payload.action === "CANCEL"} THEN now() ELSE cancelled_at END,
      archived_at = CASE WHEN ${payload.action === "ARCHIVE"} THEN now() ELSE archived_at END, updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
  `;
  await writeAuditEvent(session, { action: `EDUCATIONAL_PRACTICE_${payload.action}`, entityType: "educational_practice", entityId: id, previousValue: previous[0], newValue: rows[0], reason: payload.reason, request });
  return NextResponse.json({ data: rows[0] });
}
