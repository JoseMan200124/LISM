import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { SAMPLE_STATUSES, SAMPLE_STATUS_LABEL } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";

// Ficha de la muestra: datos, protocolos aplicados, biobanco e historial
// completo de quién hizo qué.

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    alias: z.string().max(200).optional().nullable(),
    projectId: databaseIdSchema.optional().nullable(),
    responsibleUserId: databaseIdSchema.optional().nullable(),
    storageLocationId: databaseIdSchema.optional().nullable(),
    storageNote: z.string().max(240).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    sourceDetails: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    typeDetails: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  }),
  z.object({ action: z.literal("STATUS"), status: z.enum(SAMPLE_STATUSES), detail: z.string().max(2000).optional() }),
  z.object({ action: z.literal("NOTE"), detail: z.string().min(2).max(2000) }),
  z.object({ action: z.literal("LINK_PROTOCOL"), protocolId: databaseIdSchema }),
  z.object({ action: z.literal("UNLINK_PROTOCOL"), protocolId: databaseIdSchema }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const samples = await sql`
    SELECT s.*, p.code AS project_code, p.title AS project_title,
           u.full_name AS responsible_name, r.full_name AS registered_by_name,
           l.name AS storage_location_name
    FROM research_samples s
    LEFT JOIN research_projects p ON p.id = s.project_id
    LEFT JOIN users u ON u.id = s.responsible_user_id
    LEFT JOIN users r ON r.id = s.registered_by
    LEFT JOIN storage_locations l ON l.id = s.storage_location_id
    WHERE s.id = ${id} AND s.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!samples.length) return NextResponse.json({ message: "Muestra no encontrada." }, { status: 404 });

  const [events, protocols, biobank, attachments] = await Promise.all([
    sql`
      SELECT e.*, u.full_name AS performed_by_full_name
      FROM research_sample_events e LEFT JOIN users u ON u.id = e.performed_by
      WHERE e.sample_id = ${id} AND e.laboratory_id = ${session.laboratoryId}
      ORDER BY e.performed_at DESC LIMIT 200
    `,
    sql`
      SELECT p.id, p.code, p.title, p.status FROM research_sample_protocols sp
      JOIN protocols p ON p.id = sp.protocol_id
      WHERE sp.sample_id = ${id} AND sp.laboratory_id = ${session.laboratoryId}
    `,
    sql`
      SELECT id, code, status, storage_kind, temperature_c, stored_on, expires_on
      FROM biobank_entries WHERE sample_id = ${id} AND laboratory_id = ${session.laboratoryId}
      ORDER BY created_at DESC
    `,
    sql`
      SELECT id, original_filename, mime_type, version_number, created_at
      FROM attachments WHERE entity_type = 'research_sample' AND entity_id = ${id} AND laboratory_id = ${session.laboratoryId}
      ORDER BY created_at DESC
    `.catch(() => [] as Array<Record<string, unknown>>),
  ]);

  return NextResponse.json({ data: { ...samples[0], events, protocols, biobank, attachments } });
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

  const existing = await sql`SELECT * FROM research_samples WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ message: "Muestra no encontrada." }, { status: 404 });
  const sample = existing[0] as Record<string, unknown>;

  switch (payload.action) {
    case "UPDATE": {
      const rows = await sql`
        UPDATE research_samples SET
          alias = ${payload.alias === undefined ? sample.alias : payload.alias},
          project_id = ${payload.projectId === undefined ? sample.project_id : payload.projectId},
          responsible_user_id = ${payload.responsibleUserId === undefined ? sample.responsible_user_id : payload.responsibleUserId},
          storage_location_id = ${payload.storageLocationId === undefined ? sample.storage_location_id : payload.storageLocationId},
          storage_note = ${payload.storageNote === undefined ? sample.storage_note : payload.storageNote},
          notes = ${payload.notes === undefined ? sample.notes : payload.notes},
          source_details = COALESCE(${payload.sourceDetails ? JSON.stringify(payload.sourceDetails) : null}::jsonb, source_details),
          type_details = COALESCE(${payload.typeDetails ? JSON.stringify(payload.typeDetails) : null}::jsonb, type_details),
          updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await sql`
        INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, detail, performed_by, performed_by_name)
        VALUES (${id}, ${session.laboratoryId}, 'NOTE', 'Datos de la muestra actualizados', ${session.userId}, ${session.name})
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_SAMPLE_UPDATED", entityType: "research_sample", entityId: id,
        previousValue: sample, newValue: rows[0], reason: "Actualización de la muestra",
        metadata: rows[0].project_id ? { projectId: String(rows[0].project_id) } : undefined, request,
      });
      return NextResponse.json({ data: rows[0] });
    }

    case "STATUS": {
      const previousStatus = String(sample.status);
      if (previousStatus === payload.status) return NextResponse.json({ data: sample });
      const rows = await sql`
        UPDATE research_samples SET status = ${payload.status}, updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      const eventType = payload.status === "ANALYZED" ? "ANALYZED" : payload.status === "REPORTED" ? "REPORTED" : payload.status === "DISCARDED" ? "DISCARDED" : "STATUS_CHANGED";
      await sql`
        INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, previous_status, new_status, detail, performed_by, performed_by_name)
        VALUES (${id}, ${session.laboratoryId}, ${eventType}, ${previousStatus}, ${payload.status},
                ${payload.detail ?? `Estado: ${SAMPLE_STATUS_LABEL[payload.status]}`}, ${session.userId}, ${session.name})
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_SAMPLE_STATUS_CHANGED", entityType: "research_sample", entityId: id,
        previousValue: { status: previousStatus }, newValue: { status: payload.status },
        reason: payload.detail || `Cambio de estado a ${SAMPLE_STATUS_LABEL[payload.status]}`,
        metadata: sample.project_id ? { projectId: String(sample.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: rows[0] });
    }

    case "NOTE": {
      await sql`
        INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, detail, performed_by, performed_by_name)
        VALUES (${id}, ${session.laboratoryId}, 'NOTE', ${payload.detail}, ${session.userId}, ${session.name})
      `;
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    case "LINK_PROTOCOL": {
      await sql`
        INSERT INTO research_sample_protocols (sample_id, protocol_id, laboratory_id)
        VALUES (${id}, ${payload.protocolId}, ${session.laboratoryId})
        ON CONFLICT (sample_id, protocol_id) DO NOTHING
      `;
      await sql`
        INSERT INTO research_sample_events (sample_id, laboratory_id, event_type, detail, performed_by, performed_by_name)
        VALUES (${id}, ${session.laboratoryId}, 'LINKED_PROTOCOL', 'Protocolo asociado a la muestra', ${session.userId}, ${session.name})
      `;
      return NextResponse.json({ ok: true }, { status: 201 });
    }

    case "UNLINK_PROTOCOL": {
      await sql`DELETE FROM research_sample_protocols WHERE sample_id = ${id} AND protocol_id = ${payload.protocolId} AND laboratory_id = ${session.laboratoryId}`;
      return NextResponse.json({ ok: true });
    }
  }
}
