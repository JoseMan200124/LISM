"use client";

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
} from "lucide-react";
import {
  alerts,
  overviewKpis,
  recentSpecimens,
  turnaroundBars,
  workflowStages,
} from "@/lib/demo-data";

export function DashboardView() {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">MIÉRCOLES · 03 DE JUNIO</p>
          <h1>Resumen operativo</h1>
          <p>Supervisa el flujo del laboratorio y atiende primero lo que requiere acción.</p>
        </div>
        <div className="header-actions">
          <button className="secondary-button"><Download size={15} /> Exportar</button>
          <button className="secondary-button icon-only"><RefreshCw size={15} /></button>
        </div>
      </header>

      <section className="kpi-grid">
        {overviewKpis.map((kpi, index) => (
          <article className="kpi-card" key={kpi.label}>
            <div className={`kpi-icon kpi-icon-${kpi.tone}`}>
              {index === 0 ? <TestTube2 size={17} /> : index === 1 ? <Clock3 size={17} /> : index === 2 ? <TriangleAlert size={17} /> : <ShieldCheck size={17} />}
            </div>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
            <small className={`kpi-delta kpi-delta-${kpi.tone}`}>{kpi.delta}</small>
          </article>
        ))}
      </section>

      <section className="content-grid content-grid-wide">
        <article className="panel workflow-panel">
          <div className="panel-header">
            <div><h2>Flujo de muestras</h2><p>Estado actual del proceso analítico.</p></div>
            <button className="text-button">Ver mesa de trabajo <ChevronRight size={14} /></button>
          </div>
          <div className="workflow-grid">
            {workflowStages.map((stage, index) => (
              <div className="workflow-stage" key={stage.label}>
                <div className="workflow-stage-top">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {index < workflowStages.length - 1 ? <i /> : null}
                </div>
                <strong>{stage.value}</strong>
                <h3>{stage.label}</h3>
                <p>{stage.hint}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="panel alerts-panel">
          <div className="panel-header">
            <div><h2>Requiere atención</h2><p>Alertas operativas activas.</p></div>
            <button className="icon-button"><MoreHorizontal size={17} /></button>
          </div>
          <div className="alert-list">
            {alerts.map((alert) => (
              <div className="alert-item" key={alert.title}>
                <span className={`severity-dot severity-${alert.severity.toLowerCase()}`} />
                <div><strong>{alert.title}</strong><p>{alert.detail}</p><small>{alert.when}</small></div>
              </div>
            ))}
          </div>
          <button className="panel-footer-button">Ver todas las alertas <ArrowUpRight size={14} /></button>
        </article>
      </section>

      <section className="content-grid content-grid-equal">
        <article className="panel chart-panel">
          <div className="panel-header">
            <div><h2>Cumplimiento de TAT</h2><p>Resultados entregados dentro del SLA · últimos 7 días.</p></div>
            <button className="secondary-button tiny-button"><Filter size={14} /> Todas las áreas</button>
          </div>
          <div className="chart-summary"><strong>94.1%</strong><span><CheckCircle2 size={14} /> +2.4% frente a la semana anterior</span></div>
          <div className="bar-chart" aria-label="Gráfico de cumplimiento de tiempo de respuesta">
            {turnaroundBars.map((bar) => (
              <div className="bar-column" key={bar.day}>
                <div className="bar-track"><div className="bar-value" style={{ height: `${bar.within}%` }} /></div>
                <span>{bar.day}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="panel activity-panel">
          <div className="panel-header">
            <div><h2>Indicadores rápidos</h2><p>Lectura ejecutiva del turno actual.</p></div>
          </div>
          <div className="metric-list">
            <div><span className="metric-mark"><FlaskConical size={16} /></span><p><strong>142</strong><small>resultados liberados hoy</small></p><em>+8%</em></div>
            <div><span className="metric-mark"><CalendarClock size={16} /></span><p><strong>8</strong><small>validaciones prioritarias</small></p><em className="metric-warning">Atender</em></div>
            <div><span className="metric-mark"><Boxes size={16} /></span><p><strong>3</strong><small>insumos cerca del mínimo</small></p><em className="metric-warning">Reponer</em></div>
          </div>
        </article>
      </section>

      <article className="panel table-panel">
        <div className="panel-header">
          <div><h2>Muestras recientes</h2><p>Últimos accesos registrados durante el turno.</p></div>
          <button className="text-button">Ver recepción <ChevronRight size={14} /></button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Acceso</th><th>Paciente</th><th>Muestra</th><th>Pruebas</th><th>Prioridad</th><th>Estado</th><th>Recibida</th><th>TAT</th></tr></thead>
            <tbody>
              {recentSpecimens.map((row) => (
                <tr key={row.accession}>
                  <td><strong className="table-id">{row.accession}</strong></td>
                  <td>{row.patient}</td>
                  <td>{row.type}</td>
                  <td>{row.tests}</td>
                  <td><span className={`priority priority-${row.priority.toLowerCase()}`}>{row.priority}</span></td>
                  <td><span className="status-pill">{row.status}</span></td>
                  <td>{row.received}</td>
                  <td>{row.tat}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
