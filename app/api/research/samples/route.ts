import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX, SAMPLE_STATUSES, SAMPLE_TYPES } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";
import { createOpaqueToken } from "@/lib/qr-security";

// Registro de muestras de investigación. La muestra se registra una sola vez;
// si después requiere conservación, pasa al biobanco sin volver a capturarse.
//
// El proyecto es opcional a propósito: hay muestras que entran sueltas en el
// día a día y no pertenecen a ninguna línea de trabajo.

const createSchema = z.object({
  alias: z.string().max(200).optional(),
  sampleType: z.enum(SAMPLE_TYPES),
  projectId: databaseIdSchema.optional().nullable(),
  protocolIds: z.array(databaseIdSchema).max(20).optional(),
  status: z.enum(SAMPLE_STATUSES).optional(),
  // Origen
  sourceInstitution: z.string().max(200).optional(),
  collectedBy: z.string().max(200).optional(),
  collectedOn: z.string().date().optional().nullable(),
  collectedAtTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  collectionPlace: z.string().max(240).optional(),
  collectionMethod: z.string().max(200).optional(),
  gpsLatitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  gpsLongitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  country: z.string().max(120).optional(),
  department: z.string().max(120).optional(),
  municipality: z.string().max(120).optional(),
  specificSite: z.string().max(240).optional(),
  // Bloques dinámicos según el tipo de muestra.
  sourceDetails: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  typeDetails: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  storageLocationId: databaseIdSchema.optional().nullable(),
  storageNote: z.string().max(240).optional(),
  notes: z.string().max(4000).optional(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  const status = url.searchParams.get("status");
  const sampleType = url.searchParams.get("type");
  if (projectId && !databaseIdSchema.safeParse(projectId).success) {
    return NextResponse.json({ message: "Identificador de proyecto inválido." }, { status: 400 });
  }

  const rows = await sql`
    SELECT s.id, s.code, s.alias, s.sample_type, s.status, s.registered_at, s.collected_on,
           s.collection_place, s.municipality, s.department,
           p.code AS project_code, p.title AS project_title,
           u.full_name AS responsible_name,
           (SELECT count(*)::int FROM biobank_entries b WHERE b.sample_id = s.id) AS biobank_count
    FROM research_samples s
    LEFT JOIN research_projects p ON p.id = s.project_id
    LEFT JOIN users u ON u.id = s.responsible_user_id
    WHERE s.laboratory_id = ${session.laboratoryId}
      AND (${projectId ?? null}::uuid IS NULL OR s.project_id = ${projectId ?? null}::uuid)
      AND (${status ?? null}::text IS NULL OR s.status = ${status ?? null})
      AND (${sampleType ?? null}::text IS NULL OR s.sample_type = ${sampleType ?? null})
    ORDER BY s.registered_at DESC
    LIMIT 400
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos de la muestra.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO research_samples (
          laboratory_id, code, alias, sample_type, project_id, status,
          source_institution, collected_by, collected_on, collected_at_time, collection_place, collection_method,
          gps_latitude, gps_longitude, country, department, municipality, specific_site,
          source_details, type_details, responsible_user_id, storage_location_id, storage_note, notes, registered_by
        ) VALUES (
          ${session.laboratoryId}, ${code}, ${payload.alias ?? null}, ${payload.sampleType}, ${payload.projectId ?? null}, ${payload.status ?? "REGISTERED"},
          ${payload.sourceInstitution ?? null}, ${payload.collectedBy ?? null}, ${payload.collectedOn ?? null}, ${payload.collectedAtTime ?? null},
          ${payload.collectionPlace ?? null}, ${payload.collectionMethod ?? null},
          ${payload.gpsLatitude ?? null}, ${payload.gpsLongitude ?? null}, ${payload.country ?? null}, ${payload.department ?? null},
          ${payload.municipality ?? null}, ${payload.specificSite ?? null},
          ${JSON.stringify(payload.sourceDetails ?? {})}::jsonb, ${JSON.stringify(payload.typeDetails ?? {})}::jsonb,
          ${payload.responsibleUserId ?? session.userId}, ${payload.storageLocationId ?? null}, ${payload.storageNote ?? null},
          ${payload.notes ?? null}, ${session.userId}
        ) RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "research_samples", session.laboratoryId, CODE_PREFIX.sample, 4),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código de la muestra." }, { status: 500 });

  const sampleId = String(created.id);

  // Etiqueta QR segura, igual que para inventario y equipos: la muestra se
  // identifica sin exponer datos en el código.
  const qr = await sql`
    INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
    VALUES (${session.laboratoryId}, 'RESEARCH_SAMPLE', ${sampleId}, ${createOpaqueToken()}, ${String(created.code)})
    ON CONFLICT (laboratory_id, entity_type, entity_id) DO UPDATE SET status = 'ACTIVE'
    RETURNING id, opaque_token
  `.catch(() => [] as Array<Record<string, unknown>>);

  for (const protocolId of payload.protocolIds ?? []) {
    await sql`
      INSERT INTO research_sample_protocols (sample_id, protocol_id, laboratory_id)
      VALUES (${sampleId}, ${protocolId}, ${session.laboratoryId})
      ON CONFLICT (sample_id, protocol_id) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, new_status, detail, performed_by, performed_by_name)
    VALUES (${sampleId}, ${session.laboratoryId}, 'REGISTERED', ${String(created.status)}, 'Muestra ingresada al sistema', ${session.userId}, ${session.name})
  `;

  if (payload.projectId) {
    await sql`
      INSERT INTO research_project_links (project_id, laboratory_id, entity_type, entity_id, created_by)
      VALUES (${payload.projectId}, ${session.laboratoryId}, 'SAMPLE', ${sampleId}, ${session.userId})
      ON CONFLICT (project_id, entity_type, entity_id) DO NOTHING
    `;
  }

  await writeAuditEvent(session, {
    action: "RESEARCH_SAMPLE_REGISTERED",
    entityType: "research_sample",
    entityId: sampleId,
    newValue: created,
    reason: "Registro de muestra de investigación",
    metadata: payload.projectId ? { projectId: payload.projectId } : undefined,
    request,
  });

  return NextResponse.json({ data: { ...created, qrToken: qr[0]?.opaque_token ?? null } }, { status: 201 });
}
