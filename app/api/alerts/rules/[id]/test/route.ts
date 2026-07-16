import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { databaseIdSchema } from "@/lib/validation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "alerts.manage")) return NextResponse.json({ message: "No tienes permiso para probar reglas." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { total: 0, examples: [], createsAlerts: false }, mode: "demo" });
  const sql = getSql();
  const rules = await sql`SELECT source_type, trigger_type, condition_config FROM alert_rules WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} AND status <> 'ARCHIVED' LIMIT 1`;
  if (!rules.length) return NextResponse.json({ message: "Regla no encontrada." }, { status: 404 });
  const source = String(rules[0].source_type);
  const rows = source === "INVENTORY_ITEM" ? await sql`SELECT id, sku AS code, name FROM inventory_items WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' AND ((alert_low_stock AND quantity <= reorder_point) OR (alert_expiry AND expires_at <= current_date + interval '30 days')) LIMIT 20`
    : source === "EQUIPMENT" ? await sql`SELECT id, code, name FROM equipment WHERE laboratory_id = ${session.laboratoryId} AND status IN ('OUT_OF_SERVICE','MAINTENANCE_DUE') LIMIT 20`
    : source === "EQUIPMENT_PLAN" ? await sql`SELECT p.id, e.code, p.name FROM equipment_plans p JOIN equipment e ON e.id = p.equipment_id AND e.laboratory_id = p.laboratory_id WHERE p.laboratory_id = ${session.laboratoryId} AND p.status = 'ACTIVE' AND p.next_due_at <= now() + interval '30 days' LIMIT 20`
    : source === "EDUCATIONAL_PRACTICE" ? await sql`SELECT id, practice_code AS code, title AS name FROM educational_practices WHERE laboratory_id = ${session.laboratoryId} AND status IN ('PLANNED','PREPARING') AND starts_at <= now() + interval '7 days' AND starts_at >= now() LIMIT 20`
    : source === "RESOURCE_RESERVATION" ? await sql`SELECT r.id, r.reservation_code AS code, COALESCE(ep.title, 'Reserva') AS name FROM resource_reservations r LEFT JOIN educational_practices ep ON ep.id = r.practice_id AND ep.laboratory_id = r.laboratory_id WHERE r.laboratory_id = ${session.laboratoryId} AND r.status IN ('PENDING','APPROVED') AND r.needed_at <= now() + interval '2 days' LIMIT 20`
    : await sql`SELECT id, incident_code AS code, title AS name FROM incidents WHERE laboratory_id = ${session.laboratoryId} AND severity IN ('HIGH','CRITICAL') AND status IN ('OPEN','IN_PROGRESS') LIMIT 20`;
  return NextResponse.json({ data: { total: rows.length, examples: rows.slice(0, 5), createsAlerts: false }, mode: "database" });
}
