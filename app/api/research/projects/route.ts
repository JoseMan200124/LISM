import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX, PROJECT_STATUSES } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Proyectos de investigación: el contenedor de objetivos, cronograma, equipo,
// protocolos, muestras, cuadernos y documentos de una línea de trabajo.

export const createSchema = z.object({
  title: z.string().min(3).max(240),
  summary: z.string().max(4000).optional(),
  objectives: z.string().max(8000).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  fundingSource: z.string().max(200).optional(),
  startsOn: z.string().date().optional().nullable(),
  endsOn: z.string().date().optional().nullable(),
  principalInvestigatorId: databaseIdSchema.optional().nullable(),
  memberIds: z.array(databaseIdSchema).max(60).optional(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const status = new URL(request.url).searchParams.get("status");

  const rows = await sql`
    SELECT p.id, p.code, p.title, p.summary, p.status, p.funding_source, p.starts_on, p.ends_on,
           p.created_at, pi.full_name AS principal_investigator_name,
           (SELECT count(*)::int FROM research_project_members m WHERE m.project_id = p.id) AS member_count,
           (SELECT count(*)::int FROM research_samples s WHERE s.project_id = p.id) AS sample_count,
           (SELECT count(*)::int FROM research_project_milestones ms WHERE ms.project_id = p.id) AS milestone_count,
           (SELECT count(*)::int FROM research_project_milestones ms WHERE ms.project_id = p.id AND ms.status = 'DONE') AS milestone_done_count
    FROM research_projects p
    LEFT JOIN users pi ON pi.id = p.principal_investigator_id
    WHERE p.laboratory_id = ${session.laboratoryId}
      AND (${status ?? null}::text IS NULL OR p.status = ${status ?? null})
    ORDER BY (p.status = 'ACTIVE') DESC, p.created_at DESC
    LIMIT 300
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del proyecto.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO research_projects (
          laboratory_id, code, title, summary, objectives, status, funding_source,
          starts_on, ends_on, principal_investigator_id, created_by
        ) VALUES (
          ${session.laboratoryId}, ${code}, ${payload.title}, ${payload.summary ?? null}, ${payload.objectives ?? null},
          ${payload.status ?? "DRAFT"}, ${payload.fundingSource ?? null}, ${payload.startsOn ?? null}, ${payload.endsOn ?? null},
          ${payload.principalInvestigatorId ?? null}, ${session.userId}
        ) RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "research_projects", session.laboratoryId, CODE_PREFIX.project),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del proyecto." }, { status: 500 });

  // El investigador principal y los participantes quedan como miembros desde el
  // inicio: un proyecto sin equipo no permite atribuir el trabajo.
  const members = new Set(payload.memberIds ?? []);
  if (payload.principalInvestigatorId) members.delete(payload.principalInvestigatorId);
  if (payload.principalInvestigatorId) {
    await sql`
      INSERT INTO research_project_members (project_id, laboratory_id, user_id, role_in_project)
      VALUES (${String(created.id)}, ${session.laboratoryId}, ${payload.principalInvestigatorId}, 'PI')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `;
  }
  for (const memberId of members) {
    await sql`
      INSERT INTO research_project_members (project_id, laboratory_id, user_id, role_in_project)
      VALUES (${String(created.id)}, ${session.laboratoryId}, ${memberId}, 'RESEARCHER')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `;
  }

  await writeAuditEvent(session, {
    action: "RESEARCH_PROJECT_CREATED",
    entityType: "research_project",
    entityId: String(created.id),
    newValue: created,
    reason: "Alta de proyecto de investigación",
    request,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
