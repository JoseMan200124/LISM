"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
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
  TriangleAlert,
} from "lucide-react";
import { Toast, useToast } from "@/components/action-kit";
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

const STATUS_REPORT_CLS: Record<string, string> = {
  Lista: "rpt-badge-success",
  Preparación: "rpt-badge-warning",
  Programada: "rpt-badge-info",
  Borrador: "rpt-badge-neutral",
  Ejecutada: "rpt-badge-neutral",
  Cancelada: "rpt-badge-danger",
};

const KPI_ACCENT = ["#216d66", "#b7782d", "#b5554d", "#4f806b"] as const;

function buildReportHtml(
  reportTitle: string,
  roleLabel: string,
  kpis: KpiItem[],
  practices: PracticeItem[],
  alerts: AlertItem[],
): string {
  const date = new Date().toLocaleDateString("es-GT", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const time = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });

  const kpiHtml = kpis.map((k, i) => `
    <div class="rpt-kpi" style="border-left-color:${KPI_ACCENT[i] ?? "#216d66"}">
      <div class="rpt-kpi-label">${k.label}</div>
      <strong class="rpt-kpi-value">${k.value}</strong>
      <em class="rpt-kpi-delta">${k.delta}</em>
    </div>`).join("");

  const practiceRows = practices.map(p => `
    <tr>
      <td><span class="rpt-code">${p.code}</span></td>
      <td>${p.title}</td>
      <td>${p.course}</td>
      <td>${p.teacher}</td>
      <td>${p.date}</td>
      <td><span class="${STATUS_REPORT_CLS[p.status] ?? "rpt-badge-neutral"}">${p.status}</span></td>
    </tr>`).join("");

  const alertHtml = alerts.map(a => `
    <div class="rpt-alert rpt-alert-${a.severity.toLowerCase()}">
      <span class="rpt-alert-dot"></span>
      <div>
        <p class="rpt-alert-title">${a.title}</p>
        <p class="rpt-alert-detail">${a.detail}</p>
        <p class="rpt-alert-meta">${a.severity} · ${a.when}</p>
      </div>
    </div>`).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>NexaLab — ${reportTitle}</title>
