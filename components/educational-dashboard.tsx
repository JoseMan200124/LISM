"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileDown,
  FlaskConical,
  GraduationCap,
  MapPin,
  Microscope,
  PackageCheck,
  QrCode,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Toast, useToast } from "@/components/action-kit";
import { renderReportDocument, type ReportBranding } from "@/lib/report-template";
import type { UserSession } from "@/lib/session";

type Role = UserSession["role"];

type KpiItem = {
  label: string;
  value: string;
  delta: string;
  tone: "primary" | "sage" | "amber" | "rose";
};

type AlertItem = {
  title: string;
  detail: string;
  severity: "Alta" | "Media" | "Baja";
  when: string;
};

type PracticeItem = {
  code: string;
  title: string;
  course: string;
  teacher: string;
  date: string;
  status: string;
};

const adminKpis: KpiItem[] = [
  { label: "Prácticas próximas", value: "6", delta: "Esta semana", tone: "primary" },
  { label: "Reservas pendientes", value: "4", delta: "Por preparar", tone: "amber" },
  { label: "Inventario bajo mínimo", value: "2", delta: "Reponer urgente", tone: "rose" },
  { label: "Equipos operativos", value: "9/10", delta: "1 en mantenimiento", tone: "sage" },
];

const professorKpis: KpiItem[] = [
  { label: "Mis prácticas esta semana", value: "2", delta: "Próxima: mañana", tone: "primary" },
  { label: "Reservas pendientes", value: "3", delta: "Por confirmar", tone: "amber" },
  { label: "Recursos faltantes", value: "1", delta: "Verificar disponibilidad", tone: "rose" },
  { label: "Avisos enviados", value: "4", delta: "Esta semana", tone: "sage" },
];

const studentKpis: KpiItem[] = [
  { label: "Próxima práctica", value: "Mañana", delta: "10:00 h · Laboratorio A", tone: "primary" },
  { label: "Avisos sin leer", value: "2", delta: "Revisa antes de llegar", tone: "amber" },
  { label: "Instrucciones pendientes", value: "1", delta: "Guía disponible", tone: "sage" },
  { label: "Prácticas este período", value: "6", delta: "2 completadas", tone: "primary" },
];

const adminAlerts: AlertItem[] = [
  { title: "Ácido sulfúrico próximo a vencer", detail: "RQ-0003 · vence en 12 días · stock: 500 mL", severity: "Alta", when: "Hace 2 h" },
  { title: "Microscopio EQ-MIC-004 en mantenimiento", detail: "Fuera de servicio desde ayer", severity: "Media", when: "Ayer" },
  { title: "Reserva RES-2026-088 sin preparar", detail: "Práctica de tinción de Gram · mañana 09:30", severity: "Alta", when: "Hace 30 min" },
];

const upcomingPractices: PracticeItem[] = [
  { code: "PRA-2026-021", title: "Tinción de Gram", course: "Microbiología I", teacher: "Dra. Ana García", date: "Mañana · 10:00", status: "Lista" },
  { code: "PRA-2026-022", title: "Verificación de microscopio", course: "Laboratorio básico", teacher: "Prof. Luis Torres", date: "12/06 · 14:00", status: "Preparación" },
  { code: "PRA-2026-023", title: "Cultivo en placa", course: "Microbiología II", teacher: "Dra. Ana García", date: "14/06 · 09:00", status: "Programada" },
  { code: "PRA-2026-024", title: "Titulación ácido-base", course: "Química analítica", teacher: "Prof. Luis Torres", date: "16/06 · 11:00", status: "Borrador" },
];

const myPractices: PracticeItem[] = [
  { code: "PRA-2026-021", title: "Tinción de Gram", course: "Microbiología I", teacher: "Yo", date: "Mañana · 10:00", status: "Lista" },
  { code: "PRA-2026-022", title: "Verificación de microscopio", course: "Laboratorio básico", teacher: "Yo", date: "12/06 · 14:00", status: "Preparación" },
];

const studentPractices: PracticeItem[] = [
  { code: "PRA-2026-021", title: "Tinción de Gram", course: "Microbiología I · Sección B", teacher: "Dra. Ana García", date: "Mañana · 10:00", status: "Lista" },
];

const statusBadge: Record<string, string> = {
  Lista: "status-pill-success",
  Preparación: "status-pill-warning",
  Programada: "status-pill-info",
  Borrador: "status-pill-neutral",
  Ejecutada: "status-pill-dark",
  Cancelada: "status-pill-danger",
};

