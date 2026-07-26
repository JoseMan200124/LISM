import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { MILESTONE_STATUSES, PROJECT_LINK_TYPES, PROJECT_ROLES, PROJECT_STATUSES } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";

// Detalle del proyecto y todas sus operaciones. Se resuelven con una sola ruta
// y un campo `action` porque comparten la misma comprobación de pertenencia al
// laboratorio y el mismo registro de auditoría.

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    title: z.string().min(3).max(240).optional(),
    summary: z.string().max(4000).optional().nullable(),
    objectives: z.string().max(8000).optional().nullable(),
    status: z.enum(PROJECT_STATUSES).optional(),
    fundingSource: z.string().max(200).optional().nullable(),
    startsOn: z.string().date().optional().nullable(),
    endsOn: z.string().date().optional().nullable(),
    principalInvestigatorId: databaseIdSchema.optional().nullable(),
  }),
  z.object({ action: z.literal("ADD_MEMBER"), userId: databaseIdSchema, roleInProject: z.enum(PROJECT_ROLES).default("RESEARCHER") }),
  z.object({ action: z.literal("REMOVE_MEMBER"), userId: databaseIdSchema }),
  z.object({
    action: z.literal("ADD_MILESTONE"),
    title: z.string().min(2).max(240),
    detail: z.string().max(2000).optional(),
    startsOn: z.string().date().optional().nullable(),
    dueOn: z.string().date().optional().nullable(),
    responsibleUserId: databaseIdSchema.optional().nullable(),
  }),
  z.object({
    action: z.literal("UPDATE_MILESTONE"),
    milestoneId: databaseIdSchema,
    title: z.string().min(2).max(240).optional(),
    detail: z.string().max(2000).optional().nullable(),
    startsOn: z.string().date().optional().nullable(),
    dueOn: z.string().date().optional().nullable(),
    completedOn: z.string().date().optional().nullable(),
    status: z.enum(MILESTONE_STATUSES).optional(),
    responsibleUserId: databaseIdSchema.optional().nullable(),
  }),
  z.object({ action: z.literal("REMOVE_MILESTONE"), milestoneId: databaseIdSchema }),
  z.object({ action: z.literal("ADD_LINK"), entityType: z.enum(PROJECT_LINK_TYPES), entityId: databaseIdSchema, note: z.string().max(500).optional() }),
  z.object({ action: z.literal("REMOVE_LINK"), linkId: databaseIdSchema }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const projects = await sql`
    SELECT p.*, pi.full_name AS principal_investigator_name, c.full_name AS created_by_name
    FROM research_projects p
    LEFT JOIN users pi ON pi.id = p.principal_investigator_id
    LEFT JOIN users c ON c.id = p.created_by
    WHERE p.id = ${id} AND p.laboratory_id = ${session.laboratoryId}
    LIMIT 1
  `;
  if (!projects.length) return NextResponse.json({ message: "Proyecto no encontrado." }, { status: 404 });

  const [members, milestones, links, samples, notebooks, documents, entries] = await Promise.all([
    sql`
      SELECT m.id, m.user_id, m.role_in_project, m.added_at, u.full_name, u.email
      FROM research_project_members m JOIN users u ON u.id = m.user_id
      WHERE m.project_id = ${id} AND m.laboratory_id = ${session.laboratoryId}
      ORDER BY (m.role_in_project = 'PI') DESC, u.full_name
    `,
    sql`
      SELECT ms.*, u.full_name AS responsible_name
      FROM research_project_milestones ms LEFT JOIN users u ON u.id = ms.responsible_user_id
      WHERE ms.project_id = ${id} AND ms.laboratory_id = ${session.laboratoryId}
      ORDER BY ms.sort_order, ms.due_on NULLS LAST, ms.created_at
    `,
    sql`
      SELECT l.id, l.entity_type, l.entity_id, l.note, l.created_at,
        COALESCE(pr.title, s.alias, s.code, e.name, i.name, b.code, n.title) AS entity_label,
        COALESCE(pr.code, s.code, e.code, i.sku, b.code, n.code) AS entity_code
      FROM research_project_links l
      LEFT JOIN protocols pr ON pr.id = l.entity_id AND l.entity_type = 'PROTOCOL'
      LEFT JOIN research_samples s ON s.id = l.entity_id AND l.entity_type = 'SAMPLE'
      LEFT JOIN equipment e ON e.id = l.entity_id AND l.entity_type = 'EQUIPMENT'
      LEFT JOIN inventory_items i ON i.id = l.entity_id AND l.entity_type = 'INVENTORY_ITEM'
      LEFT JOIN biobank_entries b ON b.id = l.entity_id AND l.entity_type = 'BIOBANK_ENTRY'
      LEFT JOIN lab_notebooks n ON n.id = l.entity_id AND l.entity_type = 'NOTEBOOK'
      WHERE l.project_id = ${id} AND l.laboratory_id = ${session.laboratoryId}
      ORDER BY l.entity_type, l.created_at DESC
    `,
    sql`
      SELECT id, code, alias, sample_type, status, registered_at
      FROM research_samples WHERE project_id = ${id} AND laboratory_id = ${session.laboratoryId}
      ORDER BY registered_at DESC LIMIT 200
    `,
    sql`
      SELECT id, code, title, status FROM lab_notebooks
      WHERE project_id = ${id} AND laboratory_id = ${session.laboratoryId} ORDER BY created_at DESC
    `,
    sql`
      SELECT id, code, title, category, current_version, updated_at FROM research_documents
      WHERE project_id = ${id} AND laboratory_id = ${session.laboratoryId} ORDER BY updated_at DESC LIMIT 100
    `,
    sql`
      SELECT e.id, e.entry_code, e.title, e.performed_on, e.status, u.full_name AS created_by_name
      FROM notebook_entries e LEFT JOIN users u ON u.id = e.created_by
      WHERE e.project_id = ${id} AND e.laboratory_id = ${session.laboratoryId}
      ORDER BY e.performed_on DESC, e.created_at DESC LIMIT 100
    `,
  ]);

  // Historial del proyecto: todo lo que ha pasado, en una sola línea de tiempo.
  const history = await sql`
    SELECT action, entity_type, entity_id, reason, created_at, a.metadata, u.full_name AS actor_name
    FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
    WHERE a.laboratory_id = ${session.laboratoryId}
      AND (
        (a.entity_type = 'research_project' AND a.entity_id = ${id})
        OR a.metadata->>'projectId' = ${id}
      )
    ORDER BY a.created_at DESC
    LIMIT 120
  `;

  return NextResponse.json({
    data: { ...projects[0], members, milestones, links, samples, notebooks, documents, entries, history },
  });
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

  const existing = await sql`SELECT * FROM research_projects WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ message: "Proyecto no encontrado." }, { status: 404 });

  switch (payload.action) {
    case "UPDATE": {
      const rows = await sql`
        UPDATE research_projects SET
          title = COALESCE(${payload.title ?? null}, title),
          summary = ${payload.summary === undefined ? existing[0].summary : payload.summary},
          objectives = ${payload.objectives === undefined ? existing[0].objectives : payload.objectives},
          status = COALESCE(${payload.status ?? null}, status),
          funding_source = ${payload.fundingSource === undefined ? existing[0].funding_source : payload.fundingSource},
          starts_on = ${payload.startsOn === undefined ? existing[0].starts_on : payload.startsOn},
          ends_on = ${payload.endsOn === undefined ? existing[0].ends_on : payload.endsOn},
          principal_investigator_id = ${payload.principalInvestigatorId === undefined ? existing[0].principal_investigator_id : payload.principalInvestigatorId},
          updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_PROJECT_UPDATED", entityType: "research_project", entityId: id,
        previousValue: existing[0], newValue: rows[0], reason: "Actualización del proyecto",
        metadata: { projectId: id }, request,
      });
      return NextResponse.json({ data: rows[0] });
    }
    case "ADD_MEMBER": {
      const rows = await sql`
        INSERT INTO research_project_members (project_id, laboratory_id, user_id, role_in_project)
        VALUES (${id}, ${session.laboratoryId}, ${payload.userId}, ${payload.roleInProject})
        ON CONFLICT (project_id, user_id) DO UPDATE SET role_in_project = EXCLUDED.role_in_project
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_PROJECT_MEMBER_ADDED", entityType: "research_project", entityId: id,
        newValue: rows[0], reason: "Investigador añadido al proyecto", metadata: { projectId: id }, request,
      });
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    }
    case "REMOVE_MEMBER": {
      await sql`DELETE FROM research_project_members WHERE project_id = ${id} AND user_id = ${payload.userId} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, {
        action: "RESEARCH_PROJECT_MEMBER_REMOVED", entityType: "research_project", entityId: id,
        previousValue: { userId: payload.userId }, reason: "Investigador retirado del proyecto", metadata: { projectId: id }, request,
      });
      return NextResponse.json({ ok: true });
    }
    case "ADD_MILESTONE": {
      const order = await sql`SELECT COALESCE(max(sort_order), 0) + 1 AS next FROM research_project_milestones WHERE project_id = ${id}`;
      const rows = await sql`
        INSERT INTO research_project_milestones (project_id, laboratory_id, title, detail, starts_on, due_on, responsible_user_id, sort_order)
        VALUES (${id}, ${session.laboratoryId}, ${payload.title}, ${payload.detail ?? null}, ${payload.startsOn ?? null}, ${payload.dueOn ?? null},
                ${payload.responsibleUserId ?? null}, ${Number(order[0].next ?? 1)})
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_MILESTONE_CREATED", entityType: "research_project", entityId: id,
        newValue: rows[0], reason: "Hito añadido al cronograma", metadata: { projectId: id }, request,
      });
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    }
    case "UPDATE_MILESTONE": {
      const previous = await sql`SELECT * FROM research_project_milestones WHERE id = ${payload.milestoneId} AND project_id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
      if (!previous.length) return NextResponse.json({ message: "Hito no encontrado." }, { status: 404 });
      // Marcar como completado sin fecha explícita fija la de hoy.
      const completedOn = payload.completedOn !== undefined
        ? payload.completedOn
        : payload.status === "DONE" && !previous[0].completed_on
          ? new Date().toISOString().slice(0, 10)
          : previous[0].completed_on;
      const rows = await sql`
        UPDATE research_project_milestones SET
          title = COALESCE(${payload.title ?? null}, title),
          detail = ${payload.detail === undefined ? previous[0].detail : payload.detail},
          starts_on = ${payload.startsOn === undefined ? previous[0].starts_on : payload.startsOn},
          due_on = ${payload.dueOn === undefined ? previous[0].due_on : payload.dueOn},
          completed_on = ${completedOn},
          status = COALESCE(${payload.status ?? null}, status),
          responsible_user_id = ${payload.responsibleUserId === undefined ? previous[0].responsible_user_id : payload.responsibleUserId},
          updated_at = now()
        WHERE id = ${payload.milestoneId} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "RESEARCH_MILESTONE_UPDATED", entityType: "research_project", entityId: id,
        previousValue: previous[0], newValue: rows[0], reason: "Actualización del cronograma", metadata: { projectId: id }, request,
      });
      return NextResponse.json({ data: rows[0] });
    }
    case "REMOVE_MILESTONE": {
      await sql`DELETE FROM research_project_milestones WHERE id = ${payload.milestoneId} AND project_id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, {
        action: "RESEARCH_MILESTONE_REMOVED", entityType: "research_project", entityId: id,
        reason: "Hito eliminado del cronograma", metadata: { projectId: id, milestoneId: payload.milestoneId }, request,
      });
      return NextResponse.json({ ok: true });
    }
    case "ADD_LINK": {
      const rows = await sql`
        INSERT INTO research_project_links (project_id, laboratory_id, entity_type, entity_id, note, created_by)
        VALUES (${id}, ${session.laboratoryId}, ${payload.entityType}, ${payload.entityId}, ${payload.note ?? null}, ${session.userId})
        ON CONFLICT (project_id, entity_type, entity_id) DO UPDATE SET note = EXCLUDED.note
        RETURNING *
      `;
      // Una muestra vinculada al proyecto queda además asociada en su ficha,
      // que es donde la busca quien la registró.
      if (payload.entityType === "SAMPLE") {
        await sql`UPDATE research_samples SET project_id = ${id}, updated_at = now() WHERE id = ${payload.entityId} AND laboratory_id = ${session.laboratoryId}`;
      }
      if (payload.entityType === "NOTEBOOK") {
        await sql`UPDATE lab_notebooks SET project_id = ${id}, updated_at = now() WHERE id = ${payload.entityId} AND laboratory_id = ${session.laboratoryId}`;
      }
      await writeAuditEvent(session, {
        action: "RESEARCH_PROJECT_LINKED", entityType: "research_project", entityId: id,
        newValue: rows[0], reason: `Vinculación de ${payload.entityType}`, metadata: { projectId: id }, request,
      });
      return NextResponse.json({ data: rows[0] }, { status: 201 });
    }
    case "REMOVE_LINK": {
      await sql`DELETE FROM research_project_links WHERE id = ${payload.linkId} AND project_id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, {
        action: "RESEARCH_PROJECT_UNLINKED", entityType: "research_project", entityId: id,
        reason: "Vínculo eliminado", metadata: { projectId: id, linkId: payload.linkId }, request,
      });
      return NextResponse.json({ ok: true });
    }
  }
}
