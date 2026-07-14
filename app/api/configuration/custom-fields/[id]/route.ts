import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const patchSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  required: z.boolean().optional(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar." });

// Módulo → tabla cuyo custom_values podría contener el field_key. Para permitir
// el borrado solo cuando el campo nunca tuvo datos (§3.7).
const MODULE_TABLE: Record<string, "inventory_items" | "equipment"> = {
  inventory: "inventory_items",
  equipment: "equipment",
};

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para configurar campos." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT * FROM custom_field_definitions WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Campo no encontrado." }, { status: 404 });
  const requiredMode = payload.required === undefined ? null : (payload.required ? "REQUIRED" : "OPTIONAL");
  const rows = await sql`
    UPDATE custom_field_definitions SET
      label = COALESCE(${payload.label ?? null}, label),
      required_mode = COALESCE(${requiredMode}, required_mode),
      status = COALESCE(${payload.status ?? null}, status),
      sort_order = COALESCE(${payload.sortOrder ?? null}, sort_order),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, module_key, field_key, label, field_type, required_mode, validation_rule, sort_order, status
  `;
  await writeAuditEvent(session, { action: "CUSTOM_FIELD_UPDATED", entityType: "custom_field_definition", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Edición de campo personalizado", request });
  return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para configurar campos." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id }, mode: "demo" });
  const sql = getSql();
  const rows = await sql`SELECT * FROM custom_field_definitions WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (rows.length === 0) return NextResponse.json({ message: "Campo no encontrado." }, { status: 404 });
  const def = rows[0] as { module_key: string; field_key: string };
  const table = MODULE_TABLE[def.module_key];
  // Solo se permite borrar si el campo nunca tuvo datos; si tuvo, se archiva.
  if (table) {
    const used = table === "inventory_items"
      ? await sql`SELECT 1 FROM inventory_items WHERE laboratory_id = ${session.laboratoryId} AND custom_values ? ${def.field_key} LIMIT 1`
      : await sql`SELECT 1 FROM equipment WHERE laboratory_id = ${session.laboratoryId} AND custom_values ? ${def.field_key} LIMIT 1`;
    if (used.length > 0) {
      await sql`UPDATE custom_field_definitions SET status = 'ARCHIVED', updated_at = now() WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
      await writeAuditEvent(session, { action: "CUSTOM_FIELD_ARCHIVED", entityType: "custom_field_definition", entityId: id, previousValue: rows[0], reason: "El campo ya tenía datos; se archiva en lugar de borrar", request });
      return NextResponse.json({ data: { id, archived: true }, message: "El campo ya tenía datos registrados, por lo que se archivó en lugar de eliminarse." });
    }
  }
  await sql`DELETE FROM custom_field_definitions WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
  await writeAuditEvent(session, { action: "CUSTOM_FIELD_DELETED", entityType: "custom_field_definition", entityId: id, previousValue: rows[0], reason: "Borrado de campo personalizado sin datos", request });
  return NextResponse.json({ data: { id, deleted: true } });
}