async function fetchReportBranding(): Promise<ReportBranding & { laboratoryName: string }> {
  try {
    const response = await fetch("/api/organization/branding");
    if (!response.ok) throw new Error("branding request failed");
    const payload = await response.json() as { data: ReportBranding & { laboratoryName: string } };
    return payload.data;
  } catch {
    // Fallback seguro: sin nombre de institución ni logo (el propio
    // renderReportDocument ya maneja logoDataUri vacío mostrando la marca
    // "NL" de respaldo) — nunca bloquea la generación del PDF.
    return { organizationName: null, logoDataUri: "", laboratoryName: "Laboratorio Central" };
  }
}

function buildReportHtml(
  reportTitle: string,
  roleLabel: string,
  branding: ReportBranding,
  laboratoryName: string,
  kpis: KpiItem[],
  practices: PracticeItem[],
  alerts: AlertItem[],
): string {
  return renderReportDocument({
    reportTitle,
    roleLabel,
    branding,
    laboratoryName,
    kpis: kpis.map((k) => ({ label: k.label, value: k.value, delta: k.delta })),
    tableSectionTitle: "Prácticas programadas",
    tableColumns: [
      { key: "code", label: "Código" },
      { key: "title", label: "Práctica" },
      { key: "course", label: "Curso" },
      { key: "teacher", label: "Responsable" },
      { key: "date", label: "Fecha" },
      { key: "status", label: "Estado" },
    ],
    tableRows: practices.map((p) => ({ code: p.code, title: p.title, course: p.course, teacher: p.teacher, date: p.date, status: p.status })),
    alerts: alerts.map((a) => ({ title: a.title, detail: a.detail, severity: a.severity, when: a.when })),
  });
}

function openReportWindow(html: string): boolean {
  const win = window.open("", "_blank", "width=960,height=750,scrollbars=yes");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  return true;
}

