import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { BIOBANK_STATUSES, CODE_PREFIX, STORAGE_KINDS, expiryFromShelfLife } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Biobanco: la muestra ya registrada pasa a conservación con su ubicación,
// condiciones y control de calidad. No se vuelve a capturar la muestra: se
// selecciona desde el registro y el proyecto se hereda de ella.

const createSchema = z.object({
  sampleId: databaseIdSchema,
  materialType: z.string().max(120).optional(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  status: z.enum(BIOBANK_STATUSES).optional(),
  building: z.string().max(120).optional(),
  laboratoryRoom: z.string().max(120).optional(),
  room: z.string().max(120).optional(),
  equipmentId: databaseIdSchema.optional().nullable(),
  shelf: z.string().max(60).optional(),
  rack: z.string().max(60).optional(),
  box: z.string().max(60).optional(),
  position: z.string().max(60).optional(),
  storageKind: z.enum(STORAGE_KINDS).optional(),
  temperatureC: z.coerce.number().min(-273).max(200).optional().nullable(),
  storedOn: z.string().date().optional().nullable(),
  shelfLifeMonths: z.coerce.number().int().min(1).max(1200).optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
  aliquotCount: z.coerce.number().int().min(0).max(100000).optional().nullable(),
  volumeAmount: z.coerce.number().min(0).optional().nullable(),
  volumeUnit: z.string().max(40).optional(),
  notes: z.string().max(4000).optional(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const projectId = url.searchParams.get("projectId");

  const rows = await sql`
    SELECT b.id, b.code, b.status, b.material_type, b.storage_kind, b.temperature_c,
           b.building, b.laboratory_room, b.room, b.shelf, b.rack, b.box, b.position,
           b.stored_on, b.expires_on, b.aliquot_count,
           s.code AS sample_code, s.alias AS sample_alias, s.sample_type,
           p.code AS project_code, p.title AS project_title,
           e.name AS equipment_name, u.full_name AS responsible_name,
           (SELECT max(q.checked_on) FROM biobank_quality_checks q WHERE q.biobank_entry_id = b.id) AS last_check_on,
           (SELECT q.result FROM biobank_quality_checks q WHERE q.biobank_entry_id = b.id ORDER BY q.checked_on DESC LIMIT 1) AS last_check_result
    FROM biobank_entries b
    JOIN research_samples s ON s.id = b.sample_id
    LEFT JOIN research_projects p ON p.id = b.project_id
    LEFT JOIN equipment e ON e.id = b.equipment_id
    LEFT JOIN users u ON u.id = b.responsible_user_id
    WHERE b.laboratory_id = ${session.laboratoryId}
      AND (${status ?? null}::text IS NULL OR b.status = ${status ?? null})
      AND (${projectId ?? null}::uuid IS NULL OR b.project_id = ${projectId ?? null}::uuid)
    ORDER BY b.created_at DESC
    LIMIT 400
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del ingreso al biobanco.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const samples = await sql`SELECT id, code, project_id, status FROM research_samples WHERE id = ${payload.sampleId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  const sample = samples[0] as Record<string, unknown> | undefined;
  if (!sample) return NextResponse.json({ message: "La muestra seleccionada no existe en este laboratorio." }, { status: 404 });

  const storedOn = payload.storedOn ?? new Date().toISOString().slice(0, 10);
  // La fecha de expiración se calcula desde la vida útil si no viene explícita.
  const expiresOn = payload.expiresOn ?? expiryFromShelfLife(storedOn, payload.shelfLifeMonths ?? null);

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO biobank_entries (
          laboratory_id, code, sample_id, project_id, responsible_user_id, material_type, status,
          building, laboratory_room, room, equipment_id, shelf, rack, box, position,
          storage_kind, temperature_c, stored_on, shelf_life_months, expires_on,
          aliquot_count, volume_amount, volume_unit, notes, created_by
        ) VALUES (
          ${session.laboratoryId}, ${code}, ${payload.sampleId}, ${sample.project_id ?? null}, ${payload.responsibleUserId ?? session.userId},
          ${payload.materialType ?? null}, ${payload.status ?? "ACTIVE"},
          ${payload.building ?? null}, ${payload.laboratoryRoom ?? null}, ${payload.room ?? null}, ${payload.equipmentId ?? null},
          ${payload.shelf ?? null}, ${payload.rack ?? null}, ${payload.box ?? null}, ${payload.position ?? null},
          ${payload.storageKind ?? null}, ${payload.temperatureC ?? null}, ${storedOn}, ${payload.shelfLifeMonths ?? null}, ${expiresOn},
          ${payload.aliquotCount ?? null}, ${payload.volumeAmount ?? null}, ${payload.volumeUnit ?? null}, ${payload.notes ?? null}, ${session.userId}
        ) RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "biobank_entries", session.laboratoryId, CODE_PREFIX.biobank, 4),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del biobanco." }, { status: 500 });

  await sql`
    INSERT INTO biobank_movements (biobank_entry_id, laboratory_id, movement_type, detail, performed_by)
    VALUES (${String(created.id)}, ${session.laboratoryId}, 'STORED', 'Ingreso al biobanco', ${session.userId})
  `;
  // La muestra queda marcada como conservada: es su estado real a partir de aquí.
  await sql`
    UPDATE research_samples SET status = 'STORED', updated_at = now()
    WHERE id = ${payload.sampleId} AND laboratory_id = ${session.laboratoryId} AND status NOT IN ('DISCARDED')
  `;
  await sql`
    INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, previous_status, new_status, detail, performed_by, performed_by_name)
    VALUES (${payload.sampleId}, ${session.laboratoryId}, 'STORED', ${String(sample.status)}, 'STORED',
            ${`Ingresada al biobanco con el código ${String(created.code)}`}, ${session.userId}, ${session.name})
  `;

  await writeAuditEvent(session, {
    action: "BIOBANK_ENTRY_CREATED",
    entityType: "biobank_entry",
    entityId: String(created.id),
    newValue: created,
    reason: "Ingreso de material al biobanco",
    metadata: sample.project_id ? { projectId: String(sample.project_id) } : undefined,
    request,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
