import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";

// Edición y baja de una ubicación de almacenamiento. Hasta ahora solo se podían
// crear, así que un error de escritura ("fdfdfdfd") quedaba para siempre en la
// lista y en el selector de artículos.

export const patchSchema = z.object({
  name: z.string().min(2).max(160).optional(),
  locationType: z.string().min(2).max(60).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

function canManage(session: Awaited<ReturnType<typeof getSession>>): boolean {
  if (!session) return false;
  return hasPermission(session, "inventory.manage") || hasPermission(session, "equipment.manage");
}

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ message: "No tienes permiso para editar ubicaciones." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de ubicación inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });

  const sql = getSql();
  const previous = await sql`SELECT * FROM storage_locations WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Ubicación no encontrada." }, { status: 404 });

  const rows = await sql`
    UPDATE storage_locations SET
      name = COALESCE(${payload.name ?? null}, name),
      location_type = COALESCE(${payload.locationType ?? null}, location_type),
      status = COALESCE(${payload.status ?? null}, status)::record_status,
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, code, name, location_type, status
  `;
  await writeAuditEvent(session, {
    action: "STORAGE_LOCATION_UPDATED",
    entityType: "storage_location",
    entityId: id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: "Edición de ubicación",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}

// La baja desactiva la ubicación en lugar de borrar la fila: los movimientos y
// artículos históricos siguen apuntando a ella y su trazabilidad no se rompe.
// Una ubicación con artículos o equipos asignados no se puede dar de baja.
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!canManage(session)) return NextResponse.json({ message: "No tienes permiso para eliminar ubicaciones." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  if (!hasDatabase()) return NextResponse.json({ data: { id, status: "INACTIVE" }, mode: "demo" });

  const sql = getSql();
  const previous = await sql`SELECT * FROM storage_locations WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Ubicación no encontrada." }, { status: 404 });

  const usage = await sql`
    SELECT
      (SELECT count(*)::int FROM inventory_items WHERE storage_location_id = ${id} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE') AS items,
      (SELECT count(*)::int FROM equipment WHERE storage_location_id = ${id} AND laboratory_id = ${session.laboratoryId}) AS equipment,
      (SELECT count(*)::int FROM storage_locations WHERE parent_id = ${id} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE') AS children
  `;
  const items = Number(usage[0]?.items ?? 0);
  const equipment = Number(usage[0]?.equipment ?? 0);
  const children = Number(usage[0]?.children ?? 0);
  if (items > 0 || equipment > 0 || children > 0) {
    const parts = [
      items > 0 ? `${items} artículo(s)` : "",
      equipment > 0 ? `${equipment} equipo(s)` : "",
      children > 0 ? `${children} ubicación(es) dentro` : "",
    ].filter(Boolean).join(", ");
    return NextResponse.json({
      success: false,
      error: "LOCATION_IN_USE",
      message: `La ubicación tiene ${parts}. Muévelos a otra ubicación antes de eliminarla.`,
    }, { status: 409 });
  }

  const rows = await sql`
    UPDATE storage_locations SET status = 'INACTIVE', updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, code, name, location_type, status
  `;
  await writeAuditEvent(session, {
    action: "STORAGE_LOCATION_DELETED",
    entityType: "storage_location",
    entityId: id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: "Baja de ubicación",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