function PracticesTable({ rows }: Readonly<{ rows: PracticeItem[] }>) {
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Práctica</th>
            <th>Curso</th>
            <th>Responsable</th>
            <th>Fecha</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code}>
              <td><strong className="table-id">{row.code}</strong></td>
              <td>{row.title}</td>
              <td>{row.course}</td>
              <td>{row.teacher}</td>
              <td>{row.date}</td>
              <td><span className={`status-pill ${statusBadge[row.status] ?? ""}`}>{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminDashboard() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      showToast(`Resumen actualizado a las ${new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}.`);
    }, 450);
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const branding = await fetchReportBranding();
      const html = buildReportHtml(
        "Reporte de resumen — Laboratorio educativo",
        "Administrador",
        branding,
        branding.laboratoryName,
        adminKpis,
        upcomingPractices,
        adminAlerts,
      );
      const opened = openReportWindow(html);
      if (!opened) showError("Activa las ventanas emergentes del navegador para generar el PDF.");
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
          <button className="primary-button" data-tutorial="dashboard-export-pdf" onClick={() => void handleExportPdf()} disabled={exportingPdf}>
            {exportingPdf ? <RefreshCw size={15} className="spin" /> : <FileDown size={15} />} {exportingPdf ? "Generando…" : "Exportar PDF"}
          </button>
          <button className="secondary-button icon-only" aria-label="Actualizar" onClick={refresh}><RefreshCw className={refreshing ? "spin" : ""} size={15} /></button>
        </div>
      </header>

      <section className="kpi-grid">
        {adminKpis.map((kpi, index) => {
          const urgencyClass = index === 2 ? "kpi-card-urgent" : index === 1 ? "kpi-card-caution" : "";
          const Icon = [CalendarDays, PackageCheck, Boxes, Microscope][index];
          return (
            <article className={`kpi-card ${urgencyClass}`} key={kpi.label}>
              <div className="kpi-card-head">
                <div className={`kpi-icon kpi-icon-${kpi.tone}`}><Icon size={19} /></div>
              </div>
              <strong>{kpi.value}</strong>
              <span>{kpi.label}</span>
              <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
            </article>
          );
        })}
      </section>

      <section className="content-grid content-grid-wide">
        <article className="panel table-panel">
          <div className="panel-header">
            <div><h2>Próximas prácticas</h2><p>Cronograma de la semana y estado de preparación.</p></div>
            <button className="text-button" onClick={() => router.push("/app/education")}>Ver programa <ChevronRight size={14} /></button>
          </div>
          <PracticesTable rows={upcomingPractices} />
        </article>

        <article className="panel alerts-panel">
          <div className="panel-header">
            <div><h2>Requiere atención</h2><p>Alertas activas del laboratorio.</p></div>
          </div>
          <div className="alert-list">
            {adminAlerts.map((alert) => (
              <div className="alert-item" key={alert.title}>
                <span className={`severity-dot severity-${alert.severity.toLowerCase()}`} />
                <div><strong>{alert.title}</strong><p>{alert.detail}</p><small>{alert.when}</small></div>
              </div>
            ))}
          </div>
          <button className="panel-footer-button" onClick={() => router.push("/app/alerts")}>Ver todas las alertas <ArrowUpRight size={14} /></button>
        </article>
      </section>

      <section className="dashboard-governance-grid">
        <Link href="/app/inventory" className="governance-card"><Boxes size={18} /><div><h2>Inventario</h2><p>Reactivos, materiales, insumos y QR seguro.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/equipment" className="governance-card"><Microscope size={18} /><div><h2>Equipos</h2><p>Estado, mantenimiento, calibración y certificados.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/education" className="governance-card"><GraduationCap size={18} /><div><h2>Programa</h2><p>Prácticas, reservas y avisos para estudiantes.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/administration" className="governance-card"><ClipboardList size={18} /><div><h2>Usuarios</h2><p>Roles, permisos y accesos por laboratorio.</p></div><ChevronRight size={15} /></Link>
      </section>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ProfessorDashboard() {
  const router = useRouter();
  const [exportingPdf, setExportingPdf] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const branding = await fetchReportBranding();
      const html = buildReportHtml(
        "Reporte docente — Mis prácticas",
        "Docente",
        branding,
        branding.laboratoryName,
        professorKpis,
        myPractices,
        [],
      );
      const opened = openReportWindow(html);
      if (!opened) showError("Activa las ventanas emergentes del navegador para generar el PDF.");
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
          <p className="eyebrow">PERFIL DOCENTE</p>
          <h1>Mis prácticas y recursos</h1>
          <p>Consulta el estado de tus prácticas, reservas y recursos disponibles.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => void handleExportPdf()} disabled={exportingPdf}>
            {exportingPdf ? <RefreshCw size={15} className="spin" /> : <FileDown size={15} />} {exportingPdf ? "Generando…" : "Exportar PDF"}
          </button>
          <button className="primary-button" onClick={() => router.push("/app/education")}>
            <CalendarDays size={15} /> Nueva práctica
          </button>
        </div>
      </header>

      <section className="kpi-grid">
        {professorKpis.map((kpi, index) => {
          const Icon = [CalendarDays, PackageCheck, TriangleAlert, CheckCircle2][index];
          return (
            <article className="kpi-card" key={kpi.label}>
              <div className="kpi-card-head">
                <div className={`kpi-icon kpi-icon-${kpi.tone}`}><Icon size={19} /></div>
              </div>
              <strong>{kpi.value}</strong>
              <span>{kpi.label}</span>
              <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
            </article>
          );
        })}
      </section>

      <article className="panel table-panel">
        <div className="panel-header">
          <div><h2>Mis prácticas programadas</h2><p>Prácticas asignadas a tu cuenta esta semana.</p></div>
          <button className="text-button" onClick={() => router.push("/app/education")}>Ver todas <ChevronRight size={14} /></button>
        </div>
        <PracticesTable rows={myPractices} />
      </article>

      <section className="dashboard-governance-grid">
        <Link href="/app/education" className="governance-card"><CalendarDays size={18} /><div><h2>Programa</h2><p>Cronograma, reservas y avisos.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/inventory" className="governance-card"><FlaskConical size={18} /><div><h2>Inventario</h2><p>Consulta disponibilidad de reactivos y materiales.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/equipment" className="governance-card"><Microscope size={18} /><div><h2>Equipos</h2><p>Estado y disponibilidad de equipos.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/alerts" className="governance-card"><AlertTriangle size={18} /><div><h2>Alertas</h2><p>Avisos y notificaciones del laboratorio.</p></div><ChevronRight size={15} /></Link>
      </section>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

