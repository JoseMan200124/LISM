import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Entradas del cuaderno: cada experimento con su objetivo, procedimiento,
// resultados, conclusiones y observaciones.

export const createSchema = z.object({
  notebookId: databaseIdSchema,
  title: z.string().min(3).max(240),
  performedOn: z.string().date().optional(),
  objective: z.string().max(8000).optional(),
  procedureText: z.string().max(50000).optional(),
  results: z.string().max(50000).optional(),
  conclusions: z.string().max(20000).optional(),
  observations: z.string().max(20000).optional(),
  sampleId: databaseIdSchema.optional().nullable(),
  protocolId: databaseIdSchema.optional().nullable(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const url = new URL(request.url);
  const notebookId = url.searchParams.get("notebookId");
  const projectId = url.searchParams.get("projectId");

  const rows = await sql`
    SELECT e.id, e.entry_code, e.title, e.performed_on, e.status, e.version_number, e.signed_at,
           n.code AS notebook_code, n.title AS notebook_title,
           p.code AS project_code, s.code AS sample_code, pr.code AS protocol_code,
           u.full_name AS created_by_name
    FROM notebook_entries e
    JOIN lab_notebooks n ON n.id = e.notebook_id
    LEFT JOIN research_projects p ON p.id = e.project_id
    LEFT JOIN research_samples s ON s.id = e.sample_id
    LEFT JOIN protocols pr ON pr.id = e.protocol_id
    LEFT JOIN users u ON u.id = e.created_by
    WHERE e.laboratory_id = ${session.laboratoryId}
      AND (${notebookId ?? null}::uuid IS NULL OR e.notebook_id = ${notebookId ?? null}::uuid)
      AND (${projectId ?? null}::uuid IS NULL OR e.project_id = ${projectId ?? null}::uuid)
    ORDER BY e.performed_on DESC, e.created_at DESC
    LIMIT 300
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del experimento.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const notebooks = await sql`SELECT id, project_id FROM lab_notebooks WHERE id = ${payload.notebookId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!notebooks.length) return NextResponse.json({ message: "Cuaderno no encontrado." }, { status: 404 });
  const projectId = notebooks[0].project_id as string | null;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO notebook_entries (
          notebook_id, laboratory_id, project_id, sample_id, protocol_id, entry_code, title, performed_on,
          objective, procedure_text, results, conclusions, observations, created_by
        ) VALUES (
          ${payload.notebookId}, ${session.laboratoryId}, ${projectId}, ${payload.sampleId ?? null}, ${payload.protocolId ?? null},
          ${code}, ${payload.title}, ${payload.performedOn ?? new Date().toISOString().slice(0, 10)},
          ${payload.objective ?? null}, ${payload.procedureText ?? null}, ${payload.results ?? null},
          ${payload.conclusions ?? null}, ${payload.observations ?? null}, ${session.userId}
        ) RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "notebook_entries", session.laboratoryId, CODE_PREFIX.entry, 4),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del experimento." }, { status: 500 });

  // Versión 1: el historial de modificaciones arranca con el contenido inicial.
  await sql`
    INSERT INTO notebook_entry_versions (entry_id, laboratory_id, version_number, snapshot, change_reason, changed_by)
    VALUES (${String(created.id)}, ${session.laboratoryId}, 1, ${JSON.stringify(created)}::jsonb, 'Registro inicial', ${session.userId})
  `;

  await writeAuditEvent(session, {
    action: "NOTEBOOK_ENTRY_CREATED", entityType: "notebook_entry", entityId: String(created.id),
    newValue: { entryCode: created.entry_code, title: created.title }, reason: "Registro de experimento",
    metadata: projectId ? { projectId } : undefined, request,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
