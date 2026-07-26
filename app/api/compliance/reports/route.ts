import { NextResponse } from "next/server";
import { hasAnyPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";

// Datos de los reportes de cumplimiento. Devuelve filas ya formateadas para la
// tabla del PDF; la maquetación y la impresión ocurren en el navegador con la
// plantilla de lib/report-template.ts, igual que el resto de reportes.
//
// Tipos:
//   inventory        Inventario actual (existencia por envase)
//   kardex           Movimientos de un artículo o de todo el laboratorio
//   consumption-user Consumo por usuario
//   consumption-area Consumo por laboratorio, área o proyecto
//   expiring         Reactivos próximos a vencer
//   depleted         Reactivos agotados
//   movements        Historial completo de movimientos

const REPORT_TYPES = new Set(["inventory", "kardex", "consumption-user", "consumption-area", "expiring", "depleted", "movements"]);

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasAnyPermission(session, ["inventory.view", "compliance.view"])) {
    return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  }
  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "inventory";
  if (!REPORT_TYPES.has(type)) return NextResponse.json({ message: "Tipo de reporte no soportado." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const onlyControlled = url.searchParams.get("controlled") === "1";
  const itemId = url.searchParams.get("itemId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (itemId && !databaseIdSchema.safeParse(itemId).success) {
    return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  }

  const sql = getSql();
  const lab = session.laboratoryId;

  switch (type) {
    case "inventory": {
      const rows = await sql`
        SELECT i.sku, i.name, COALESCE(c.name, cat.name) AS category, i.lot_number,
               COALESCE(l.name, 'Sin ubicación') AS location,
               i.quantity, i.unit, i.reorder_point, i.expires_at, i.cas_number,
               CASE WHEN i.is_controlled OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR') THEN 'Sí' ELSE 'No' END AS controlled
        FROM inventory_items i
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        LEFT JOIN inventory_categories cat ON cat.id = i.category_id
        LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
        WHERE i.laboratory_id = ${lab} AND i.status = 'ACTIVE'
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        ORDER BY i.name
      `;
      return NextResponse.json({ data: rows });
    }

    case "kardex": {
      const rows = await sql`
        SELECT m.performed_at, i.sku, i.name, m.movement_type, m.quantity_delta,
               m.previous_quantity, m.resulting_quantity, i.unit, m.reason_code,
               COALESCE(u.full_name, m.used_by_person, '—') AS performed_by,
               m.usage_area, m.usage_purpose, m.authorized_by, m.note
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
        LEFT JOIN users u ON u.id = m.performed_by
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        WHERE m.laboratory_id = ${lab}
          AND (${itemId ?? null}::uuid IS NULL OR m.inventory_item_id = ${itemId ?? null}::uuid)
          AND (${from ?? null}::date IS NULL OR m.performed_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR m.performed_at < (${to ?? null}::date + 1))
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        ORDER BY i.name, m.performed_at
        LIMIT 5000
      `;
      return NextResponse.json({ data: rows });
    }

    case "consumption-user": {
      const rows = await sql`
        SELECT COALESCE(u.full_name, m.used_by_person, 'Sin identificar') AS person,
               i.name AS item_name, i.sku, i.unit,
               sum(-m.quantity_delta) AS total_consumed,
               count(*)::int AS movements,
               max(m.performed_at) AS last_movement
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
        LEFT JOIN users u ON u.id = m.performed_by
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        WHERE m.laboratory_id = ${lab} AND m.quantity_delta < 0
          AND (${from ?? null}::date IS NULL OR m.performed_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR m.performed_at < (${to ?? null}::date + 1))
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        GROUP BY person, i.name, i.sku, i.unit
        ORDER BY person, total_consumed DESC
        LIMIT 2000
      `;
      return NextResponse.json({ data: rows });
    }

    case "consumption-area": {
      const rows = await sql`
        SELECT COALESCE(NULLIF(m.usage_area, ''), 'Sin área declarada') AS area,
               i.name AS item_name, i.sku, i.unit,
               sum(-m.quantity_delta) AS total_consumed,
               count(*)::int AS movements,
               max(m.performed_at) AS last_movement
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        WHERE m.laboratory_id = ${lab} AND m.quantity_delta < 0
          AND (${from ?? null}::date IS NULL OR m.performed_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR m.performed_at < (${to ?? null}::date + 1))
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        GROUP BY area, i.name, i.sku, i.unit
        ORDER BY area, total_consumed DESC
        LIMIT 2000
      `;
      return NextResponse.json({ data: rows });
    }

    case "expiring": {
      const days = Number(url.searchParams.get("days") ?? 90);
      const rows = await sql`
        SELECT i.sku, i.name, i.lot_number, i.quantity, i.unit, i.expires_at,
               COALESCE(l.name, 'Sin ubicación') AS location,
               (i.expires_at - current_date) AS days_left,
               CASE WHEN i.is_controlled OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR') THEN 'Sí' ELSE 'No' END AS controlled
        FROM inventory_items i
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
        WHERE i.laboratory_id = ${lab} AND i.status = 'ACTIVE' AND i.expires_at IS NOT NULL
          AND i.expires_at <= current_date + ${Number.isFinite(days) ? days : 90}
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        ORDER BY i.expires_at
      `;
      return NextResponse.json({ data: rows });
    }

    case "depleted": {
      const rows = await sql`
        SELECT i.sku, i.name, i.lot_number, i.unit, i.status,
               COALESCE(l.name, 'Sin ubicación') AS location,
               (SELECT max(m.performed_at) FROM inventory_movements m WHERE m.inventory_item_id = i.id) AS last_movement,
               i.initial_quantity, i.discarded_at, i.archived_at
        FROM inventory_items i
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
        WHERE i.laboratory_id = ${lab} AND i.quantity <= 0
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        ORDER BY COALESCE(i.discarded_at, i.archived_at, i.updated_at) DESC NULLS LAST
        LIMIT 1000
      `;
      return NextResponse.json({ data: rows });
    }

    case "movements":
    default: {
      const rows = await sql`
        SELECT m.performed_at, i.sku, i.name, m.movement_type, m.quantity_delta, i.unit,
               m.previous_quantity, m.resulting_quantity, m.reason_code,
               COALESCE(u.full_name, gs.display_name, m.used_by_person, '—') AS performed_by,
               m.usage_area, m.authorized_by, m.note
        FROM inventory_movements m
        JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
        LEFT JOIN users u ON u.id = m.performed_by
        LEFT JOIN guest_access_sessions gs ON gs.id = m.guest_session_id
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        WHERE m.laboratory_id = ${lab}
          AND (${from ?? null}::date IS NULL OR m.performed_at >= ${from ?? null}::date)
          AND (${to ?? null}::date IS NULL OR m.performed_at < (${to ?? null}::date + 1))
          AND (${onlyControlled}::boolean = FALSE OR i.is_controlled = TRUE OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR'))
        ORDER BY m.performed_at DESC
        LIMIT 5000
      `;
      return NextResponse.json({ data: rows });
    }
  }
}
