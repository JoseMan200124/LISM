import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";

type PracticeSummary = {
  id: string;
  practice_code: string;
  title: string;
  course_name: string | null;
  teacher_name: string | null;
  starts_at: string;
  status: string;
};
type AlertSummary = {
  id: string;
  title: string;
  details: string | null;
  severity: string;
  status: string;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
};

type EducationalDashboardData = {
  upcomingPractices: number;
  pendingReservations: number;
  lowStockItems: number;
  nearExpiryItems: number;
  maintenanceDueEquipment: number;
  recentQrScans: number;
  operationalEquipment: number;
  totalEquipment: number;
  upcomingPracticesList: PracticeSummary[];
  attentionAlerts: AlertSummary[];
};

const demoData: EducationalDashboardData = {
  upcomingPractices: 0,
  pendingReservations: 0,
  lowStockItems: 0,
  nearExpiryItems: 0,
  maintenanceDueEquipment: 0,
  recentQrScans: 0,
  operationalEquipment: 0,
  totalEquipment: 0,
  upcomingPracticesList: [],
  attentionAlerts: [],
};

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para ver el resumen." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoData, mode: "demo" });

  const sql = getSql();
  const labId = session.laboratoryId;

  const [practices, reservations, inventory, equipment, qrScans, practiceList, alertList] = await Promise.all([
    sql`SELECT COUNT(*) AS total FROM educational_practices WHERE laboratory_id = ${labId} AND status IN ('PLANNED','PREPARING','READY') AND starts_at >= now()`,
    sql`SELECT COUNT(*) AS total FROM resource_reservations WHERE laboratory_id = ${labId} AND status = 'PENDING'`,
    sql`SELECT COUNT(*) FILTER (WHERE quantity <= reorder_point) AS low_stock, COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= current_date + interval '30 days' AND expires_at > current_date) AS near_expiry FROM inventory_items WHERE laboratory_id = ${labId} AND status = 'ACTIVE'`,
    sql`SELECT COUNT(*) FILTER (WHERE status = 'OPERATIONAL') AS operational, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'MAINTENANCE_DUE') AS maintenance_due FROM equipment WHERE laboratory_id = ${labId}`,
    sql`SELECT COUNT(*) AS total FROM qr_scan_events qse JOIN qr_identifiers qi ON qi.id = qse.qr_identifier_id WHERE qi.laboratory_id = ${labId} AND qse.scanned_at >= now() - interval '24 hours'`,
    sql`SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.status, u.full_name AS teacher_name
        FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
        WHERE ep.laboratory_id = ${labId} AND ep.status IN ('PLANNED','PREPARING','READY') AND ep.starts_at >= now()
        ORDER BY ep.starts_at ASC LIMIT 6`,
    sql`SELECT id, title, details, severity, status, source_type, source_id, created_at
        FROM alerts WHERE laboratory_id = ${labId} AND status NOT IN ('RESOLVED','CLOSED')
        ORDER BY CASE severity WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END, created_at DESC LIMIT 6`,
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
    upcomingPracticesList: practiceList as PracticeSummary[],
    attentionAlerts: alertList as AlertSummary[],
  };

  return NextResponse.json({ data, mode: "database" });
}
