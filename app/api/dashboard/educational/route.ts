import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";

type EducationalDashboardData = {
  upcomingPractices: number;
  pendingReservations: number;
  lowStockItems: number;
  nearExpiryItems: number;
  maintenanceDueEquipment: number;
  recentQrScans: number;
  operationalEquipment: number;
  totalEquipment: number;
};

const demoData: EducationalDashboardData = {
  upcomingPractices: 6,
  pendingReservations: 4,
  lowStockItems: 2,
  nearExpiryItems: 3,
  maintenanceDueEquipment: 1,
  recentQrScans: 14,
  operationalEquipment: 9,
  totalEquipment: 10,
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para ver el resumen." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoData, mode: "demo" });

  const sql = getSql();
  const labId = session.laboratoryId;

  const [practices, reservations, inventory, equipment, qrScans] = await Promise.all([
    sql`SELECT COUNT(*) AS total FROM educational_practices WHERE laboratory_id = ${labId} AND status IN ('PLANNED','PREPARING','READY') AND starts_at >= now()`,
    sql`SELECT COUNT(*) AS total FROM resource_reservations WHERE laboratory_id = ${labId} AND status = 'PENDING'`,
    sql`SELECT COUNT(*) FILTER (WHERE quantity <= reorder_point) AS low_stock, COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= current_date + interval '30 days' AND expires_at > current_date) AS near_expiry FROM inventory_items WHERE laboratory_id = ${labId} AND status = 'ACTIVE'`,
    sql`SELECT COUNT(*) FILTER (WHERE status = 'OPERATIONAL') AS operational, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'MAINTENANCE_DUE') AS maintenance_due FROM equipment WHERE laboratory_id = ${labId}`,
    sql`SELECT COUNT(*) AS total FROM qr_scan_events qse JOIN qr_identifiers qi ON qi.id = qse.qr_identifier_id WHERE qi.laboratory_id = ${labId} AND qse.scanned_at >= now() - interval '24 hours'`,
  ]);

  const data: EducationalDashboardData = {
    upcomingPractices: Number(practices[0].total),
    pendingReservations: Number(reservations[0].total),
    lowStockItems: Number(inventory[0].low_stock),
    nearExpiryItems: Number(inventory[0].near_expiry),
    maintenanceDueEquipment: Number(equipment[0].maintenance_due),
    recentQrScans: Number(qrScans[0].total),
    operationalEquipment: Number(equipment[0].operational),
    totalEquipment: Number(equipment[0].total),
  };

  return NextResponse.json({ data, mode: "database" });
}