<style>
@page{margin:14mm 18mm;size:A4}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:11px;color:#1e3035;background:#fff;margin:0;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
.rpt-header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:16px;border-bottom:2.5px solid #216d66;margin-bottom:22px}
.rpt-logo{display:flex;align-items:center;gap:12px}
.rpt-logo-mark{width:44px;height:44px;border-radius:10px;background:#216d66;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;letter-spacing:-.5px;flex-shrink:0}
.rpt-logo-text strong{display:block;font-size:19px;font-weight:800;color:#216d66;letter-spacing:-.5px}
.rpt-logo-text span{display:block;font-size:8px;font-weight:700;color:#7f8e91;letter-spacing:1.1px;text-transform:uppercase;margin-top:2px}
.rpt-meta{text-align:right}
.rpt-meta h1{margin:0;font-size:14px;font-weight:700;color:#1e3035;letter-spacing:-.2px}
.rpt-meta p{margin:4px 0 0;font-size:10px;color:#7f8e91;line-height:1.5}
.rpt-role-badge{display:inline-block;margin-top:7px;padding:3px 10px;border-radius:12px;background:#e9f4f1;color:#216d66;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
.rpt-section{margin:22px 0 12px;display:flex;align-items:center;gap:8px}
.rpt-section::before{content:"";width:4px;height:16px;background:#216d66;border-radius:2px;flex-shrink:0}
.rpt-section span{font-size:9.5px;font-weight:800;color:#216d66;text-transform:uppercase;letter-spacing:.8px}
.rpt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px}
.rpt-kpi{padding:12px 14px;border:1px solid #e4ebe8;border-radius:8px;border-left:3px solid #216d66;background:#fbfcfb}
.rpt-kpi-label{font-size:9px;font-weight:700;color:#7f8e91;text-transform:uppercase;letter-spacing:.4px}
.rpt-kpi-value{display:block;margin-top:7px;font-size:24px;font-weight:800;color:#1e3035;letter-spacing:-.8px;line-height:1}
.rpt-kpi-delta{display:block;margin-top:5px;font-size:9px;font-style:normal;color:#216d66}
.rpt-table{width:100%;border-collapse:collapse;font-size:10.5px}
.rpt-table thead th{padding:7px 10px;background:#f1f6f4;border:1px solid #e4ebe8;font-size:9px;font-weight:800;color:#879497;text-align:left;text-transform:uppercase;letter-spacing:.5px}
.rpt-table tbody td{padding:9px 10px;border:1px solid #eaefee;color:#4e6368}
.rpt-table tbody tr:nth-child(even) td{background:#fafcfb}
.rpt-code{color:#216d66;font-weight:700;font-size:10px}
.rpt-badge-success{display:inline-block;padding:2px 8px;border-radius:10px;color:#3e715f;background:#eef6f2;font-size:9px;font-weight:700}
.rpt-badge-warning{display:inline-block;padding:2px 8px;border-radius:10px;color:#9c6827;background:#fbf4e8;font-size:9px;font-weight:700}
.rpt-badge-info{display:inline-block;padding:2px 8px;border-radius:10px;color:#52707a;background:#eef3f4;font-size:9px;font-weight:700}
.rpt-badge-neutral{display:inline-block;padding:2px 8px;border-radius:10px;color:#7d8e90;background:#f1f4f3;font-size:9px;font-weight:700}
.rpt-badge-danger{display:inline-block;padding:2px 8px;border-radius:10px;color:#943b35;background:#fbeee9;font-size:9px;font-weight:700}
.rpt-alerts{display:grid;gap:7px}
.rpt-alert{display:grid;grid-template-columns:8px 1fr;gap:10px;padding:10px 12px;border:1px solid #eaefee;border-radius:7px;align-items:start}
.rpt-alert-dot{width:8px;height:8px;border-radius:50%;margin-top:3px}
.rpt-alert-alta .rpt-alert-dot{background:#b5554d}
.rpt-alert-media .rpt-alert-dot{background:#b7782d}
.rpt-alert-baja .rpt-alert-dot{background:#4f806b}
.rpt-alert-title{font-size:11px;font-weight:700;color:#354b50;margin:0 0 3px}
.rpt-alert-detail{font-size:10px;color:#738386;margin:0}
.rpt-alert-meta{font-size:9px;color:#9ea9ab;margin:3px 0 0}
.rpt-footer{display:flex;align-items:center;justify-content:space-between;margin-top:30px;padding-top:12px;border-top:1px solid #e4ebe8}
.rpt-footer p{margin:0;font-size:9px;color:#9ea9ab}
.rpt-footer span{font-size:9px;font-weight:700;color:#b7c5c6}
@media print{body{padding:0}}
</style>
</head>
<body>
<div class="rpt-header">
  <div class="rpt-logo">
    <div class="rpt-logo-mark">NL</div>
    <div class="rpt-logo-text">
      <strong>NexaLab</strong>
      <span>Sistema de Información de Laboratorio</span>
    </div>
  </div>
  <div class="rpt-meta">
    <h1>${reportTitle}</h1>
    <p>${date} · ${time}</p>
    <p>Laboratorio Central</p>
    <div class="rpt-role-badge">${roleLabel}</div>
  </div>
</div>

<div class="rpt-section"><span>Indicadores clave</span></div>
<div class="rpt-kpis">${kpiHtml}</div>

<div class="rpt-section"><span>Prácticas programadas (${practices.length})</span></div>
<table class="rpt-table">
  <thead><tr>
    <th>Código</th><th>Práctica</th><th>Curso</th><th>Responsable</th><th>Fecha</th><th>Estado</th>
  </tr></thead>
  <tbody>${practiceRows}</tbody>
</table>

${alerts.length > 0 ? `
<div class="rpt-section"><span>Alertas activas (${alerts.length})</span></div>
<div class="rpt-alerts">${alertHtml}</div>` : ""}

<div class="rpt-footer">
  <p>NexaLab LIS · Reporte generado automáticamente · Información confidencial del laboratorio</p>
  <span>${date}</span>
</div>
<script>window.addEventListener("load",function(){window.focus();window.print();});</script>
</body>
</html>`;
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
  const { message, showToast, clearToast } = useToast();

  function refresh() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      showToast(`Resumen actualizado a las ${new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}.`);
    }, 450);
  }

  function handleExportPdf() {
    const html = buildReportHtml(
      "Reporte de resumen — Laboratorio educativo",
      "Administrador",
      adminKpis,
      upcomingPractices,
      adminAlerts,
    );
    const opened = openReportWindow(html);
    if (!opened) showToast("Activa las ventanas emergentes del navegador para generar el PDF.");
    else showToast("Generando PDF… usa «Guardar como PDF» en el diálogo de impresión.");
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
          <button className="primary-button" onClick={handleExportPdf}><FileDown size={15} /> Exportar PDF</button>
          <button className="secondary-button icon-only" aria-label="Actualizar" onClick={refresh}><RefreshCw className={refreshing ? "spin" : ""} size={15} /></button>
        </div>
      </header>

      <section className="kpi-grid">
        {adminKpis.map((kpi, index) => (
          <article className="kpi-card" key={kpi.label}>
            <div className={`kpi-icon kpi-icon-${kpi.tone}`}>
              {index === 0 ? <CalendarDays size={17} /> : index === 1 ? <PackageCheck size={17} /> : index === 2 ? <Boxes size={17} /> : <Microscope size={17} />}
            </div>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
          </article>
        ))}
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
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function ProfessorDashboard() {
  const router = useRouter();
  const { message, showToast, clearToast } = useToast();

  function handleExportPdf() {
    const html = buildReportHtml(
      "Reporte docente — Mis prácticas",
      "Docente",
      professorKpis,
      myPractices,
      [],
    );
    const opened = openReportWindow(html);
    if (!opened) showToast("Activa las ventanas emergentes del navegador para generar el PDF.");
    else showToast("Generando PDF… usa «Guardar como PDF» en el diálogo de impresión.");
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
          <button className="secondary-button" onClick={handleExportPdf}><FileDown size={15} /> Exportar PDF</button>
          <button className="primary-button" onClick={() => router.push("/app/education")}>
            <CalendarDays size={15} /> Nueva práctica
          </button>
        </div>
      </header>

      <section className="kpi-grid">
        {professorKpis.map((kpi, index) => (
          <article className="kpi-card" key={kpi.label}>
            <div className={`kpi-icon kpi-icon-${kpi.tone}`}>
              {index === 0 ? <CalendarDays size={17} /> : index === 1 ? <PackageCheck size={17} /> : index === 2 ? <TriangleAlert size={17} /> : <CheckCircle2 size={17} />}
            </div>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
          </article>
        ))}
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
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function StudentDashboard() {
  const router = useRouter();
  const { message, showToast, clearToast } = useToast();
  void showToast;

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
        {studentKpis.map((kpi, index) => (
          <article className="kpi-card" key={kpi.label}>
            <div className={`kpi-icon kpi-icon-${kpi.tone}`}>
              {index === 0 ? <CalendarDays size={17} /> : index === 1 ? <AlertTriangle size={17} /> : index === 2 ? <CheckCircle2 size={17} /> : <GraduationCap size={17} />}
            </div>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
          </article>
        ))}
      </section>

      <article className="panel">
        <div className="panel-header">
          <div><h2>Mi práctica más cercana</h2><p>Revisa instrucciones y recursos antes de llegar.</p></div>
          <button className="text-button" onClick={() => router.push("/app/education")}>Ver todas <ChevronRight size={14} /></button>
        </div>
        <PracticesTable rows={studentPractices} />
      </article>

      <article className="panel">
        <div className="panel-header">
          <div><h2>Avisos recientes</h2><p>Mensajes del laboratorio para tu grupo.</p></div>
          <button className="text-button" onClick={() => router.push("/app/alerts")}>Ver todos <ChevronRight size={14} /></button>
        </div>
        <div className="notification-cards">
          <div className="notification-card">
            <span className="notification-badge notification-badge-info">Recordatorio</span>
            <h3>Mañana tienes práctica de tinción de Gram</h3>
            <p>Revisa la guía antes de llegar al laboratorio. El equipo estará disponible desde las 09:45.</p>
            <small>Hoy · 14:00</small>
          </div>
          <div className="notification-card">
            <span className="notification-badge notification-badge-warning">Instrucción previa</span>
            <h3>Guía de preparación disponible</h3>
            <p>El docente publicó la guía de tinción de Gram. Descárgala antes de la clase.</p>
            <small>Hoy · 10:30</small>
          </div>
        </div>
      </article>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

export function EducationalDashboard({ role }: Readonly<{ role: Role }>) {
  if (role === "STUDENT") return <StudentDashboard />;
  if (role === "PROFESSOR") return <ProfessorDashboard />;
  return <AdminDashboard />;
}
