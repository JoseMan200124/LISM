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
  Download,
  FlaskConical,
  GraduationCap,
  Microscope,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Toast, downloadCsv, useToast } from "@/components/action-kit";
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
  "Lista": "status-pill-success",
  "Preparación": "status-pill-warning",
  "Programada": "status-pill-info",
  "Borrador": "status-pill-neutral",
  "Ejecutada": "status-pill-dark",
  "Cancelada": "status-pill-danger",
};

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

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">LABORATORIO EDUCATIVO</p>
          <h1>Resumen del laboratorio</h1>
          <p>Supervisa prácticas, inventario y equipos. Atiende primero lo que requiere acción.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={() => { downloadCsv("nexalab-resumen-educativo.csv", upcomingPractices); showToast("Resumen exportado."); }}><Download size={15} /> Exportar</button>
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

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">PERFIL DOCENTE</p>
          <h1>Mis prácticas y recursos</h1>
          <p>Consulta el estado de tus prácticas, reservas y recursos disponibles.</p>
        </div>
        <div className="header-actions">
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
