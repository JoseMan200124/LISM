"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowUpRight,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Filter,
  FlaskConical,
  MoreHorizontal,
  RefreshCw,
  ShieldCheck,
  TestTube2,
  TriangleAlert,
  FileCog,
  GraduationCap,
  BookOpenCheck,
} from "lucide-react";
import { Toast, downloadCsv, useToast } from "@/components/action-kit";
import { alerts, overviewKpis, recentSpecimens, turnaroundBars, workflowStages } from "@/lib/demo-data";

const tatAreas = ["Todas las áreas", "Hematología", "Química", "Microbiología", "Molecular"];

export function DashboardView() {
  const router = useRouter();
  const [areaIndex, setAreaIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { message, showToast, clearToast } = useToast();

  function exportDashboard() {
    downloadCsv("nexalab-resumen-muestras.csv", recentSpecimens);
    showToast("Resumen operativo exportado en CSV.");
  }

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
          <p className="eyebrow">OPERACIÓN DEL DÍA</p>
          <h1>Resumen operativo</h1>
          <p>Supervisa el flujo del laboratorio y atiende primero lo que requiere acción.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button" onClick={exportDashboard}><Download size={15} /> Exportar</button>
          <button className="secondary-button icon-only" aria-label="Actualizar resumen" onClick={refresh}><RefreshCw className={refreshing ? "spin" : ""} size={15} /></button>
        </div>
      </header>

      <section className="kpi-grid">
        {overviewKpis.map((kpi, index) => {
          const Icon = [TestTube2, Clock3, TriangleAlert, ShieldCheck][index];
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

      <section className="content-grid content-grid-wide">
        <article className="panel workflow-panel">
          <div className="panel-header">
            <div><h2>Flujo de muestras</h2><p>Estado actual del proceso analítico.</p></div>
            <button className="text-button" onClick={() => router.push("/app/workbench")}>Ver mesa de trabajo <ChevronRight size={14} /></button>
          </div>
          <div className="workflow-grid">
            {workflowStages.map((stage, index) => (
              <div className="workflow-stage" key={stage.label}>
                <div className="workflow-stage-top"><span>{String(index + 1).padStart(2, "0")}</span>{index < workflowStages.length - 1 ? <i /> : null}</div>
                <strong>{stage.value}</strong><h3>{stage.label}</h3><p>{stage.hint}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel alerts-panel">
          <div className="panel-header">
            <div><h2>Requiere atención</h2><p>Alertas operativas activas.</p></div>
            <div className="relative-menu-wrap">
              <button className="icon-button" aria-label="Acciones de alertas" onClick={() => setMenuOpen((current) => !current)}><MoreHorizontal size={17} /></button>
              {menuOpen ? <div className="compact-popover"><button onClick={() => router.push("/app/alerts")}>Abrir centro de alertas</button><button onClick={() => { downloadCsv("nexalab-alertas.csv", alerts); setMenuOpen(false); showToast("Alertas exportadas."); }}>Exportar alertas</button></div> : null}
            </div>
          </div>
          <div className="alert-list">{alerts.map((alert) => <div className="alert-item" key={alert.title}><span className={`severity-dot severity-${alert.severity.toLowerCase()}`} /><div><strong>{alert.title}</strong><p>{alert.detail}</p><small>{alert.when}</small></div></div>)}</div>
          <button className="panel-footer-button" onClick={() => router.push("/app/alerts")}>Ver todas las alertas <ArrowUpRight size={14} /></button>
        </article>
      </section>

      <section className="content-grid content-grid-equal">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div><h2>Cumplimiento de TAT</h2><p>Resultados entregados dentro del SLA · últimos 7 días.</p></div>
            <button className="secondary-button tiny-button" onClick={() => setAreaIndex((current) => (current + 1) % tatAreas.length)}><Filter size={14} /> {tatAreas[areaIndex]}</button>
          </div>
          <div className="chart-summary"><strong>94.1%</strong><span><CheckCircle2 size={14} /> +2.4% frente a la semana anterior</span></div>
          <div className="bar-chart" aria-label={`Gráfico de cumplimiento de tiempo de respuesta para ${tatAreas[areaIndex]}`}>{turnaroundBars.map((bar) => <div className="bar-column" key={bar.day}><div className="bar-track"><div className="bar-value" style={{ height: `${bar.within}%` }} /></div><span>{bar.day}</span></div>)}</div>
        </article>

        <article className="panel activity-panel"><div className="panel-header"><div><h2>Indicadores rápidos</h2><p>Lectura ejecutiva del turno actual.</p></div></div><div className="metric-list"><div><span className="metric-mark"><FlaskConical size={16} /></span><p><strong>142</strong><small>resultados liberados hoy</small></p><em>+8%</em></div><div><span className="metric-mark"><CalendarClock size={16} /></span><p><strong>8</strong><small>validaciones prioritarias</small></p><em className="metric-warning">Atender</em></div><div><span className="metric-mark"><Boxes size={16} /></span><p><strong>3</strong><small>insumos cerca del mínimo</small></p><em className="metric-warning">Reponer</em></div></div></article>
      </section>

      <section className="dashboard-governance-grid">
        <Link href="/app/configuration" className="governance-card"><FileCog size={18} /><div><h2>Configuración adaptable</h2><p>Campos, alertas, perfiles y flujos sin cambios de código.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/compliance" className="governance-card"><ShieldCheck size={18} /><div><h2>Cumplimiento guiado</h2><p>Matriz simplificada de controles, evidencia y responsables.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/education" className="governance-card"><GraduationCap size={18} /><div><h2>Perfil educativo</h2><p>Prácticas, reservas y acceso seguro para estudiantes.</p></div><ChevronRight size={15} /></Link>
        <Link href="/app/logbooks" className="governance-card"><BookOpenCheck size={18} /><div><h2>Bitácoras electrónicas</h2><p>Registros sencillos con frecuencia, alertas y firma.</p></div><ChevronRight size={15} /></Link>
      </section>

      <article className="panel table-panel">
        <div className="panel-header"><div><h2>Muestras recientes</h2><p>Últimos accesos registrados durante el turno.</p></div><button className="text-button" onClick={() => router.push("/app/accessioning")}>Ver recepción <ChevronRight size={14} /></button></div>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Acceso</th><th>Paciente</th><th>Muestra</th><th>Pruebas</th><th>Prioridad</th><th>Estado</th><th>Recibida</th><th>TAT</th></tr></thead><tbody>{recentSpecimens.map((row) => <tr key={row.accession}><td><strong className="table-id">{row.accession}</strong></td><td>{row.patient}</td><td>{row.type}</td><td>{row.tests}</td><td><span className={`priority priority-${row.priority.toLowerCase()}`}>{row.priority}</span></td><td><span className="status-pill">{row.status}</span></td><td>{row.received}</td><td>{row.tat}</td></tr>)}</tbody></table></div>
      </article>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}
