import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { BIOBANK_MOVEMENT_TYPES, BIOBANK_STATUSES, STORAGE_KINDS, expiryFromShelfLife } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";

// Ficha del material conservado: ubicación, condiciones, historial de
// movimientos y controles de calidad.

export const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    status: z.enum(BIOBANK_STATUSES).optional(),
    materialType: z.string().max(120).optional().nullable(),
    responsibleUserId: databaseIdSchema.optional().nullable(),
    building: z.string().max(120).optional().nullable(),
    laboratoryRoom: z.string().max(120).optional().nullable(),
    room: z.string().max(120).optional().nullable(),
    equipmentId: databaseIdSchema.optional().nullable(),
    shelf: z.string().max(60).optional().nullable(),
    rack: z.string().max(60).optional().nullable(),
    box: z.string().max(60).optional().nullable(),
    position: z.string().max(60).optional().nullable(),
    storageKind: z.enum(STORAGE_KINDS).optional().nullable(),
    temperatureC: z.coerce.number().min(-273).max(200).optional().nullable(),
    shelfLifeMonths: z.coerce.number().int().min(1).max(1200).optional().nullable(),
    expiresOn: z.string().date().optional().nullable(),
    removedOn: z.string().date().optional().nullable(),
    aliquotCount: z.coerce.number().int().min(0).max(100000).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
  }),
  z.object({
    action: z.literal("MOVEMENT"),
    movementType: z.enum(BIOBANK_MOVEMENT_TYPES),
    detail: z.string().max(2000).optional(),
    quantity: z.coerce.number().min(0).optional().nullable(),
    unit: z.string().max(40).optional(),
    destination: z.string().max(240).optional(),
    newStatus: z.enum(BIOBANK_STATUSES).optional(),
  }),
  z.object({
    action: z.literal("QUALITY_CHECK"),
    checkedOn: z.string().date().optional(),
    integrity: z.string().max(120).optional(),
    concentration: z.string().max(120).optional(),
    purity: z.string().max(120).optional(),
    contamination: z.string().max(120).optional(),
    cellViability: z.string().max(120).optional(),
    result: z.enum(["PASS", "WARNING", "FAIL"]),
    note: z.string().max(2000).optional(),
  }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const entries = await sql`
    SELECT b.*, s.code AS sample_code, s.alias AS sample_alias, s.sample_type,
           p.code AS project_code, p.title AS project_title,
           e.name AS equipment_name, e.code AS equipment_code, u.full_name AS responsible_name
    FROM biobank_entries b
    JOIN research_samples s ON s.id = b.sample_id
    LEFT JOIN research_projects p ON p.id = b.project_id
    LEFT JOIN equipment e ON e.id = b.equipment_id
    LEFT JOIN users u ON u.id = b.responsible_user_id
    WHERE b.id = ${id} AND b.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!entries.length) return NextResponse.json({ message: "Registro de biobanco no encontrado." }, { status: 404 });

  const [movements, checks] = await Promise.all([
    sql`
      SELECT m.*, u.full_name AS performed_by_name
      FROM biobank_movements m LEFT JOIN users u ON u.id = m.performed_by
      WHERE m.biobank_entry_id = ${id} AND m.laboratory_id = ${session.laboratoryId}
      ORDER BY m.performed_at DESC LIMIT 200
    `,
    sql`
      SELECT q.*, u.full_name AS checked_by_name
      FROM biobank_quality_checks q LEFT JOIN users u ON u.id = q.checked_by
      WHERE q.biobank_entry_id = ${id} AND q.laboratory_id = ${session.laboratoryId}
      ORDER BY q.checked_on DESC LIMIT 100
    `,
  ]);

  return NextResponse.json({ data: { ...entries[0], movements, checks } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const rows = await sql`SELECT * FROM biobank_entries WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Registro de biobanco no encontrado." }, { status: 404 });
  const entry = rows[0] as Record<string, unknown>;

  switch (payload.action) {
    case "UPDATE": {
      const shelfLife = payload.shelfLifeMonths === undefined ? (entry.shelf_life_months as number | null) : payload.shelfLifeMonths;
      const storedOn = entry.stored_on ? String(entry.stored_on).slice(0, 10) : null;
      const expiresOn = payload.expiresOn !== undefined
        ? payload.expiresOn
        : payload.shelfLifeMonths !== undefined
          ? expiryFromShelfLife(storedOn, shelfLife)
          : (entry.expires_on as string | null);
      const updated = await sql`
        UPDATE biobank_entries SET
          status = COALESCE(${payload.status ?? null}, status),
          material_type = ${payload.materialType === undefined ? entry.material_type : payload.materialType},
          responsible_user_id = ${payload.responsibleUserId === undefined ? entry.responsible_user_id : payload.responsibleUserId},
          building = ${payload.building === undefined ? entry.building : payload.building},
          laboratory_room = ${payload.laboratoryRoom === undefined ? entry.laboratory_room : payload.laboratoryRoom},
          room = ${payload.room === undefined ? entry.room : payload.room},
          equipment_id = ${payload.equipmentId === undefined ? entry.equipment_id : payload.equipmentId},
          shelf = ${payload.shelf === undefined ? entry.shelf : payload.shelf},
          rack = ${payload.rack === undefined ? entry.rack : payload.rack},
          box = ${payload.box === undefined ? entry.box : payload.box},
          position = ${payload.position === undefined ? entry.position : payload.position},
          storage_kind = ${payload.storageKind === undefined ? entry.storage_kind : payload.storageKind},
          temperature_c = ${payload.temperatureC === undefined ? entry.temperature_c : payload.temperatureC},
          shelf_life_months = ${shelfLife},
          expires_on = ${expiresOn},
          removed_on = ${payload.removedOn === undefined ? entry.removed_on : payload.removedOn},
          aliquot_count = ${payload.aliquotCount === undefined ? entry.aliquot_count : payload.aliquotCount},
          notes = ${payload.notes === undefined ? entry.notes : payload.notes},
          updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "BIOBANK_ENTRY_UPDATED", entityType: "biobank_entry", entityId: id,
        previousValue: entry, newValue: updated[0], reason: "Actualización del registro de biobanco",
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    case "MOVEMENT": {
      const created = await sql`
        INSERT INTO biobank_movements (biobank_entry_id, laboratory_id, movement_type, detail, quantity, unit, destination, performed_by)
        VALUES (${id}, ${session.laboratoryId}, ${payload.movementType}, ${payload.detail ?? null}, ${payload.quantity ?? null},
                ${payload.unit ?? null}, ${payload.destination ?? null}, ${session.userId})
        RETURNING *
      `;
      // El movimiento puede cambiar el estado del material (prestado, agotado…).
      const nextStatus = payload.newStatus
        ?? (payload.movementType === "LOANED" ? "LOANED"
          : payload.movementType === "RETURNED" ? "ACTIVE"
          : payload.movementType === "DISCARDED" ? "DISCARDED"
          : null);
      if (nextStatus) {
        await sql`UPDATE biobank_entries SET status = ${nextStatus}, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      }
      await writeAuditEvent(session, {
        action: "BIOBANK_MOVEMENT_REGISTERED", entityType: "biobank_entry", entityId: id,
        newValue: created[0], reason: payload.detail || `Movimiento ${payload.movementType}`,
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: created[0] }, { status: 201 });
    }

    case "QUALITY_CHECK": {
      const created = await sql`
        INSERT INTO biobank_quality_checks (
          biobank_entry_id, laboratory_id, checked_on, integrity, concentration, purity,
          contamination, cell_viability, result, note, checked_by
        ) VALUES (
          ${id}, ${session.laboratoryId}, ${payload.checkedOn ?? new Date().toISOString().slice(0, 10)},
          ${payload.integrity ?? null}, ${payload.concentration ?? null}, ${payload.purity ?? null},
          ${payload.contamination ?? null}, ${payload.cellViability ?? null}, ${payload.result}, ${payload.note ?? null}, ${session.userId}
        ) RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "BIOBANK_QUALITY_CHECK", entityType: "biobank_entry", entityId: id,
        newValue: created[0], reason: `Control de calidad: ${payload.result}`,
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: created[0] }, { status: 201 });
    }
  }
}
