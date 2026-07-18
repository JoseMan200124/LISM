import { NextResponse } from "next/server";
import { z } from "zod";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { databaseIdSchema } from "@/lib/validation";
import { createDemoQrLabel, createOpaqueToken, listDemoQrLabels, publicScanUrl, type QrEntityType } from "@/lib/qr-security";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";

const entityTypeSchema = z.enum(["INVENTORY_ITEM", "EQUIPMENT"]);
const createSchema = z.object({
  entityType: entityTypeSchema,
  entityId: databaseIdSchema,
  labelCode: z.string().min(2).max(100).optional(),
  displayName: z.string().min(2).max(180).optional(),
  location: z.string().max(180).optional(),
});

function canView(session: Awaited<ReturnType<typeof getSession>>, entityType: QrEntityType) {
  if (!session) return false;
  return entityType === "INVENTORY_ITEM" ? hasPermission(session, "inventory.view") : hasPermission(session, "equipment.view");
}

function canManage(session: Awaited<ReturnType<typeof getSession>>, entityType: QrEntityType) {
  if (!session) return false;
  return entityType === "INVENTORY_ITEM" ? hasPermission(session, "inventory.manage") : hasPermission(session, "equipment.manage");
}

function shapeRow(request: Request, row: Record<string, unknown>) {
  return {
    id: String(row.id),
    entityType: String(row.entity_type),
    entityId: String(row.entity_id),
    opaqueToken: String(row.opaque_token),
    labelCode: String(row.label_code),
    status: String(row.status),
    displayName: String(row.display_name ?? row.label_code),
    location: String(row.location ?? "Sin ubicación"),
    createdAt: String(row.created_at),
    scanUrl: publicScanUrl(request, String(row.opaque_token)),
    // Fechas metrológicas del equipo (si aplican) para imprimirlas en la etiqueta.
    lastCalibrationAt: row.last_calibration_at ? String(row.last_calibration_at) : null,
    nextCalibrationAt: row.next_calibration_at ? String(row.next_calibration_at) : null,
    nextMaintenanceAt: row.next_maintenance_at ? String(row.next_maintenance_at) : null,
  };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const queryType = new URL(request.url).searchParams.get("entityType");
  const parsedType = queryType ? entityTypeSchema.safeParse(queryType) : null;
  if (queryType && !parsedType?.success) return NextResponse.json({ message: "Tipo de etiqueta inválido." }, { status: 400 });
  const entityType = parsedType?.success ? parsedType.data : null;
  if (entityType && !canView(session, entityType)) return NextResponse.json({ message: "No tienes permiso para consultar estas etiquetas." }, { status: 403 });

  if (!hasDatabase()) {
    const labels = listDemoQrLabels()
      .filter((label) => !entityType || label.entityType === entityType)
      .filter((label) => canView(session, label.entityType))
      .map((label) => ({ ...label, profile: undefined, scanUrl: publicScanUrl(request, label.opaqueToken) }));
    return NextResponse.json({ data: labels, mode: "demo" });
  }

  const sql = getSql();
  const rows = entityType
    ? await sql`
      SELECT q.id, q.entity_type, q.entity_id, q.opaque_token, q.label_code, q.status, q.created_at,
        CASE WHEN q.entity_type = 'INVENTORY_ITEM' THEN i.name ELSE e.name END AS display_name,
        COALESCE(CASE WHEN q.entity_type = 'INVENTORY_ITEM' THEN il.name ELSE el.name END, 'Sin ubicación') AS location,
        e.last_calibration_at, p.next_calibration_at,
        COALESCE(p.next_maintenance_at, e.next_maintenance_at) AS next_maintenance_at
      FROM qr_identifiers q
      LEFT JOIN inventory_items i ON q.entity_type = 'INVENTORY_ITEM' AND i.id = q.entity_id AND i.laboratory_id = q.laboratory_id
      LEFT JOIN equipment e ON q.entity_type = 'EQUIPMENT' AND e.id = q.entity_id AND e.laboratory_id = q.laboratory_id
      LEFT JOIN storage_locations il ON il.id = i.storage_location_id
      LEFT JOIN storage_locations el ON el.id = e.storage_location_id
      LEFT JOIN (
        SELECT equipment_id,
          MIN(next_due_at) FILTER (WHERE plan_type = 'CALIBRATION') AS next_calibration_at,
          MIN(next_due_at) FILTER (WHERE plan_type = 'MAINTENANCE') AS next_maintenance_at
        FROM equipment_plans
        WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'
        GROUP BY equipment_id
      ) p ON p.equipment_id = e.id
      WHERE q.laboratory_id = ${session.laboratoryId} AND q.entity_type = ${entityType}
      ORDER BY q.created_at DESC`
    : await sql`
      SELECT q.id, q.entity_type, q.entity_id, q.opaque_token, q.label_code, q.status, q.created_at,
        CASE WHEN q.entity_type = 'INVENTORY_ITEM' THEN i.name ELSE e.name END AS display_name,
        COALESCE(CASE WHEN q.entity_type = 'INVENTORY_ITEM' THEN il.name ELSE el.name END, 'Sin ubicación') AS location,
        e.last_calibration_at, p.next_calibration_at,
        COALESCE(p.next_maintenance_at, e.next_maintenance_at) AS next_maintenance_at
      FROM qr_identifiers q
      LEFT JOIN inventory_items i ON q.entity_type = 'INVENTORY_ITEM' AND i.id = q.entity_id AND i.laboratory_id = q.laboratory_id
      LEFT JOIN equipment e ON q.entity_type = 'EQUIPMENT' AND e.id = q.entity_id AND e.laboratory_id = q.laboratory_id
      LEFT JOIN storage_locations il ON il.id = i.storage_location_id
      LEFT JOIN storage_locations el ON el.id = e.storage_location_id
      LEFT JOIN (
        SELECT equipment_id,
          MIN(next_due_at) FILTER (WHERE plan_type = 'CALIBRATION') AS next_calibration_at,
          MIN(next_due_at) FILTER (WHERE plan_type = 'MAINTENANCE') AS next_maintenance_at
        FROM equipment_plans
        WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'
        GROUP BY equipment_id
      ) p ON p.equipment_id = e.id
      WHERE q.laboratory_id = ${session.laboratoryId}
      ORDER BY q.created_at DESC`;
  return NextResponse.json({ data: rows.map((row) => shapeRow(request, row as Record<string, unknown>)), mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de etiqueta inválidos.", issues: parsed.error.issues }, { status: 400 });
  const { entityType, entityId } = parsed.data;
  if (!canManage(session, entityType)) return NextResponse.json({ message: "No tienes permiso para generar esta etiqueta." }, { status: 403 });

  if (!hasDatabase()) {
    const existing = listDemoQrLabels().find((item) => item.entityType === entityType && item.entityId === entityId);
    const label = existing ?? (parsed.data.labelCode && parsed.data.displayName
      ? createDemoQrLabel({
        entityType,
        entityId,
        labelCode: parsed.data.labelCode,
        displayName: parsed.data.displayName,
        location: parsed.data.location,
      })
      : undefined);
    if (!label) return NextResponse.json({ message: "No se encontró el recurso para generar su etiqueta QR." }, { status: 404 });
    return NextResponse.json({ data: { ...label, profile: undefined, scanUrl: publicScanUrl(request, label.opaqueToken) }, mode: "demo" }, { status: 201 });
  }

  const sql = getSql();
  const entities = entityType === "INVENTORY_ITEM"
    ? await sql`SELECT id, sku AS label_code, name FROM inventory_items WHERE id = ${entityId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1`
    : await sql`SELECT id, code AS label_code, name FROM equipment WHERE id = ${entityId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  const entity = entities[0] as Record<string, unknown> | undefined;
  if (!entity) return NextResponse.json({ message: "No se encontró el recurso dentro del laboratorio activo." }, { status: 404 });
  const token = createOpaqueToken();
  const rows = await sql`
    INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
    VALUES (${session.laboratoryId}, ${entityType}, ${entityId}, ${token}, ${String(entity.label_code)})
    ON CONFLICT (laboratory_id, entity_type, entity_id)
    DO UPDATE SET status = 'ACTIVE'
    RETURNING id, entity_type, entity_id, opaque_token, label_code, status, created_at
  `;
  await writeAuditEvent(session, { action: "QR_LABEL_ISSUED", entityType: "qr_identifier", entityId: String(rows[0].id), newValue: rows[0], reason: "Generación de etiqueta QR segura", request });
  return NextResponse.json({ data: { ...shapeRow(request, { ...rows[0], display_name: entity.name }), displayName: String(entity.name) }, mode: "database" }, { status: 201 });
}
