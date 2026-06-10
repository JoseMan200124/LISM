import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const schema = z.object({
  equipmentId: databaseIdSchema,
  certificateType: z.enum(["CALIBRATION", "QUALIFICATION", "MAINTENANCE", "REPAIR"]),
  certificateNumber: z.string().min(2).max(120),
  providerName: z.string().min(2).max(180),
  issuedAt: z.string().date(),
  expiresAt: z.string().date().optional().nullable(),
  originalFilename: z.string().max(260).optional().default(""),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar certificados." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT c.*, e.code AS equipment_code, e.name AS equipment_name
    FROM equipment_certificates c
    JOIN equipment e ON e.id = c.equipment_id AND e.laboratory_id = c.laboratory_id
    WHERE c.laboratory_id = ${session.laboratoryId}
    ORDER BY c.created_at DESC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para adjuntar certificados." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Certificado inválido.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const equipment = await sql`SELECT id FROM equipment WHERE id = ${payload.equipmentId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!equipment[0]) return NextResponse.json({ message: "Equipo no encontrado." }, { status: 404 });
  const rows = await sql`
    INSERT INTO equipment_certificates (
      laboratory_id, equipment_id, certificate_type, certificate_number, provider_name, issued_at, expires_at
    ) VALUES (
      ${session.laboratoryId}, ${payload.equipmentId}, ${payload.certificateType}, ${payload.certificateNumber}, ${payload.providerName}, ${payload.issuedAt}, ${payload.expiresAt ?? null}
    ) RETURNING *
  `;
  await writeAuditEvent(session, { action: "EQUIPMENT_CERTIFICATE_CREATED", entityType: "equipment_certificate", entityId: String(rows[0].id), newValue: rows[0], reason: "Registro de certificado de equipo", metadata: { originalFilename: payload.originalFilename || null }, request });
  return NextResponse.json({ data: rows[0], attachmentStatus: payload.originalFilename ? "PENDING_OBJECT_STORAGE_UPLOAD" : "NO_FILE_SELECTED" }, { status: 201 });
}
