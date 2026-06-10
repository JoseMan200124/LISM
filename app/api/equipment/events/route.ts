import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  equipmentId: databaseIdSchema,
  eventType: z.enum(["VERIFICATION", "MAINTENANCE", "CALIBRATION", "REPAIR", "CLEANING"]),
  details: z.string().min(3).max(2000),
  originalFilename: z.string().max(260).optional().default(""),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar eventos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT ev.*, e.code AS equipment_code, e.name AS equipment_name
    FROM equipment_events ev
    JOIN equipment e ON e.id = ev.equipment_id AND e.laboratory_id = ev.laboratory_id
    WHERE ev.laboratory_id = ${session.laboratoryId}
    ORDER BY ev.created_at DESC LIMIT 250
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para registrar eventos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Evento inválido.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, completedAt: new Date().toISOString() }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const equipment = await sql`SELECT id FROM equipment WHERE id = ${payload.equipmentId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!equipment[0]) return NextResponse.json({ message: "Equipo no encontrado." }, { status: 404 });
  const rows = await sql`
    INSERT INTO equipment_events (laboratory_id, equipment_id, event_type, completed_at, details, performed_by)
    VALUES (${session.laboratoryId}, ${payload.equipmentId}, ${payload.eventType}, now(), ${payload.details}, ${session.userId})
    RETURNING *
  `;
  await writeAuditEvent(session, { action: "EQUIPMENT_EVENT_CREATED", entityType: "equipment", entityId: payload.equipmentId, newValue: rows[0], reason: payload.details, metadata: { originalFilename: payload.originalFilename || null }, request });
  return NextResponse.json({ data: rows[0], attachmentStatus: payload.originalFilename ? "PENDING_OBJECT_STORAGE_UPLOAD" : "NO_FILE_SELECTED" }, { status: 201 });
}
