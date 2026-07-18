"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileDown,
  FlaskConical,
  GraduationCap,
  Microscope,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import { ErrorState, SkeletonKpiGrid, SkeletonTable } from "@/components/lims-ui";
import { Toast, useToast } from "@/components/action-kit";
import { renderReportDocument, type ReportBranding } from "@/lib/report-template";
import type { UserSession } from "@/lib/session";
import { sourceRecordHref } from "@/lib/deep-links";

type Role = UserSession["role"];

type PracticeSummary = { id: string; practice_code: string; title: string; course_name: string | null; teacher_name: string | null; starts_at: string; status: string };
type AlertSummary = { id: string; title: string; details: string | null; severity: string; status: string; source_type: string | null; source_id: string | null; created_at: string };
type DashboardData = {
  upcomingPractices: number; pendingReservations: number; lowStockItems: number; nearExpiryItems: number;
  maintenanceDueEquipment: number; recentQrScans: number; operationalEquipment: number; totalEquipment: number;
  openIncidents: number; criticalIncidents: number;
  upcomingPracticesList: PracticeSummary[]; attentionAlerts: AlertSummary[];
};

const PRACTICE_STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", PLANNED: "Planificada", PREPARING: "En preparación", READY: "Lista", EXECUTED: "Ejecutada", CLOSED: "Cerrada", CANCELLED: "Cancelada" };
const statusBadge: Record<string, string> = { Lista: "status-pill-success", "En preparación": "status-pill-warning", Planificada: "status-pill-info", Borrador: "status-pill-neutral", Ejecutada: "status-pill-dark", Cerrada: "status-pill-dark", Cancelada: "status-pill-danger" };

function fmtDate(value: unknown): string {
  if (!value) return "—";
  try { return new Date(String(value)).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return String(value); }
}
function severityLabel(sev: string): "Alta" | "Media" | "Baja" {
  if (sev === "CRITICAL" || sev === "HIGH") return "Alta";
  if (sev === "WARNING") return "Media";
  return "Baja";
}
// Ruta a la entidad origen de una alerta, para navegación cruzada (§4.5).
function alertSourceHref(alert: AlertSummary): string {
  return sourceRecordHref(alert.source_type, alert.source_id, alert.id) ?? "/app/alerts";
}

function useDashboardData() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/dashboard/educational");
      if (!res.ok) { setState("error"); return; }
      const payload = await res.json() as { data?: DashboardData };
      setData(payload.data ?? null);
      setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { data, state, reload: load };
}

async function fetchReportBranding(): Promise<ReportBranding & { laboratoryName: string }> {
  try {
    const response = await fetch("/api/organization/branding");
    if (!response.ok) throw new Error("branding request failed");
    const payload = await response.json() as { data: ReportBranding & { laboratoryName: string } };
    return payload.data;
  } catch {
    return { organizationName: null, logoDataUri: "", laboratoryName: "Laboratorio" };
  }
}

function openReportWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=960,height=750,scrollbars=yes");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

// ─── KPI card clicable ───────────────────────────────────────────────────────

function KpiCard({ href, value, label, delta, tone, Icon, urgency }: Readonly<{ href: string; value: string; label: string; delta: string; tone: string; Icon: typeof CalendarDays; urgency?: string }>) {
  return (
    <Link href={href} className={`kpi-card kpi-card-link ${urgency ?? ""}`}>
      <div className="kpi-card-head"><div className={`kpi-icon kpi-icon-${tone}`}><Icon size={19} /></div><ArrowUpRight size={15} className="kpi-card-go" /></div>
      <strong>{value}</strong>
      <span>{label}</span>
      <small className={`kpi-delta kpi-delta-${tone}`}>{delta}</small>
    </Link>
  );
}

