import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const patchSchema = z.object({
  name: z.string().min(2).max(180).optional(),
  vendor: z.string().max(180).optional().nullable(),
  reorderPoint: z.coerce.number().nonnegative().optional(),
  expiresAt: z.string().date().optional().nullable(),
  safetySheetUrl: z.string().url().optional().nullable().or(z.literal("")),
  customValues: z.record(z.string(), z.unknown()).optional(),
  // Archivar: solo cambio de estado permitido desde aquí (el stock nunca se
  // edita directamente, solo por movimientos).
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
}).refine((v) => Object.keys(v).length > 0, { message: "No hay cambios que aplicar." });

async function resolveId(context: { params: Promise<{ id: string }> }): Promise<string | null> {
  const { id } = await context.params;
  return databaseIdSchema.safeParse(id).success ? id : null;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar inventario." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: null, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT i.*, c.name AS category, COALESCE(l.name, 'Sin ubicación') AS location
    FROM inventory_items i
    LEFT JOIN inventory_categories c ON c.id = i.category_id AND c.laboratory_id = i.laboratory_id
    LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
    WHERE i.id = ${id} AND i.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (rows.length === 0) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });
  const movements = await sql`
    SELECT m.id, m.movement_type, m.quantity_delta, m.resulting_quantity, m.note, m.reason_code, m.performed_at, u.full_name AS performed_by
    FROM inventory_movements m LEFT JOIN users u ON u.id = m.performed_by
    WHERE m.inventory_item_id = ${id} AND m.laboratory_id = ${session.laboratoryId}
    ORDER BY m.performed_at DESC LIMIT 50
  `;
  return NextResponse.json({ data: { ...rows[0], movements }, mode: "database" });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "No tienes permiso para editar inventario." }, { status: 403 });
  const id = await resolveId(context);
  if (!id) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });
  const sql = getSql();
  const previous = await sql`SELECT * FROM inventory_items WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });
  const customValues = payload.customValues === undefined ? null : JSON.stringify(payload.customValues);
  const rows = await sql`
    UPDATE inventory_items SET
      name = COALESCE(${payload.name ?? null}, name),
      vendor = COALESCE(${payload.vendor ?? null}, vendor),
      reorder_point = COALESCE(${payload.reorderPoint ?? null}, reorder_point),
      expires_at = COALESCE(${payload.expiresAt ?? null}, expires_at),
      safety_sheet_url = COALESCE(${payload.safetySheetUrl || null}, safety_sheet_url),
      custom_values = COALESCE(${customValues}::jsonb, custom_values),
      status = COALESCE(${payload.status ?? null}, status),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, sku, name, status
  `;
  await writeAuditEvent(session, { action: payload.status === "ARCHIVED" ? "INVENTORY_ITEM_ARCHIVED" : "INVENTORY_ITEM_UPDATED", entityType: "inventory_item", entityId: id, previousValue: previous[0], newValue: rows[0], reason: "Edición de artículo", request });
  return NextResponse.json({ data: rows[0] });
}
