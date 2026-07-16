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
  groupId: z.string().uuid().optional().nullable(),
  location: z.string().max(180).optional(),
  resources: z.array(z.object({ resourceType: z.enum(["INVENTORY_ITEM", "EQUIPMENT"]), resourceId: z.string().uuid(), quantity: z.number().positive(), unit: z.string().min(1).max(40), neededAt: z.string().datetime({ offset: true }) })).max(100).default([]),
  documents: z.array(z.object({ storageKey: z.string().min(1).max(500), filename: z.string().min(1).max(260), mimeType: z.string().max(120).optional(), sizeBytes: z.number().int().nonnegative().optional() })).max(30).default([]),
  externalLinks: z.array(z.object({ title: z.string().min(2).max(180), url: z.string().url().max(2000), description: z.string().max(1000).optional() })).max(30).default([]),
  participantIds: z.array(z.string().uuid()).max(300).default([]),
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
  const rows = session.role === "PROFESSOR" ? await sql`
    SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at,
      ep.instructions, ep.status, ep.teacher_user_id, u.full_name AS teacher_name
    FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.laboratory_id = ${session.laboratoryId} AND ep.teacher_user_id = ${session.userId}
    ORDER BY ep.starts_at ASC LIMIT 250
  ` : session.role === "STUDENT" ? await sql`
    SELECT DISTINCT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at,
      ep.instructions, ep.status, ep.teacher_user_id, u.full_name AS teacher_name
    FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
    LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE'
    LEFT JOIN educational_group_members gm ON gm.group_id = ep.group_id AND gm.laboratory_id = ep.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE'
    WHERE ep.laboratory_id = ${session.laboratoryId} AND (pp.id IS NOT NULL OR gm.id IS NOT NULL)
    ORDER BY ep.starts_at ASC LIMIT 250
  ` : await sql`
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
  if (payload.groupId) {
    const group = await sql`SELECT id FROM educational_groups WHERE id = ${payload.groupId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
    if (!group.length) return NextResponse.json({ message: "El grupo no pertenece a este laboratorio." }, { status: 400 });
  }
  for (const resource of payload.resources) {
    const rows = resource.resourceType === "INVENTORY_ITEM" ? await sql`SELECT id FROM inventory_items WHERE id = ${resource.resourceId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1` : await sql`SELECT id FROM equipment WHERE id = ${resource.resourceId} AND laboratory_id = ${session.laboratoryId} AND status <> 'RETIRED' LIMIT 1`;
    if (!rows.length) return NextResponse.json({ message: "Uno de los recursos no pertenece al laboratorio o no está disponible." }, { status: 400 });
  }
  if (payload.participantIds.length) {
    const members = await sql`SELECT user_id FROM memberships WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' AND user_id = ANY(${payload.participantIds})`;
    if (members.length !== new Set(payload.participantIds).size) return NextResponse.json({ message: "Uno de los participantes no pertenece al laboratorio." }, { status: 400 });
  }
  const practiceCode = payload.practiceCode ?? await nextPracticeCode(sql, session.laboratoryId);
  const resources = payload.resources.map((resource) => ({ resource_type: resource.resourceType, resource_id: resource.resourceId, quantity: resource.quantity, unit: resource.unit, needed_at: resource.neededAt }));
  const documents = payload.documents.map((document) => ({ storage_key: document.storageKey, filename: document.filename, mime_type: document.mimeType ?? null, size_bytes: document.sizeBytes ?? null }));
  const externalLinks = payload.externalLinks.map((document) => ({ title: document.title, external_url: document.url, description: document.description ?? null }));
  let rows;
  try {
    rows = await sql`
      WITH created_practice AS (
        INSERT INTO educational_practices (laboratory_id, practice_code, title, course_name, teacher_user_id, group_id, location, starts_at, ends_at, instructions, status, created_by)
        VALUES (${session.laboratoryId}, ${practiceCode}, ${payload.title}, ${payload.courseName ?? null}, ${session.userId}, ${payload.groupId ?? null}, ${payload.location ?? null}, ${payload.startsAt}, ${payload.endsAt ?? null}, ${payload.instructions ?? null}, ${status}, ${session.userId})
        RETURNING *
      ), created_reservations AS (
        INSERT INTO resource_reservations (laboratory_id, reservation_code, practice_id, resource_type, resource_id, quantity, unit, needed_at, requested_by)
        SELECT ${session.laboratoryId}, ${practiceCode} || '-R' || row_number() OVER (), cp.id, r.resource_type, r.resource_id, r.quantity, r.unit, r.needed_at, ${session.userId}
        FROM created_practice cp, jsonb_to_recordset(${JSON.stringify(resources)}::jsonb) AS r(resource_type varchar, resource_id uuid, quantity numeric, unit varchar, needed_at timestamptz)
      ), created_participants AS (
        INSERT INTO educational_practice_participants (laboratory_id, practice_id, user_id)
        SELECT ${session.laboratoryId}, cp.id, p.user_id FROM created_practice cp, jsonb_to_recordset(${JSON.stringify(payload.participantIds.map((userId) => ({ user_id: userId })))}::jsonb) AS p(user_id uuid)
        ON CONFLICT (practice_id, user_id) DO NOTHING
      ), created_documents AS (
        INSERT INTO attachments (laboratory_id, entity_type, entity_id, storage_key, original_filename, mime_type, size_bytes, uploaded_by)
        SELECT ${session.laboratoryId}, 'educational_practice', cp.id, d.storage_key, d.filename, d.mime_type, d.size_bytes, ${session.userId}
        FROM created_practice cp, jsonb_to_recordset(${JSON.stringify(documents)}::jsonb) AS d(storage_key text, filename varchar, mime_type varchar, size_bytes bigint)
      ), created_links AS (
        INSERT INTO educational_practice_documents (laboratory_id, practice_id, document_type, title, external_url, description, created_by)
        SELECT ${session.laboratoryId}, cp.id, 'EXTERNAL_LINK', d.title, d.external_url, d.description, ${session.userId}
        FROM created_practice cp, jsonb_to_recordset(${JSON.stringify(externalLinks)}::jsonb) AS d(title varchar, external_url text, description text)
      ) SELECT * FROM created_practice
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