function PracticesPanel({ practices, canCreate = false }: Readonly<{ practices: PracticeSummary[]; canCreate?: boolean }>) {
  return (
    <article className="panel table-panel">
      <div className="panel-header">
        <div><h2>Próximas prácticas</h2><p>Cronograma y estado de preparación.</p></div>
        <Link href="/app/education?tab=schedule" className="text-button">Ver programa <ChevronRight size={14} /></Link>
      </div>
      {practices.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><CalendarDays size={22} /></div><h3>No hay prácticas programadas.</h3><p>Crea una nueva práctica para comenzar a organizar fechas, recursos, equipos y estudiantes.</p>{canCreate ? <Link href="/app/education?tab=schedule&action=create" className="primary-button">Crear nueva práctica</Link> : null}</div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Código</th><th>Práctica</th><th>Curso</th><th>Responsable</th><th>Fecha</th><th>Estado</th></tr></thead>
            <tbody>
              {practices.map((p) => {
                const label = PRACTICE_STATUS_LABEL[p.status] ?? p.status;
                return (
                  <tr key={p.id}>
                    <td><strong className="table-id">{p.practice_code}</strong></td>
                    <td><Link className="text-button" href={`/app/education?tab=schedule&practiceId=${encodeURIComponent(p.id)}`}>{p.title}</Link></td>
                    <td>{p.course_name ?? "—"}</td>
                    <td>{p.teacher_name ?? "—"}</td>
                    <td>{fmtDate(p.starts_at)}</td>
                    <td><span className={`status-pill ${statusBadge[label] ?? "status-pill-neutral"}`}>{label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function AlertsPanel({ alerts }: Readonly<{ alerts: AlertSummary[] }>) {
  return (
    <article className="panel alerts-panel">
      <div className="panel-header"><div><h2>Requiere atención</h2><p>Alertas activas del laboratorio.</p></div></div>
      {alerts.length === 0 ? (
        <div className="empty-state"><div className="empty-icon"><CheckCircle2 size={22} /></div><h3>Nada pendiente por ahora</h3><p>No hay alertas activas en este momento.</p></div>
      ) : (
        <div className="alert-list">
          {alerts.map((a) => (
            <Link key={a.id} href={alertSourceHref(a)} className="alert-item alert-item-link">
              <span className={`severity-dot severity-${severityLabel(a.severity).toLowerCase()}`} />
              <div><strong>{a.title}</strong>{a.details ? <p>{a.details}</p> : null}<small>{fmtDate(a.created_at)}</small></div>
              <ChevronRight size={15} />
            </Link>
          ))}
        </div>
      )}
      <Link href="/app/alerts" className="panel-footer-button">Ver todas las alertas <ArrowUpRight size={14} /></Link>
    </article>
  );
}

// ─── Admin ───────────────────────────────────────────────────────────────────

function AdminDashboard() {
  const { data, state, reload } = useDashboardData();
  const [exportingPdf, setExportingPdf] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  async function handleExportPdf() {
    if (!data) return;
    setExportingPdf(true);
    try {
      const branding = await fetchReportBranding();
      const html = renderReportDocument({
        reportTitle: "Reporte de resumen — Laboratorio educativo",
        roleLabel: "Administrador",
        branding,
        laboratoryName: branding.laboratoryName,
        kpis: [
          { label: "Prácticas próximas", value: String(data.upcomingPractices), delta: "Planificadas" },
          { label: "Reservas pendientes", value: String(data.pendingReservations), delta: "Por preparar" },
          { label: "Inventario bajo mínimo", value: String(data.lowStockItems), delta: "Reponer" },
          { label: "Equipos operativos", value: `${data.operationalEquipment}/${data.totalEquipment}`, delta: `${data.maintenanceDueEquipment} en mantenimiento` },
        ],
        tableSectionTitle: "Próximas prácticas",
        tableColumns: [{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "teacher", label: "Responsable" }, { key: "date", label: "Fecha" }, { key: "status", label: "Estado" }],
        tableRows: data.upcomingPracticesList.map((p) => ({ code: p.practice_code, title: p.title, course: p.course_name ?? "—", teacher: p.teacher_name ?? "—", date: fmtDate(p.starts_at), status: PRACTICE_STATUS_LABEL[p.status] ?? p.status })),
        alerts: data.attentionAlerts.map((a) => ({ title: a.title, detail: a.details ?? "", severity: severityLabel(a.severity), when: fmtDate(a.created_at) })),
      });
      if (!openReportWindow(html)) showError("Activa las ventanas emergentes del navegador para generar el PDF.");
      else showToast("Generando PDF… usa «Guardar como PDF» en el diálogo de impresión.");
    } catch {
      showError("No se pudo generar el reporte. Intenta de nuevo.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">LABORATORIO EDUCATIVO</p>
          <h1>Resumen del laboratorio</h1>
          <p>Supervisa prácticas, inventario y equipos. Atiende primero lo que requiere acción.</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" data-tutorial="dashboard-export-pdf" onClick={() => void handleExportPdf()} disabled={exportingPdf || !data}>
            {exportingPdf ? <RefreshCw size={15} className="spin" /> : <FileDown size={15} />} {exportingPdf ? "Generando…" : "Exportar PDF"}
          </button>
          <button className="secondary-button icon-only" aria-label="Actualizar" onClick={() => void reload()}><RefreshCw size={15} /></button>
        </div>
      </header>

      {state === "loading" ? (<><SkeletonKpiGrid cols={4} /><SkeletonTable rows={4} cols={6} /></>) : null}
      {state === "error" ? <ErrorState description="No se pudo cargar el resumen. Verifica tu conexión e intenta de nuevo." onRetry={() => void reload()} /> : null}
      {state === "ready" && data ? (
        <>
          <section className="kpi-grid kpi-grid-5">
            <KpiCard href="/app/education?tab=schedule&filter=upcoming" value={String(data.upcomingPractices)} label="Prácticas próximas" delta="Planificadas" tone="primary" Icon={CalendarDays} />
            <KpiCard href="/app/education?tab=reservations&status=PENDING" value={String(data.pendingReservations)} label="Reservas pendientes" delta="Por preparar" tone="amber" Icon={PackageCheck} urgency={data.pendingReservations > 0 ? "kpi-card-caution" : ""} />
            <KpiCard href="/app/inventory?tab=lots&stock=low" value={String(data.lowStockItems)} label="Inventario bajo mínimo" delta={data.lowStockItems > 0 ? "Reponer" : "Sin alertas"} tone="rose" Icon={Boxes} urgency={data.lowStockItems > 0 ? "kpi-card-urgent" : ""} />
            <KpiCard href="/app/equipment?tab=equipment&status=OPERATIONAL" value={`${data.operationalEquipment}/${data.totalEquipment}`} label="Equipos operativos" delta={`${data.maintenanceDueEquipment} en mantenimiento`} tone="sage" Icon={Microscope} />
            <KpiCard href="/app/incidents" value={String(data.openIncidents)} label="Incidencias abiertas" delta={data.criticalIncidents > 0 ? `${data.criticalIncidents} críticas o altas` : data.openIncidents > 0 ? "En seguimiento" : "Sin incidencias"} tone="amber" Icon={AlertTriangle} urgency={data.criticalIncidents > 0 ? "kpi-card-urgent" : data.openIncidents > 0 ? "kpi-card-caution" : ""} />
          </section>

          <section className="content-grid content-grid-wide">
            <PracticesPanel practices={data.upcomingPracticesList} canCreate />
            <AlertsPanel alerts={data.attentionAlerts} />
          </section>

          <section className="dashboard-governance-grid">
            <Link href="/app/inventory" className="governance-card"><Boxes size={18} /><div><h2>Inventario</h2><p>Reactivos, materiales, insumos y QR seguro.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/equipment" className="governance-card"><Microscope size={18} /><div><h2>Equipos</h2><p>Estado, mantenimiento, calibración y certificados.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/education" className="governance-card"><GraduationCap size={18} /><div><h2>Programa</h2><p>Prácticas, reservas y avisos para estudiantes.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/administration" className="governance-card"><ClipboardList size={18} /><div><h2>Usuarios</h2><p>Roles, permisos y accesos por laboratorio.</p></div><ChevronRight size={15} /></Link>
          </section>
        </>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Profesor ────────────────────────────────────────────────────────────────

function ProfessorDashboard() {
  const { data, state, reload } = useDashboardData();
  const { message, toastType, clearToast } = useToast();
  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">PERFIL DOCENTE</p><h1>Mis prácticas y recursos</h1><p>Consulta el estado de tus prácticas, reservas y recursos disponibles.</p></div>
        <div className="header-actions"><Link href="/app/education" className="primary-button"><CalendarDays size={15} /> Nueva práctica</Link></div>
      </header>
      {state === "loading" ? (<><SkeletonKpiGrid cols={3} /><SkeletonTable rows={3} cols={6} /></>) : null}
      {state === "error" ? <ErrorState description="No se pudo cargar el resumen. Intenta de nuevo." onRetry={() => void reload()} /> : null}
      {state === "ready" && data ? (
        <>
          <section className="kpi-grid">
            <KpiCard href="/app/education?tab=schedule&filter=upcoming" value={String(data.upcomingPractices)} label="Prácticas próximas" delta="Planificadas" tone="primary" Icon={CalendarDays} />
            <KpiCard href="/app/education?tab=reservations&status=PENDING" value={String(data.pendingReservations)} label="Reservas pendientes" delta="Por confirmar" tone="amber" Icon={PackageCheck} />
            <KpiCard href="/app/inventory?tab=lots&stock=low" value={String(data.lowStockItems)} label="Inventario bajo mínimo" delta={data.lowStockItems > 0 ? "Revisar disponibilidad" : "Sin alertas"} tone="rose" Icon={Boxes} />
          </section>
          <PracticesPanel practices={data.upcomingPracticesList} canCreate />
          <section className="dashboard-governance-grid">
            <Link href="/app/education" className="governance-card"><CalendarDays size={18} /><div><h2>Programa</h2><p>Cronograma, reservas y avisos.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/inventory" className="governance-card"><FlaskConical size={18} /><div><h2>Inventario</h2><p>Consulta disponibilidad de reactivos y materiales.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/equipment" className="governance-card"><Microscope size={18} /><div><h2>Equipos</h2><p>Estado y disponibilidad de equipos.</p></div><ChevronRight size={15} /></Link>
            <Link href="/app/alerts" className="governance-card"><AlertTriangle size={18} /><div><h2>Alertas</h2><p>Avisos y notificaciones del laboratorio.</p></div><ChevronRight size={15} /></Link>
          </section>
        </>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Estudiante ──────────────────────────────────────────────────────────────

function StudentDashboard() {
  const { data, state, reload } = useDashboardData();
  const { message, toastType, clearToast } = useToast();
  const next = data?.upcomingPracticesList[0];
  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">PERFIL ESTUDIANTE</p><h1>Mi próxima práctica</h1><p>Revisa los avisos y prepárate antes de llegar al laboratorio.</p></div>
      </header>
      {state === "loading" ? <SkeletonKpiGrid cols={3} /> : null}
      {state === "error" ? <ErrorState description="No se pudo cargar tu información. Intenta de nuevo." onRetry={() => void reload()} /> : null}
      {state === "ready" && data ? (
        <>
          <section className="kpi-grid">
            <KpiCard href={next ? `/app/education?tab=schedule&practiceId=${encodeURIComponent(next.id)}` : "/app/education?tab=schedule"} value={next ? next.practice_code : "Ninguna"} label="Próxima práctica" delta={next ? fmtDate(next.starts_at) : "Sin prácticas próximas"} tone="primary" Icon={CalendarDays} />
            <KpiCard href="/app/education" value={String(data.upcomingPracticesList.length)} label="Prácticas próximas" delta="Este período" tone="sage" Icon={GraduationCap} />
            <KpiCard href="/app/education?tab=notices" value="Avisos" label="Avisos del docente" delta="Revisa antes de llegar" tone="amber" Icon={Bell} />
          </section>
          <article className="panel">
            <div className="panel-header"><div><h2>Próxima práctica</h2><p>Prepárate antes de llegar al laboratorio.</p></div><Link href="/app/education" className="text-button">Ver todas <ChevronRight size={14} /></Link></div>
            {next ? (
              <div className="practice-hero">
                <div className="practice-hero-icon"><FlaskConical size={26} /></div>
                <div>
                  <h2>{next.title}</h2>
                  <p>{next.course_name ?? "—"}</p>
                  <div className="practice-hero-chips">
                    <span className="practice-chip"><CalendarDays size={13} />{fmtDate(next.starts_at)}</span>
                    <span className={`status-pill ${statusBadge[PRACTICE_STATUS_LABEL[next.status] ?? ""] ?? "status-pill-neutral"}`}>{PRACTICE_STATUS_LABEL[next.status] ?? next.status}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="no-practice-banner"><CheckCircle2 size={30} /><div><h2>Sin prácticas próximas</h2><p>Cuando tu docente programe una práctica aparecerá aquí.</p></div></div>
            )}
          </article>
        </>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

export function EducationalDashboard({ role }: Readonly<{ role: Role }>) {
  if (role === "STUDENT") return <StudentDashboard />;
  if (role === "PROFESSOR") return <ProfessorDashboard />;
  return <AdminDashboard />;
}
