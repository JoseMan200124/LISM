import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { INCIDENT_SEVERITIES, INCIDENT_STATUSES, isMissingRelationError } from "@/lib/incidents";

const patchSchema = z.object({
  status: z.enum(INCIDENT_STATUSES).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).optional(),
  assignedTo: databaseIdSchema.optional().nullable(),
  actionsTaken: z.string().max(4000).optional().nullable(),
  resolution: z.string().max(4000).optional().nullable(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(4000).optional().nullable(),
  location: z.string().max(160).optional().nullable(),
}).refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar." });

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "incidents.view")) return NextResponse.json({ message: "No tienes permiso para consultar incidencias." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT i.*, u.full_name AS assigned_name, c.full_name AS created_name
      FROM incidents i
      LEFT JOIN users u ON u.id = i.assigned_to
      LEFT JOIN users c ON c.id = i.created_by
      WHERE i.id = ${id} AND i.laboratory_id = ${session.laboratoryId} LIMIT 1
    `;
    if (rows.length === 0) return NextResponse.json({ message: "Incidencia no encontrada." }, { status: 404 });
    const comments = await sql`SELECT ic.id, ic.body, ic.comment_type, ic.attachment_id, ic.created_at, u.full_name AS created_name FROM incident_comments ic LEFT JOIN users u ON u.id = ic.created_by WHERE ic.incident_id = ${id} AND ic.laboratory_id = ${session.laboratoryId} ORDER BY ic.created_at ASC`;
    return NextResponse.json({ data: { ...rows[0], comments }, mode: "database" });
  } catch (error) {
    if (isMissingRelationError(error)) return NextResponse.json({ message: "Incidencia no encontrada." }, { status: 404 });
    console.error("[api/incidents/[id]] GET", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible cargar la incidencia." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "incidents.manage")) return NextResponse.json({ message: "No tienes permiso para editar incidencias." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });
  const sql = getSql();
  try {
    const previous = await sql`SELECT * FROM incidents WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    if (previous.length === 0) return NextResponse.json({ message: "Incidencia no encontrada." }, { status: 404 });
    if (payload.assignedTo) {
      const membership = await sql`SELECT 1 FROM memberships WHERE user_id = ${payload.assignedTo} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`;
      if (!membership.length) return NextResponse.json({ message: "El responsable no pertenece a este laboratorio." }, { status: 400 });
    }
    const resolving = payload.status === "RESOLVED" || payload.status === "CLOSED";
    const reopening = payload.status === "OPEN" && ["RESOLVED", "CLOSED", "ARCHIVED"].includes(String(previous[0].status));
    const rows = await sql`
      UPDATE incidents SET
        status = COALESCE(${payload.status ?? null}, status),
        severity = COALESCE(${payload.severity ?? null}, severity),
        assigned_to = COALESCE(${payload.assignedTo ?? null}, assigned_to),
        actions_taken = COALESCE(${payload.actionsTaken ?? null}, actions_taken),
        resolution = COALESCE(${payload.resolution ?? null}, resolution),
        title = COALESCE(${payload.title ?? null}, title),
        description = COALESCE(${payload.description ?? null}, description),
        location = COALESCE(${payload.location ?? null}, location),
        resolved_at = CASE WHEN ${resolving} THEN COALESCE(resolved_at, now()) ELSE resolved_at END,
        reopened_at = CASE WHEN ${reopening} THEN now() ELSE reopened_at END,
        archived_at = CASE WHEN ${payload.status === "ARCHIVED"} THEN now() ELSE archived_at END,
        updated_at = now()
      WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
      RETURNING *
    `;
    await writeAuditEvent(session, { action: "INCIDENT_UPDATED", entityType: "incident", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Actualización de incidencia", request });
    return NextResponse.json({ data: rows[0] });
  } catch (error) {
    if (isMissingRelationError(error)) return NextResponse.json({ success: false, error: "MODULE_NOT_PROVISIONED", message: "El módulo de incidencias aún no está habilitado. Aplica la migración 0014." }, { status: 503 });
    console.error("[api/incidents/[id]] PATCH", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible actualizar la incidencia." }, { status: 500 });
  }
}
