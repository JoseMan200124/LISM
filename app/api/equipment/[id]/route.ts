import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const EQUIPMENT_STATUSES = ["OPERATIONAL", "MAINTENANCE_DUE", "OUT_OF_SERVICE", "RETIRED"] as const;

const patchSchema = z.object({
  name: z.string().min(2).max(180).optional(),
  manufacturer: z.string().max(120).optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  serialNumber: z.string().max(120).optional().nullable(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  storageLocationId: databaseIdSchema.optional().nullable(),
  status: z.enum(EQUIPMENT_STATUSES).optional(),
  notes: z.string().max(2000).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.view")) return NextResponse.json({ message: "No tienes permiso para consultar equipos." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT e.id, e.code, e.name, e.manufacturer, e.model, e.serial_number,
      COALESCE(l.name, 'Sin ubicación') AS location, e.storage_location_id, e.status,
      e.last_calibration_at, e.next_maintenance_at, e.notes,
      e.responsible_user_id, COALESCE(u.full_name, 'Sin responsable') AS responsible
    FROM equipment e
    LEFT JOIN storage_locations l ON l.id = e.storage_location_id AND l.laboratory_id = e.laboratory_id
    LEFT JOIN users u ON u.id = e.responsible_user_id
    WHERE e.id = ${id} AND e.laboratory_id = ${session.laboratoryId}
    LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ message: "Equipo no encontrado." }, { status: 404 });

  const plans = await sql`
    SELECT id, plan_type, name, frequency_value, frequency_unit, next_due_at, blocks_use_when_overdue, status
    FROM equipment_plans WHERE equipment_id = ${id} AND laboratory_id = ${session.laboratoryId}
    ORDER BY next_due_at NULLS LAST
  `;
  const events = await sql`
    SELECT id, event_type, scheduled_for, completed_at, details
    FROM equipment_events WHERE equipment_id = ${id} AND laboratory_id = ${session.laboratoryId}
    ORDER BY created_at DESC LIMIT 50
  `;
  const certificates = await sql`
    SELECT id, certificate_type, certificate_number, provider_name, issued_at, expires_at
    FROM equipment_certificates WHERE equipment_id = ${id} AND laboratory_id = ${session.laboratoryId}
    ORDER BY issued_at DESC NULLS LAST
  `;
  return NextResponse.json({ data: { ...rows[0], plans, events, certificates }, mode: "database" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "equipment.manage")) return NextResponse.json({ message: "No tienes permiso para editar equipos." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de equipo inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });

  const sql = getSql();
  const previous = await sql`SELECT * FROM equipment WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Equipo no encontrado." }, { status: 404 });

  // COALESCE(${maybeUndefined}, columna): cada campo omitido conserva su valor
  // actual; los enviados se actualizan. undefined -> null en el driver, por eso
  // se pasa `?? null` explícito para que COALESCE tome la columna existente.
  const rows = await sql`
    UPDATE equipment SET
      name = COALESCE(${payload.name ?? null}, name),
      manufacturer = COALESCE(${payload.manufacturer ?? null}, manufacturer),
      model = COALESCE(${payload.model ?? null}, model),
      serial_number = COALESCE(${payload.serialNumber ?? null}, serial_number),
      responsible_user_id = COALESCE(${payload.responsibleUserId ?? null}, responsible_user_id),
      storage_location_id = COALESCE(${payload.storageLocationId ?? null}, storage_location_id),
      status = COALESCE(${payload.status ?? null}, status),
      notes = COALESCE(${payload.notes ?? null}, notes),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, code, name, manufacturer, model, serial_number, status, notes, responsible_user_id
  `;
  const statusChanged = payload.status && payload.status !== previous[0].status;
  await writeAuditEvent(session, {
    action: statusChanged ? "EQUIPMENT_STATUS_CHANGED" : "EQUIPMENT_UPDATED",
    entityType: "equipment",
    entityId: id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: "Edición de equipo",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
