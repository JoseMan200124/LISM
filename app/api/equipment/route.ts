import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { equipmentRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { createDemoQrLabel, createOpaqueToken } from "@/lib/qr-security";

const schema = z.object({
  code: z.string().min(2).max(60),
  name: z.string().min(2).max(180),
  departmentId: databaseIdSchema.optional().nullable(),
  storageLocationId: databaseIdSchema.optional().nullable(),
  locationName: z.string().min(2).max(160).optional(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  manufacturer: z.string().max(120).optional().default(""),
  model: z.string().max(120).optional().default(""),
  serialNumber: z.string().max(120).optional().default(""),
  status: z.enum(["OPERATIONAL", "MAINTENANCE_DUE", "OUT_OF_SERVICE", "RETIRED"]).default("OPERATIONAL"),
  nextMaintenanceAt: z.string().date().optional().nullable(),
  notes: z.string().max(2000).optional().default(""),
});

function locationCode(value: string) {
  const simplified = value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `UBI-${simplified || "GENERAL"}`.slice(0, 60);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar equipos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: equipmentRows, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.code, e.name, e.manufacturer, e.model, e.serial_number,
      COALESCE(l.name, 'Sin ubicación') AS location, e.status, e.last_calibration_at,
      e.next_maintenance_at, COALESCE(u.full_name, 'Sin responsable') AS responsible
    FROM equipment e
    LEFT JOIN storage_locations l ON l.id = e.storage_location_id AND l.laboratory_id = e.laboratory_id
    LEFT JOIN users u ON u.id = e.responsible_user_id
    WHERE e.laboratory_id = ${session.laboratoryId}
    ORDER BY e.name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para crear equipos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de equipo inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) {
    const id = crypto.randomUUID();
    const location = payload.locationName || "Sin ubicación";
    const label = createDemoQrLabel({
      entityType: "EQUIPMENT",
      entityId: id,
      labelCode: payload.code,
      displayName: payload.name,
      location,
      status: payload.status === "OPERATIONAL" ? "Operativo" : payload.status,
      summary: [
        { label: "Marca", value: payload.manufacturer || "Sin registrar" },
        { label: "Modelo", value: payload.model || "Sin registrar" },
        { label: "Serie", value: payload.serialNumber || "Sin registrar" },
        { label: "Próximo mantenimiento", value: payload.nextMaintenanceAt || "Sin programar" },
      ],
    });
    return NextResponse.json({ data: { id, ...payload, qrIdentifierId: label.id, qrToken: label.opaqueToken, mode: "demo" } }, { status: 201 });
  }

  const sql = getSql();
  let storageLocationId = payload.storageLocationId;
  if (!storageLocationId && payload.locationName) {
    const locations = await sql`
      INSERT INTO storage_locations (laboratory_id, code, name)
      VALUES (${session.laboratoryId}, ${locationCode(payload.locationName)}, ${payload.locationName})
      ON CONFLICT (laboratory_id, code)
      DO UPDATE SET name = EXCLUDED.name, status = 'ACTIVE'
      RETURNING id
    `;
    storageLocationId = String(locations[0].id);
  }

  const rows = await sql`
    INSERT INTO equipment (
      laboratory_id, department_id, storage_location_id, responsible_user_id, code, name,
      manufacturer, model, serial_number, status, next_maintenance_at, notes
    ) VALUES (
      ${session.laboratoryId}, ${payload.departmentId ?? null}, ${storageLocationId ?? null}, ${payload.responsibleUserId ?? null}, ${payload.code}, ${payload.name},
      ${payload.manufacturer || null}, ${payload.model || null}, ${payload.serialNumber || null}, ${payload.status}, ${payload.nextMaintenanceAt ?? null}, ${payload.notes || null}
    )
    RETURNING id, code, name, manufacturer, model, serial_number, status, next_maintenance_at
  `;
  const qrRows = await sql`
    INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
    VALUES (${session.laboratoryId}, 'EQUIPMENT', ${String(rows[0].id)}, ${createOpaqueToken()}, ${payload.code})
    ON CONFLICT (laboratory_id, entity_type, entity_id)
    DO UPDATE SET status = 'ACTIVE'
    RETURNING id, opaque_token, label_code
  `;
  await writeAuditEvent(session, {
    action: "EQUIPMENT_CREATED",
    entityType: "equipment",
    entityId: String(rows[0].id),
    newValue: { ...rows[0], qrIdentifierId: qrRows[0].id },
    reason: "Alta de equipo con etiqueta QR segura",
    metadata: { code: payload.code, qrIdentifierId: qrRows[0].id },
    request,
  });
  return NextResponse.json({ data: { ...rows[0], qrIdentifierId: qrRows[0].id, qrToken: qrRows[0].opaque_token } }, { status: 201 });
}
