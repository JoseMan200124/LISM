import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX, PROTOCOL_KINDS } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Protocolos: SOP institucionales, protocolos de investigación, métodos y
// procedimientos de seguridad. Cada uno nace con su versión 1 en borrador.

export const createSchema = z.object({
  title: z.string().min(3).max(240),
  kind: z.enum(PROTOCOL_KINDS).default("SOP"),
  area: z.string().max(120).optional(),
  summary: z.string().max(4000).optional(),
  content: z.string().max(200000).optional(),
  ownerUserId: databaseIdSchema.optional().nullable(),
  reviewIntervalMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
  projectId: databaseIdSchema.optional().nullable(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const kind = new URL(request.url).searchParams.get("kind");

  const rows = await sql`
    SELECT p.id, p.code, p.title, p.kind, p.area, p.summary, p.status, p.next_review_on, p.updated_at,
           o.full_name AS owner_name,
           v.version_number AS current_version, v.status AS current_version_status, v.effective_from,
           (SELECT count(*)::int FROM protocol_versions pv WHERE pv.protocol_id = p.id) AS version_count
    FROM protocols p
    LEFT JOIN users o ON o.id = p.owner_user_id
    LEFT JOIN protocol_versions v ON v.id = p.current_version_id
    WHERE p.laboratory_id = ${session.laboratoryId}
      AND (${kind ?? null}::text IS NULL OR p.kind = ${kind ?? null})
    ORDER BY p.status, p.code
    LIMIT 400
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("research.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del protocolo.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO protocols (laboratory_id, code, title, kind, area, summary, owner_user_id, review_interval_months, created_by)
        VALUES (${session.laboratoryId}, ${code}, ${payload.title}, ${payload.kind}, ${payload.area ?? null}, ${payload.summary ?? null},
                ${payload.ownerUserId ?? session.userId}, ${payload.reviewIntervalMonths ?? null}, ${session.userId})
        RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "protocols", session.laboratoryId, CODE_PREFIX.protocol),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del protocolo." }, { status: 500 });

  // Versión 1: el protocolo siempre tiene contenido versionado desde el alta.
  const versions = await sql`
    INSERT INTO protocol_versions (protocol_id, laboratory_id, version_number, status, content, change_summary, created_by)
    VALUES (${String(created.id)}, ${session.laboratoryId}, 1, 'DRAFT', ${payload.content ?? ""}, 'Versión inicial', ${session.userId})
    RETURNING *
  `;
  await sql`UPDATE protocols SET current_version_id = ${String(versions[0].id)}, updated_at = now() WHERE id = ${String(created.id)}`;

  if (payload.projectId) {
    await sql`
      INSERT INTO research_project_links (project_id, laboratory_id, entity_type, entity_id, created_by)
      VALUES (${payload.projectId}, ${session.laboratoryId}, 'PROTOCOL', ${String(created.id)}, ${session.userId})
      ON CONFLICT (project_id, entity_type, entity_id) DO NOTHING
    `;
  }

  await writeAuditEvent(session, {
    action: "PROTOCOL_CREATED",
    entityType: "protocol",
    entityId: String(created.id),
    newValue: created,
    reason: "Alta de protocolo",
    metadata: payload.projectId ? { projectId: payload.projectId } : undefined,
    request,
  });
  return NextResponse.json({ data: { ...created, current_version_id: versions[0].id } }, { status: 201 });
}
