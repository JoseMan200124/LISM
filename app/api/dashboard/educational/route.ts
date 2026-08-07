import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { resolveNotifications } from "@/lib/notifications";

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
  // Destino al que lleva el bloque "Requiere atención". Las alertas de la tabla
  // `alerts` lo derivan de su origen; el resto (vencimientos, autorizaciones,
  // licencias, avisos) trae el suyo propio.
  href?: string;
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
  openIncidents: number;
  criticalIncidents: number;
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
  openIncidents: 0,
  criticalIncidents: 0,
  upcomingPracticesList: [],
  attentionAlerts: [],
};

// Notificaciones que exigen acción, en el formato que ya consume el panel. Se
// dejan fuera las informativas (avisos y mensajes): esas se leen en la campana,
// no ocupan el bloque de atención del resumen.
const ATTENTION_TYPES = new Set(["alert", "expiry", "controlled", "permit"]);

async function resolveAttentionItems(session: NonNullable<Awaited<ReturnType<typeof getSession>>>): Promise<AlertSummary[]> {
  const { data } = await resolveNotifications(session);
  return data
    .filter((item) => ATTENTION_TYPES.has(item.type))
    .slice(0, 6)
    .map((item) => ({
      id: item.key,
      title: item.title,
      details: item.body,
      severity: item.severity,
      status: "OPEN",
      source_type: null,
      source_id: null,
      created_at: item.createdAt,
      href: item.targetUrl,
    }));
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para ver el resumen." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoData, mode: "demo" });

  const sql = getSql();
  const labId = session.laboratoryId;
  const isProfessor = session.role === "PROFESSOR";
  const isStudent = session.role === "STUDENT";

  const [practices, reservations, inventory, equipment, qrScans, practiceList, alertList, incidents] = await Promise.all([
    isProfessor ? sql`SELECT COUNT(*) AS total FROM educational_practices WHERE laboratory_id = ${labId} AND teacher_user_id = ${session.userId} AND status IN ('PLANNED','PREPARING','READY') AND starts_at >= now()`
      : isStudent ? sql`SELECT COUNT(DISTINCT ep.id) AS total FROM educational_practices ep LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE' LEFT JOIN educational_group_members gm ON gm.group_id = ep.group_id AND gm.laboratory_id = ep.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE' WHERE ep.laboratory_id = ${labId} AND (pp.id IS NOT NULL OR gm.id IS NOT NULL) AND ep.status IN ('PLANNED','PREPARING','READY') AND ep.starts_at >= now()`
      : sql`SELECT COUNT(*) AS total FROM educational_practices WHERE laboratory_id = ${labId} AND status IN ('PLANNED','PREPARING','READY') AND starts_at >= now()`,
    isProfessor ? sql`SELECT COUNT(*) AS total FROM resource_reservations r JOIN educational_practices ep ON ep.id = r.practice_id AND ep.laboratory_id = r.laboratory_id WHERE r.laboratory_id = ${labId} AND ep.teacher_user_id = ${session.userId} AND r.status = 'PENDING'`
      : isStudent ? Promise.resolve([{ total: 0 }]) : sql`SELECT COUNT(*) AS total FROM resource_reservations WHERE laboratory_id = ${labId} AND status = 'PENDING'`,
    isStudent ? Promise.resolve([{ low_stock: 0, near_expiry: 0 }]) : sql`SELECT COUNT(*) FILTER (WHERE track_stock = TRUE AND alert_low_stock = TRUE AND quantity <= reorder_point) AS low_stock, COUNT(*) FILTER (WHERE alert_expiry = TRUE AND expires_at IS NOT NULL AND expires_at <= current_date + interval '30 days' AND expires_at > current_date) AS near_expiry FROM inventory_items WHERE laboratory_id = ${labId} AND status = 'ACTIVE'`,
    isStudent ? Promise.resolve([{ operational: 0, total: 0, maintenance_due: 0 }]) : sql`SELECT COUNT(*) FILTER (WHERE status = 'OPERATIONAL') AS operational, COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'MAINTENANCE_DUE') AS maintenance_due FROM equipment WHERE laboratory_id = ${labId}`,
    isStudent ? Promise.resolve([{ total: 0 }]) : sql`SELECT COUNT(*) AS total FROM qr_scan_events qse JOIN qr_identifiers qi ON qi.id = qse.qr_identifier_id WHERE qi.laboratory_id = ${labId} AND qse.scanned_at >= now() - interval '24 hours'`,
    isProfessor ? sql`SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.status, u.full_name AS teacher_name FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id WHERE ep.laboratory_id = ${labId} AND ep.teacher_user_id = ${session.userId} AND ep.status IN ('PLANNED','PREPARING','READY') AND ep.starts_at >= now() ORDER BY ep.starts_at ASC LIMIT 6`
      : isStudent ? sql`SELECT DISTINCT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.status, u.full_name AS teacher_name FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = ep.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE' LEFT JOIN educational_group_members gm ON gm.group_id = ep.group_id AND gm.laboratory_id = ep.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE' WHERE ep.laboratory_id = ${labId} AND (pp.id IS NOT NULL OR gm.id IS NOT NULL) AND ep.status IN ('PLANNED','PREPARING','READY') AND ep.starts_at >= now() ORDER BY ep.starts_at ASC LIMIT 6`
      : sql`SELECT ep.id, ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.status, u.full_name AS teacher_name
        FROM educational_practices ep LEFT JOIN users u ON u.id = ep.teacher_user_id
        WHERE ep.laboratory_id = ${labId} AND ep.status IN ('PLANNED','PREPARING','READY') AND ep.starts_at >= now()
        ORDER BY ep.starts_at ASC LIMIT 6`,
    // "Requiere atención" comparte fuente con la campana: un reactivo vencido o
    // una autorización pendiente no viven en la tabla `alerts` y antes salían en
    // la campana pero no aquí, con el panel diciendo "nada pendiente".
    resolveAttentionItems(session),
    // Incidencias abiertas (manuales): indicador para el administrador. Si la
    // migración 0014 no está aplicada, la consulta falla y se reporta 0.
    isStudent ? Promise.resolve([{ open: 0, critical: 0 }]) : sql`
      SELECT COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','ARCHIVED')) AS open,
        COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED','CLOSED','ARCHIVED') AND severity IN ('HIGH','CRITICAL')) AS critical
      FROM incidents WHERE laboratory_id = ${labId}
    `.catch(() => [{ open: 0, critical: 0 }]),
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
    openIncidents: Number(incidents[0]?.open ?? 0),
    criticalIncidents: Number(incidents[0]?.critical ?? 0),
    upcomingPracticesList: practiceList as PracticeSummary[],
    attentionAlerts: alertList,
  };

  return NextResponse.json({ data, mode: "database" });
}
