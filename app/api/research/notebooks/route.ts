import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Cuadernos electrónicos de laboratorio. Un proyecto puede tener uno o varios;
// también existen cuadernos sin proyecto para el trabajo por muestra suelta.

const createSchema = z.object({
  title: z.string().min(3).max(240),
  description: z.string().max(2000).optional(),
  projectId: databaseIdSchema.optional().nullable(),
  ownerUserId: databaseIdSchema.optional().nullable(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const projectId = new URL(request.url).searchParams.get("projectId");

  const rows = await sql`
    SELECT n.id, n.code, n.title, n.description, n.status, n.created_at,
           p.code AS project_code, p.title AS project_title, u.full_name AS owner_name,
           (SELECT count(*)::int FROM notebook_entries e WHERE e.notebook_id = n.id) AS entry_count,
           (SELECT max(e.performed_on) FROM notebook_entries e WHERE e.notebook_id = n.id) AS last_entry_on
    FROM lab_notebooks n
    LEFT JOIN research_projects p ON p.id = n.project_id
    LEFT JOIN users u ON u.id = n.owner_user_id
    WHERE n.laboratory_id = ${session.laboratoryId}
      AND (${projectId ?? null}::uuid IS NULL OR n.project_id = ${projectId ?? null}::uuid)
    ORDER BY n.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del cuaderno.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO lab_notebooks (laboratory_id, project_id, code, title, description, owner_user_id, created_by)
        VALUES (${session.laboratoryId}, ${payload.projectId ?? null}, ${code}, ${payload.title}, ${payload.description ?? null},
                ${payload.ownerUserId ?? session.userId}, ${session.userId})
        RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "lab_notebooks", session.laboratoryId, CODE_PREFIX.notebook),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del cuaderno." }, { status: 500 });

  if (payload.projectId) {
    await sql`
      INSERT INTO research_project_links (project_id, laboratory_id, entity_type, entity_id, created_by)
      VALUES (${payload.projectId}, ${session.laboratoryId}, 'NOTEBOOK', ${String(created.id)}, ${session.userId})
      ON CONFLICT (project_id, entity_type, entity_id) DO NOTHING
    `;
  }

  await writeAuditEvent(session, {
    action: "NOTEBOOK_CREATED", entityType: "lab_notebook", entityId: String(created.id),
    newValue: created, reason: "Alta de cuaderno electrónico",
    metadata: payload.projectId ? { projectId: payload.projectId } : undefined, request,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
