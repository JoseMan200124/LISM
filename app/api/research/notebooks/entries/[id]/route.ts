import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { requiresChangeReason } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";
import { loadSignatures, signRecord } from "@/lib/signature-service";

// Una entrada del cuaderno: contenido vigente, versiones anteriores y firma.
//
// Regla central del cuaderno electrónico: nada se pierde. Cada modificación
// guarda el contenido anterior como versión, y modificar una entrada ya firmada
// exige indicar el motivo del cambio.

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    title: z.string().min(3).max(240).optional(),
    performedOn: z.string().date().optional(),
    objective: z.string().max(8000).optional().nullable(),
    procedureText: z.string().max(50000).optional().nullable(),
    results: z.string().max(50000).optional().nullable(),
    conclusions: z.string().max(20000).optional().nullable(),
    observations: z.string().max(20000).optional().nullable(),
    sampleId: databaseIdSchema.optional().nullable(),
    protocolId: databaseIdSchema.optional().nullable(),
    changeReason: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("COMPLETE") }),
  z.object({ action: z.literal("SIGN"), signaturePassword: z.string().min(8).max(200), asWitness: z.boolean().optional() }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const entries = await sql`
    SELECT e.*, n.code AS notebook_code, n.title AS notebook_title,
           p.code AS project_code, p.title AS project_title,
           s.code AS sample_code, s.alias AS sample_alias,
           pr.code AS protocol_code, pr.title AS protocol_title,
           u.full_name AS created_by_name
    FROM notebook_entries e
    JOIN lab_notebooks n ON n.id = e.notebook_id
    LEFT JOIN research_projects p ON p.id = e.project_id
    LEFT JOIN research_samples s ON s.id = e.sample_id
    LEFT JOIN protocols pr ON pr.id = e.protocol_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.id = ${id} AND e.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!entries.length) return NextResponse.json({ message: "Experimento no encontrado." }, { status: 404 });

  const [versions, attachments] = await Promise.all([
    sql`
      SELECT v.id, v.version_number, v.change_reason, v.changed_at, u.full_name AS changed_by_name
      FROM notebook_entry_versions v LEFT JOIN users u ON u.id = v.changed_by
      WHERE v.entry_id = ${id} AND v.laboratory_id = ${session.laboratoryId}
      ORDER BY v.version_number DESC
    `,
    sql`
      SELECT id, original_filename, mime_type, version_number, created_at
      FROM attachments WHERE entity_type = 'notebook_entry' AND entity_id = ${id} AND laboratory_id = ${session.laboratoryId}
      ORDER BY created_at DESC
    `.catch(() => [] as Array<Record<string, unknown>>),
  ]);
  const signatures = await loadSignatures(session.laboratoryId, "notebook_entry", [id]).catch(() => new Map());

  return NextResponse.json({ data: { ...entries[0], versions, attachments, signatures: signatures.get(id) ?? [] } });
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

  const rows = await sql`SELECT * FROM notebook_entries WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Experimento no encontrado." }, { status: 404 });
  const entry = rows[0] as Record<string, unknown>;

  switch (payload.action) {
    case "UPDATE": {
      if (requiresChangeReason(String(entry.status)) && !payload.changeReason?.trim()) {
        return NextResponse.json(
          { success: false, error: "CHANGE_REASON_REQUIRED", message: "Este experimento ya está firmado: indica el motivo del cambio para conservarlo en el historial." },
          { status: 400 },
        );
      }
      const nextVersion = Number(entry.version_number ?? 1) + 1;
      // El contenido anterior se guarda antes de sobrescribirlo.
      await sql`
        INSERT INTO notebook_entry_versions (entry_id, laboratory_id, version_number, snapshot, change_reason, changed_by)
        VALUES (${id}, ${session.laboratoryId}, ${nextVersion}, ${JSON.stringify(entry)}::jsonb, ${payload.changeReason ?? "Actualización del experimento"}, ${session.userId})
      `;
      const updated = await sql`
        UPDATE notebook_entries SET
          title = COALESCE(${payload.title ?? null}, title),
          performed_on = COALESCE(${payload.performedOn ?? null}, performed_on),
          objective = ${payload.objective === undefined ? entry.objective : payload.objective},
          procedure_text = ${payload.procedureText === undefined ? entry.procedure_text : payload.procedureText},
          results = ${payload.results === undefined ? entry.results : payload.results},
          conclusions = ${payload.conclusions === undefined ? entry.conclusions : payload.conclusions},
          observations = ${payload.observations === undefined ? entry.observations : payload.observations},
          sample_id = ${payload.sampleId === undefined ? entry.sample_id : payload.sampleId},
          protocol_id = ${payload.protocolId === undefined ? entry.protocol_id : payload.protocolId},
          version_number = ${nextVersion},
          updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "NOTEBOOK_ENTRY_UPDATED", entityType: "notebook_entry", entityId: id,
        previousValue: { versionNumber: entry.version_number }, newValue: { versionNumber: nextVersion },
        reason: payload.changeReason || "Actualización del experimento",
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    case "COMPLETE": {
      if (entry.status !== "DRAFT") return NextResponse.json({ message: "Este experimento ya no es un borrador." }, { status: 409 });
      const updated = await sql`
        UPDATE notebook_entries SET status = 'COMPLETED', updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "NOTEBOOK_ENTRY_COMPLETED", entityType: "notebook_entry", entityId: id,
        reason: "Experimento marcado como completado",
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    case "SIGN": {
      const signature = await signRecord(session, {
        password: payload.signaturePassword,
        entityType: "notebook_entry",
        entityId: id,
        meaning: "RECORD_ENTRY",
        content: {
          entryCode: entry.entry_code, title: entry.title, performedOn: entry.performed_on,
          objective: entry.objective, procedure: entry.procedure_text, results: entry.results,
          conclusions: entry.conclusions, versionNumber: entry.version_number,
        },
        request,
      });
      if (!signature.ok) return NextResponse.json({ message: signature.message }, { status: signature.status });

      // Una segunda firma de otra persona sobre el mismo experimento es el
      // testigo: es la práctica habitual del cuaderno de laboratorio.
      const status = payload.asWitness && entry.status === "SIGNED" ? "WITNESSED" : "SIGNED";
      const updated = await sql`
        UPDATE notebook_entries SET status = ${status},
          signature_id = COALESCE(signature_id, ${signature.signatureId}),
          signed_at = COALESCE(signed_at, now()), updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      await writeAuditEvent(session, {
        action: status === "WITNESSED" ? "NOTEBOOK_ENTRY_WITNESSED" : "NOTEBOOK_ENTRY_SIGNED",
        entityType: "notebook_entry", entityId: id,
        newValue: { signatureId: signature.signatureId, status },
        reason: "Firma del experimento",
        metadata: entry.project_id ? { projectId: String(entry.project_id) } : undefined, request,
      });
      return NextResponse.json({ data: updated[0] });
    }
  }
}
