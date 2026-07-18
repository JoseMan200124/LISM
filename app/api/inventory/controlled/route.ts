import { NextResponse } from "next/server";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";

// Registro de reactivos controlados (doble uso o precursores).
// GET sin parámetros: lista los reactivos marcados como controlados con un
// resumen (existencia, último consumo, total consumido, número de consumos).
// GET ?itemId=…: devuelve el artículo y su historial completo de movimientos
// con la trazabilidad del consumo (quién, para qué, área/proyecto, saldos).

function isMissingMigration(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  // 42703 = undefined_column (is_controlled / usage_* aún sin migrar).
  return text.includes("is_controlled") || text.includes("usage_area") || text.includes("42703");
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) {
    return NextResponse.json({ message: "No tienes permiso para consultar reactivos controlados." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const url = new URL(request.url);
  const itemIdParam = url.searchParams.get("itemId");
  const sql = getSql();

  try {
    if (itemIdParam) {
      if (!databaseIdSchema.safeParse(itemIdParam).success) {
        return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
      }
      const items = await sql`
        SELECT i.id, i.sku, i.name, i.item_type, i.control_kind, i.quantity, i.unit, i.status,
          c.name AS category, COALESCE(l.name, 'Sin ubicación') AS location
        FROM inventory_items i
        JOIN inventory_categories c ON c.id = i.category_id AND c.laboratory_id = i.laboratory_id
        LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
        WHERE i.id = ${itemIdParam} AND i.laboratory_id = ${session.laboratoryId} AND i.is_controlled = TRUE
        LIMIT 1
      `;
      if (items.length === 0) return NextResponse.json({ message: "Reactivo controlado no encontrado." }, { status: 404 });
      const movements = await sql`
        SELECT m.id, m.movement_type, m.quantity_delta, m.previous_quantity, m.resulting_quantity,
          m.reason_code, m.note, m.usage_area, m.usage_purpose, m.used_by_person, m.authorized_by, m.performed_at,
          pu.full_name AS performed_by
        FROM inventory_movements m
        LEFT JOIN users pu ON pu.id = m.performed_by
        WHERE m.inventory_item_id = ${itemIdParam} AND m.laboratory_id = ${session.laboratoryId}
        ORDER BY m.performed_at DESC
        LIMIT 500
      `;
      return NextResponse.json({ data: { ...items[0], movements }, mode: "database" });
    }

    const rows = await sql`
      SELECT i.id, i.sku, i.name, i.item_type, i.control_kind, i.quantity, i.unit, i.status,
        c.name AS category, COALESCE(l.name, 'Sin ubicación') AS location,
        (SELECT max(m.performed_at) FROM inventory_movements m
           WHERE m.inventory_item_id = i.id AND m.quantity_delta < 0) AS last_consumption_at,
        COALESCE((SELECT sum(-m.quantity_delta) FROM inventory_movements m
           WHERE m.inventory_item_id = i.id AND m.quantity_delta < 0), 0) AS total_consumed,
        (SELECT count(*) FROM inventory_movements m
           WHERE m.inventory_item_id = i.id AND m.quantity_delta < 0) AS consumption_count
      FROM inventory_items i
      JOIN inventory_categories c ON c.id = i.category_id AND c.laboratory_id = i.laboratory_id
      LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
      WHERE i.laboratory_id = ${session.laboratoryId} AND i.is_controlled = TRUE
      ORDER BY i.status ASC, i.name ASC
    `;
    return NextResponse.json({ data: rows, mode: "database" });
  } catch (error) {
    if (isMissingMigration(error)) {
      return NextResponse.json({ data: itemIdParam ? null : [], mode: "pending-migration" });
    }
    throw error;
  }
}
