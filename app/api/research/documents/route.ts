import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { CODE_PREFIX, DOCUMENT_CATEGORIES } from "@/lib/research";
import { guardResearch, insertWithCode, nextResearchCode } from "@/lib/research-service";

// Gestión documental: el centro de todo lo que se sube en los demás módulos y
// de lo que no tiene módulo propio (artículos, consentimientos, permisos,
// licencias). Cada documento conserva sus versiones.

const createSchema = z.object({
  title: z.string().min(3).max(240),
  category: z.enum(DOCUMENT_CATEGORIES).default("OTHER"),
  description: z.string().max(4000).optional(),
  projectId: databaseIdSchema.optional().nullable(),
  relatedEntityType: z.string().max(40).optional(),
  relatedEntityId: databaseIdSchema.optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  externalUrl: z.string().url().optional(),
});

export async function GET(request: Request) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const projectId = url.searchParams.get("projectId");

  const rows = await sql`
    SELECT d.id, d.code, d.title, d.category, d.description, d.status, d.current_version,
           d.expires_on, d.tags, d.updated_at,
           p.code AS project_code, p.title AS project_title, u.full_name AS created_by_name,
           v.original_filename, v.mime_type, v.external_url, v.uploaded_at
    FROM research_documents d
    LEFT JOIN research_projects p ON p.id = d.project_id
    LEFT JOIN users u ON u.id = d.created_by
    LEFT JOIN research_document_versions v
      ON v.document_id = d.id AND v.version_number = d.current_version
    WHERE d.laboratory_id = ${session.laboratoryId} AND d.status = 'ACTIVE'
      AND (${category ?? null}::text IS NULL OR d.category = ${category ?? null})
      AND (${projectId ?? null}::uuid IS NULL OR d.project_id = ${projectId ?? null}::uuid)
    ORDER BY d.updated_at DESC
    LIMIT 400
  `;
  return NextResponse.json({ data: rows });
}

export async function POST(request: Request) {
  const guard = await guardResearch("documents.manage");
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del documento.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  const created = await insertWithCode(
    async (code) => {
      const rows = await sql`
        INSERT INTO research_documents (
          laboratory_id, code, title, category, description, project_id,
          related_entity_type, related_entity_id, expires_on, tags, created_by
        ) VALUES (
          ${session.laboratoryId}, ${code}, ${payload.title}, ${payload.category}, ${payload.description ?? null},
          ${payload.projectId ?? null}, ${payload.relatedEntityType ?? null}, ${payload.relatedEntityId ?? null},
          ${payload.expiresOn ?? null}, ${JSON.stringify(payload.tags ?? [])}::jsonb, ${session.userId}
        ) RETURNING *
      `;
      return rows[0] as Record<string, unknown>;
    },
    () => nextResearchCode(sql, "research_documents", session.laboratoryId, CODE_PREFIX.document, 4),
  );
  if (!created) return NextResponse.json({ message: "No fue posible generar el código del documento." }, { status: 500 });

  // Un documento puede ser solo un enlace externo (artículo publicado, norma en
  // línea): en ese caso ya nace con su versión 1 sin archivo adjunto.
  if (payload.externalUrl) {
    await sql`
      INSERT INTO research_document_versions (document_id, laboratory_id, version_number, change_summary, external_url, uploaded_by)
      VALUES (${String(created.id)}, ${session.laboratoryId}, 1, 'Versión inicial (enlace externo)', ${payload.externalUrl}, ${session.userId})
    `;
    await sql`UPDATE research_documents SET current_version = 1, updated_at = now() WHERE id = ${String(created.id)}`;
  }

  await writeAuditEvent(session, {
    action: "RESEARCH_DOCUMENT_CREATED", entityType: "research_document", entityId: String(created.id),
    newValue: created, reason: "Alta de documento",
    metadata: payload.projectId ? { projectId: payload.projectId } : undefined, request,
  });
  return NextResponse.json({ data: created }, { status: 201 });
}
