import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { databaseIdSchema } from "@/lib/validation";
import { PROTOCOL_KINDS } from "@/lib/research";
import { guardResearch } from "@/lib/research-service";
import { signRecord } from "@/lib/signature-service";
import { hasPermission } from "@/lib/authorization";
import { dispatchPush } from "@/lib/push";
import { notifyProtocolVersion } from "@/lib/push-events";

// Detalle del protocolo, su historial de versiones y el circuito de aprobación.
//
// Regla central: una versión aprobada no se edita. Cualquier cambio crea una
// versión nueva en borrador; al aprobarla, la anterior queda como reemplazada y
// se avisa a quienes trabajan con ese protocolo.

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    title: z.string().min(3).max(240).optional(),
    kind: z.enum(PROTOCOL_KINDS).optional(),
    area: z.string().max(120).optional().nullable(),
    summary: z.string().max(4000).optional().nullable(),
    ownerUserId: databaseIdSchema.optional().nullable(),
    reviewIntervalMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
  }),
  // Edita el contenido de la versión vigente solo si sigue en borrador.
  z.object({ action: z.literal("EDIT_DRAFT"), content: z.string().max(200000), changeSummary: z.string().max(2000).optional() }),
  z.object({ action: z.literal("NEW_VERSION"), content: z.string().max(200000), changeSummary: z.string().min(3).max(2000) }),
  z.object({ action: z.literal("SUBMIT_REVIEW") }),
  z.object({
    action: z.literal("APPROVE"),
    note: z.string().max(2000).optional(),
    effectiveFrom: z.string().date().optional().nullable(),
    signaturePassword: z.string().min(8).max(200),
  }),
  z.object({ action: z.literal("REJECT"), note: z.string().min(3).max(2000) }),
  z.object({ action: z.literal("ARCHIVE") }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const guard = await guardResearch();
  if (!guard.ok) return guard.response;
  const { session, sql } = guard;
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const protocols = await sql`
    SELECT p.*, o.full_name AS owner_name, c.full_name AS created_by_name
    FROM protocols p
    LEFT JOIN users o ON o.id = p.owner_user_id
    LEFT JOIN users c ON c.id = p.created_by
    WHERE p.id = ${id} AND p.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!protocols.length) return NextResponse.json({ message: "Protocolo no encontrado." }, { status: 404 });

  const [versions, approvals, projects] = await Promise.all([
    sql`
      SELECT v.*, u.full_name AS created_by_name
      FROM protocol_versions v LEFT JOIN users u ON u.id = v.created_by
      WHERE v.protocol_id = ${id} AND v.laboratory_id = ${session.laboratoryId}
      ORDER BY v.version_number DESC
    `,
    sql`
      SELECT a.*, u.full_name AS approved_by_name, v.version_number
      FROM protocol_approvals a
      JOIN protocol_versions v ON v.id = a.protocol_version_id
      LEFT JOIN users u ON u.id = a.approved_by
      WHERE v.protocol_id = ${id} AND a.laboratory_id = ${session.laboratoryId}
      ORDER BY a.decided_at DESC
    `,
    sql`
      SELECT p.id, p.code, p.title FROM research_project_links l
      JOIN research_projects p ON p.id = l.project_id
      WHERE l.entity_type = 'PROTOCOL' AND l.entity_id = ${id} AND l.laboratory_id = ${session.laboratoryId}
    `,
  ]);

  return NextResponse.json({ data: { ...protocols[0], versions, approvals, projects, canApprove: hasPermission(session, "protocols.approve") } });
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

  const rows = await sql`
    SELECT p.*, v.id AS version_id, v.version_number, v.status AS version_status, v.content
    FROM protocols p LEFT JOIN protocol_versions v ON v.id = p.current_version_id
    WHERE p.id = ${id} AND p.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  const protocol = rows[0] as Record<string, unknown> | undefined;
  if (!protocol) return NextResponse.json({ message: "Protocolo no encontrado." }, { status: 404 });

  switch (payload.action) {
    case "UPDATE": {
      const updated = await sql`
        UPDATE protocols SET
          title = COALESCE(${payload.title ?? null}, title),
          kind = COALESCE(${payload.kind ?? null}, kind),
          area = ${payload.area === undefined ? protocol.area : payload.area},
          summary = ${payload.summary === undefined ? protocol.summary : payload.summary},
          owner_user_id = ${payload.ownerUserId === undefined ? protocol.owner_user_id : payload.ownerUserId},
          review_interval_months = ${payload.reviewIntervalMonths === undefined ? protocol.review_interval_months : payload.reviewIntervalMonths},
          updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, { action: "PROTOCOL_UPDATED", entityType: "protocol", entityId: id, previousValue: protocol, newValue: updated[0], reason: "Actualización de la ficha del protocolo", request });
      return NextResponse.json({ data: updated[0] });
    }

    case "EDIT_DRAFT": {
      if (protocol.version_status !== "DRAFT") {
        return NextResponse.json({ message: "Esta versión ya no es un borrador. Crea una versión nueva para modificar el contenido." }, { status: 409 });
      }
      const updated = await sql`
        UPDATE protocol_versions SET content = ${payload.content}, change_summary = COALESCE(${payload.changeSummary ?? null}, change_summary), updated_at = now()
        WHERE id = ${String(protocol.version_id)} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, { action: "PROTOCOL_DRAFT_EDITED", entityType: "protocol", entityId: id, newValue: { versionNumber: protocol.version_number }, reason: "Edición del borrador", request });
      return NextResponse.json({ data: updated[0] });
    }

    case "NEW_VERSION": {
      const nextNumber = Number(protocol.version_number ?? 0) + 1;
      const created = await sql`
        INSERT INTO protocol_versions (protocol_id, laboratory_id, version_number, status, content, change_summary, created_by)
        VALUES (${id}, ${session.laboratoryId}, ${nextNumber}, 'DRAFT', ${payload.content}, ${payload.changeSummary}, ${session.userId})
        RETURNING *
      `;
      await sql`UPDATE protocols SET current_version_id = ${String(created[0].id)}, status = 'DRAFT', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, {
        action: "PROTOCOL_VERSION_CREATED", entityType: "protocol", entityId: id,
        newValue: { versionNumber: nextNumber, changeSummary: payload.changeSummary },
        reason: `Nueva versión ${nextNumber}`, request,
      });
      return NextResponse.json({ data: created[0] }, { status: 201 });
    }

    case "SUBMIT_REVIEW": {
      if (protocol.version_status !== "DRAFT") return NextResponse.json({ message: "Solo un borrador puede enviarse a revisión." }, { status: 409 });
      await sql`UPDATE protocol_versions SET status = 'IN_REVIEW', updated_at = now() WHERE id = ${String(protocol.version_id)} AND laboratory_id = ${session.laboratoryId}`;
      await sql`UPDATE protocols SET status = 'IN_REVIEW', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, { action: "PROTOCOL_SUBMITTED_FOR_REVIEW", entityType: "protocol", entityId: id, reason: `Versión ${protocol.version_number} enviada a revisión`, request });
      return NextResponse.json({ ok: true });
    }

    case "APPROVE": {
      if (!hasPermission(session, "protocols.approve")) {
        return NextResponse.json({ message: "No tienes permiso para aprobar protocolos." }, { status: 403 });
      }
      if (protocol.version_status === "APPROVED") return NextResponse.json({ message: "Esta versión ya está aprobada." }, { status: 409 });

      // La aprobación va firmada: es lo que la hace válida.
      const signature = await signRecord(session, {
        password: payload.signaturePassword,
        entityType: "protocol_version",
        entityId: String(protocol.version_id),
        meaning: "PROTOCOL_APPROVAL",
        content: { protocolCode: protocol.code, title: protocol.title, versionNumber: protocol.version_number, content: protocol.content },
        request,
      });
      if (!signature.ok) return NextResponse.json({ message: signature.message }, { status: signature.status });

      const effectiveFrom = payload.effectiveFrom ?? new Date().toISOString().slice(0, 10);
      // Las versiones anteriores quedan como reemplazadas: solo una vigente.
      await sql`
        UPDATE protocol_versions SET status = 'SUPERSEDED', updated_at = now()
        WHERE protocol_id = ${id} AND laboratory_id = ${session.laboratoryId} AND status = 'APPROVED' AND id <> ${String(protocol.version_id)}
      `;
      await sql`
        UPDATE protocol_versions SET status = 'APPROVED', effective_from = ${effectiveFrom}, updated_at = now()
        WHERE id = ${String(protocol.version_id)} AND laboratory_id = ${session.laboratoryId}
      `;
      // El intervalo se arma como texto ('24 months'): Postgres no concatena un
      // parámetro entero con texto, así que hacerlo en SQL fallaría.
      const reviewInterval = protocol.review_interval_months ? `${Number(protocol.review_interval_months)} months` : null;
      await (reviewInterval
        ? sql`UPDATE protocols SET status = 'APPROVED', next_review_on = (${effectiveFrom}::date + ${reviewInterval}::interval)::date, updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`
        : sql`UPDATE protocols SET status = 'APPROVED', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`);
      await sql`
        INSERT INTO protocol_approvals (protocol_version_id, laboratory_id, decision, note, approved_by, signature_id)
        VALUES (${String(protocol.version_id)}, ${session.laboratoryId}, 'APPROVED', ${payload.note ?? null}, ${session.userId}, ${signature.signatureId})
      `;

      // Aviso a quienes trabajan con este protocolo: hay versión nueva vigente.
      const audience = await sql`
        SELECT DISTINCT m.user_id
        FROM research_project_links l
        JOIN research_project_members m ON m.project_id = l.project_id
        WHERE l.entity_type = 'PROTOCOL' AND l.entity_id = ${id} AND l.laboratory_id = ${session.laboratoryId}
      `;
      const recipients = (audience as Array<{ user_id: string }>).map((row) => String(row.user_id));
      dispatchPush(notifyProtocolVersion(session, {
        protocolId: id,
        code: String(protocol.code),
        title: String(protocol.title),
        versionNumber: Number(protocol.version_number ?? 1),
        recipients,
      }));

      await writeAuditEvent(session, {
        action: "PROTOCOL_VERSION_APPROVED", entityType: "protocol", entityId: id,
        newValue: { versionNumber: protocol.version_number, effectiveFrom, signatureId: signature.signatureId },
        reason: payload.note || `Versión ${protocol.version_number} aprobada`, request,
      });
      return NextResponse.json({ ok: true });
    }

    case "REJECT": {
      if (!hasPermission(session, "protocols.approve")) {
        return NextResponse.json({ message: "No tienes permiso para revisar protocolos." }, { status: 403 });
      }
      await sql`UPDATE protocol_versions SET status = 'DRAFT', updated_at = now() WHERE id = ${String(protocol.version_id)} AND laboratory_id = ${session.laboratoryId}`;
      await sql`UPDATE protocols SET status = 'DRAFT', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await sql`
        INSERT INTO protocol_approvals (protocol_version_id, laboratory_id, decision, note, approved_by)
        VALUES (${String(protocol.version_id)}, ${session.laboratoryId}, 'REJECTED', ${payload.note}, ${session.userId})
      `;
      await writeAuditEvent(session, { action: "PROTOCOL_VERSION_REJECTED", entityType: "protocol", entityId: id, reason: payload.note, request });
      return NextResponse.json({ ok: true });
    }

    case "ARCHIVE": {
      await sql`UPDATE protocols SET status = 'ARCHIVED', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, { action: "PROTOCOL_ARCHIVED", entityType: "protocol", entityId: id, reason: "Protocolo archivado", request });
      return NextResponse.json({ ok: true });
    }
  }
}