const studentNotifications = [
  {
    id: "n1",
    avatar: "AG",
    avatarTone: "notif-avatar-teal" as const,
    author: "Dra. Ana García",
    time: "Hoy · 14:00",
    title: "Mañana tienes práctica de tinción de Gram",
    body: "Revisa la guía antes de llegar. El equipo estará disponible desde las 09:45 h.",
    badge: "Recordatorio",
    badgeTone: "notification-badge-info",
    unread: true,
  },
  {
    id: "n2",
    avatar: "LT",
    avatarTone: "notif-avatar-amber" as const,
    author: "Prof. Luis Torres",
    time: "Hoy · 10:30",
    title: "Guía de preparación disponible",
    body: "El docente publicó la guía de tinción de Gram. Descárgala antes de la clase.",
    badge: "Instrucción previa",
    badgeTone: "notification-badge-warning",
    unread: true,
  },
];

function StudentDashboard() {
  const router = useRouter();
  const { message, toastType, clearToast } = useToast();

  const nextPractice = studentPractices[0];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">PERFIL ESTUDIANTE</p>
          <h1>Mi próxima práctica</h1>
          <p>Revisa los avisos y prepárate antes de llegar al laboratorio.</p>
        </div>
      </header>

      <section className="kpi-grid">
        {studentKpis.slice(0, 3).map((kpi, index) => {
          const urgencyClass = index === 1 ? "kpi-card-caution" : "";
          const Icon = [CalendarDays, AlertTriangle, GraduationCap][index];
          return (
            <article className={`kpi-card ${urgencyClass}`} key={kpi.label}>
              <div className="kpi-card-head">
                <div className={`kpi-icon kpi-icon-${kpi.tone}`}><Icon size={19} /></div>
              </div>
              <strong>{kpi.value}</strong>
              <span>{kpi.label}</span>
              <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
            </article>
          );
        })}
      </section>

      <article className="panel">
        <div className="panel-header">
          <div><h2>Próxima práctica</h2><p>Prepárate antes de llegar al laboratorio.</p></div>
          <button className="text-button" onClick={() => router.push("/app/education")}>Ver todas <ChevronRight size={14} /></button>
        </div>
        {nextPractice ? (
          <>
            <div className="practice-hero">
              <div className="practice-hero-icon"><FlaskConical size={26} /></div>
              <div>
                <h2>{nextPractice.title}</h2>
                <p>{nextPractice.course}</p>
                <div className="practice-hero-chips">
                  <span className="practice-chip"><CalendarDays size={13} />{nextPractice.date}</span>
                  <span className="practice-chip"><MapPin size={13} />Laboratorio A</span>
                  <span className="practice-chip"><Clock size={13} />Dra. {nextPractice.teacher.replace("Dra. ", "")}</span>
                  <span className={`status-pill ${statusBadge[nextPractice.status] ?? "status-pill-neutral"}`}>{nextPractice.status}</span>
                </div>
              </div>
            </div>
            <hr className="practice-divider" />
            <div className="practice-actions-bar">
              <button className="secondary-button" onClick={() => router.push("/app/education")}><BookOpenCheck size={15} /> Ver instrucciones</button>
              <button className="secondary-button" onClick={() => router.push("/app/resources")}><QrCode size={15} /> Escanear QR</button>
            </div>
          </>
        ) : (
          <div className="no-practice-banner">
            <CheckCircle2 size={30} />
            <div>
              <h2>Sin prácticas próximas</h2>
              <p>Cuando tu docente programe una práctica aparecerá aquí.</p>
            </div>
          </div>
        )}
      </article>

      <article className="panel">
        <div className="panel-header">
          <div><h2>Avisos recientes</h2><p>Mensajes de tu docente y del administrador.</p></div>
          <button className="text-button" onClick={() => router.push("/app/alerts")}>Ver todos <ChevronRight size={14} /></button>
        </div>
        <div className="notif-feed">
          {studentNotifications.map((n) => (
            <div key={n.id} className={`notif-item ${n.unread ? "notif-item-unread" : ""}`}>
              <div className={`notif-avatar ${n.avatarTone}`}>{n.avatar}</div>
              <div>
                <div className="notif-row-top">
                  <span className="notif-author">{n.author}</span>
                  <span className="notif-sep">·</span>
                  <span className="notif-time">{n.time}</span>
                  {n.unread ? <span className="notif-unread-dot" aria-label="No leído" /> : null}
                </div>
                <p className="notif-title">{n.title}</p>
                <p className="notif-body">{n.body}</p>
                <div className="notif-foot">
                  <span className={`notification-badge ${n.badgeTone}`}>{n.badge}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </article>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

export function EducationalDashboard({ role }: Readonly<{ role: Role }>) {
  if (role === "STUDENT") return <StudentDashboard />;
  if (role === "PROFESSOR") return <ProfessorDashboard />;
  return <AdminDashboard />;
}
