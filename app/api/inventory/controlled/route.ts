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
  // 42P01 = undefined_table (controlled_usage_requests, migración 0020).
  return (
    text.includes("is_controlled") ||
    text.includes("usage_area") ||
    text.includes("controlled_usage_requests") ||
    text.includes("usage_request_id") ||
    text.includes("42703") ||
    text.includes("42P01")
  );
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
          pu.full_name AS performed_by, r.request_code AS authorization_code
        FROM inventory_movements m
        LEFT JOIN users pu ON pu.id = m.performed_by
        LEFT JOIN controlled_usage_requests r ON r.id = m.usage_request_id
        WHERE m.inventory_item_id = ${itemIdParam} AND m.laboratory_id = ${session.laboratoryId}
        ORDER BY m.performed_at DESC
        LIMIT 500
      `;
      // Autorizaciones del reactivo: dejan ver qué se pidió, quién autorizó y
      // qué consumo cerró cada folio.
      const requests = await sql`
        SELECT r.id, r.request_code, r.status, r.quantity, r.approved_quantity, r.unit,
          r.used_by_person, r.usage_area, r.usage_purpose, r.planned_for, r.notes,
          r.expires_at, r.review_note, r.reviewed_at, r.consumed_at, r.consumed_quantity, r.created_at,
          rq.full_name AS requested_by_name, rv.full_name AS reviewed_by_name
        FROM controlled_usage_requests r
        LEFT JOIN users rq ON rq.id = r.requested_by
        LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.inventory_item_id = ${itemIdParam} AND r.laboratory_id = ${session.laboratoryId}
        ORDER BY r.created_at DESC
        LIMIT 200
      `;
      return NextResponse.json({ data: { ...items[0], movements, requests }, mode: "database" });
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
    // Solicitudes por autorizar de cada reactivo. Va en una consulta aparte para
    // que la lista siga funcionando si la migración 0020 aún no se aplicó.
    let pendingByItem: Record<string, number> = {};
    try {
      const pendingRows = await sql`
        SELECT inventory_item_id, count(*)::int AS total
        FROM controlled_usage_requests
        WHERE laboratory_id = ${session.laboratoryId} AND status = 'PENDING'
        GROUP BY inventory_item_id
      `;
      pendingByItem = Object.fromEntries(pendingRows.map((row) => [String(row.inventory_item_id), Number(row.total)]));
    } catch (error) {
      if (!isMissingMigration(error)) throw error;
    }
    const data = rows.map((row) => ({ ...row, pending_requests: pendingByItem[String(row.id)] ?? 0 }));
    return NextResponse.json({ data, mode: "database" });
  } catch (error) {
    if (isMissingMigration(error)) {
      return NextResponse.json({ data: itemIdParam ? null : [], mode: "pending-migration" });
    }
    throw error;
  }
}
