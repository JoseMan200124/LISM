"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileDown,
  FlaskConical,
  GitBranch,
  Microscope,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TestTube2,
  Upload,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/navigation";
import {
  auditRows,
  catalogRows,
  integrationRows,
  orderRows,
  patientRows,
  providerRows,
  recentSpecimens,
  reportCards,
  resultRows,
  workbenchRows,
} from "@/lib/demo-data";
import { AdministrationCenter } from "@/components/administration-center";
import { AuditCenter } from "@/components/audit-center";
import { AlertsCenter } from "@/components/alerts-center";
import { IncidentsCenter } from "@/components/incidents-center";
import { BillingCenter } from "@/components/billing-center";
import { ComplianceCenter } from "@/components/compliance-center";
import { ConfigurationCenter } from "@/components/configuration-center";
import { EducationCenter } from "@/components/education-center";
import { QualityCenter } from "@/components/quality-center";
import { EquipmentCenter, InventoryCenter } from "@/components/resources-center";
import { ActionModal, DetailsModal, QuickRecordModal, Toast, downloadCsv, useToast } from "@/components/action-kit";
import type { UserSession } from "@/lib/session";


type Row = Record<string, string | number>;
type ModuleConfig = {
  eyebrow: string;
  title: string;
  description: string;
  action: string;
  secondaryAction?: string;
  icon: LucideIcon;
  stats: Array<{ label: string; value: string; hint: string; icon: LucideIcon }>;
  columns?: Array<{ key: string; label: string }>;
  rows?: Row[];
  filters?: string[];
  hint?: string;
};

const moduleConfigs: Partial<Record<ModuleKey, ModuleConfig>> = {
  workbench: {
    eyebrow: "OPERACIÓN DIARIA", title: "Mesa de trabajo", description: "Organiza tareas por estación, prioridad y tiempo objetivo.", action: "Asignar tarea", icon: ClipboardCheck,
    stats: [
      { label: "Tareas abiertas", value: "47", hint: "11 nuevas", icon: ClipboardCheck },
      { label: "Prioritarias", value: "8", hint: "Requieren revisión", icon: AlertCircle },
      { label: "Carga crítica", value: "Química", hint: "83% de ocupación", icon: FlaskConical },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente" }, { key: "station", label: "Estación" }, { key: "task", label: "Tarea" }, { key: "assigned", label: "Responsable" }, { key: "priority", label: "Prioridad" }, { key: "due", label: "Objetivo" }, { key: "status", label: "Estado" }], rows: workbenchRows, filters: ["Todas las estaciones", "Todas las prioridades", "Turno actual"],
    hint: "El flujo puede adaptarse por tipo de laboratorio desde Configuración → Flujos.",
  },
  accessioning: {
    eyebrow: "PREANALÍTICA", title: "Recepción de muestras", description: "Registra, identifica y rastrea cada muestra desde su ingreso hasta su cierre.", action: "Registrar muestra", secondaryAction: "Importar lote", icon: TestTube2,
    stats: [
      { label: "Recibidas hoy", value: "184", hint: "+12 en la última hora", icon: TestTube2 },
      { label: "Pendientes de ingreso", value: "7", hint: "Desde referencias", icon: CalendarClock },
      { label: "Rechazadas", value: "2", hint: "Con motivo trazable", icon: AlertCircle },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente / origen" }, { key: "type", label: "Tipo de muestra" }, { key: "tests", label: "Pruebas" }, { key: "priority", label: "Prioridad" }, { key: "status", label: "Estado" }, { key: "received", label: "Recepción" }, { key: "tat", label: "TAT" }], rows: recentSpecimens, filters: ["Todos los estados", "Tipo de muestra", "Hoy"],
    hint: "Cada muestra recibe un número único, QR y cadena de custodia. Los campos opcionales pueden personalizarse.",
  },
  orders: {
    eyebrow: "PREANALÍTICA", title: "Órdenes", description: "Controla solicitudes, análisis asociados, responsables y prioridades.", action: "Crear orden", secondaryAction: "Importar", icon: ClipboardCheck,
    stats: [
      { label: "Órdenes hoy", value: "166", hint: "+9% vs. ayer", icon: ClipboardCheck },
      { label: "Urgentes", value: "14", hint: "8 en curso", icon: AlertCircle },
      { label: "Completadas", value: "142", hint: "94% dentro de SLA", icon: CheckCircle2 },
    ],
    columns: [{ key: "id", label: "Orden" }, { key: "patient", label: "Paciente / lote" }, { key: "provider", label: "Solicitante" }, { key: "tests", label: "Pruebas" }, { key: "priority", label: "Prioridad" }, { key: "created", label: "Creada" }, { key: "status", label: "Estado" }], rows: orderRows, filters: ["Todos los estados", "Todas las prioridades", "Hoy"],
    hint: "El perfil activo define si la orden está asociada a paciente, producto, lote, práctica o proyecto.",
  },
  results: {
    eyebrow: "POSTANALÍTICA", title: "Resultados", description: "Registra, revisa y libera resultados con especificaciones, firmas y trazabilidad.", action: "Validar selección", secondaryAction: "Exportar", icon: FileDown,
    stats: [
      { label: "Por validar", value: "26", hint: "8 prioritarios", icon: ClipboardCheck },
      { label: "Con banderas", value: "11", hint: "Revisión requerida", icon: AlertCircle },
      { label: "Liberados hoy", value: "142", hint: "+8% vs. ayer", icon: CheckCircle2 },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente / lote" }, { key: "test", label: "Prueba" }, { key: "value", label: "Resultado" }, { key: "flag", label: "Bandera" }, { key: "reviewer", label: "Revisor" }, { key: "status", label: "Estado" }], rows: resultRows, filters: ["Pendientes de validación", "Todas las áreas", "Todas las banderas"],
    hint: "Un resultado fuera de especificación conserva el dato original y puede abrir automáticamente una investigación OOS.",
  },
  patients: {
    eyebrow: "PERFIL CLÍNICO", title: "Pacientes", description: "Mantén perfiles únicos y evita duplicados cuando el laboratorio utiliza el perfil clínico.", action: "Nuevo paciente", secondaryAction: "Detectar duplicados", icon: UsersRound,
    stats: [
      { label: "Pacientes activos", value: "2,481", hint: "+42 este mes", icon: UsersRound },
      { label: "Nuevos hoy", value: "18", hint: "3 desde referencias", icon: UserRoundCheck },
      { label: "Posibles duplicados", value: "4", hint: "Requieren revisión", icon: AlertCircle },
    ],
    columns: [{ key: "id", label: "Paciente" }, { key: "name", label: "Nombre" }, { key: "document", label: "Documento" }, { key: "birth", label: "Fecha de nacimiento" }, { key: "sex", label: "Sexo" }, { key: "lastOrder", label: "Última orden" }, { key: "activeOrders", label: "Órdenes activas" }], rows: patientRows, filters: ["Todos", "Con órdenes activas", "Nuevos este mes"],
    hint: "Este módulo puede ocultarse por completo en laboratorios universitarios, industriales o farmacéuticos.",
  },
  providers: {
    eyebrow: "DATOS DE REFERENCIA", title: "Solicitantes", description: "Gestiona médicos, instituciones, clientes y canales seguros de entrega.", action: "Nuevo solicitante", icon: UserRoundCheck,
    stats: [
      { label: "Solicitantes activos", value: "86", hint: "12 instituciones", icon: UserRoundCheck },
      { label: "Con integración", value: "8", hint: "HL7 o portal", icon: GitBranch },
      { label: "Órdenes hoy", value: "166", hint: "Desde 21 solicitantes", icon: ClipboardCheck },
    ],
    columns: [{ key: "code", label: "Código" }, { key: "name", label: "Solicitante" }, { key: "type", label: "Tipo" }, { key: "institution", label: "Institución" }, { key: "channel", label: "Canal" }, { key: "lastOrder", label: "Última orden" }], rows: providerRows, filters: ["Todos los tipos", "Todos los canales"],
  },
  catalog: {
    eyebrow: "DATOS MAESTROS", title: "Catálogo de métodos y pruebas", description: "Estandariza ensayos, muestras, unidades, especificaciones, métodos y versiones.", action: "Nueva prueba", secondaryAction: "Importar catálogo", icon: FlaskConical,
    stats: [
      { label: "Pruebas activas", value: "124", hint: "14 perfiles", icon: FlaskConical },
      { label: "Versiones vigentes", value: "118", hint: "6 requieren revisión", icon: ShieldCheck },
      { label: "Áreas analíticas", value: "7", hint: "Configuradas", icon: Microscope },
    ],
    columns: [{ key: "code", label: "Código" }, { key: "name", label: "Prueba" }, { key: "section", label: "Área" }, { key: "specimen", label: "Muestra" }, { key: "tat", label: "TAT objetivo" }, { key: "loinc", label: "Referencia" }, { key: "active", label: "Activa" }], rows: catalogRows, filters: ["Todas las áreas", "Pruebas activas", "Vigencia"],
    hint: "Cada resultado conserva la versión exacta del método y de la especificación utilizada.",
  },
  integrations: {
    eyebrow: "INTEROPERABILIDAD", title: "Integraciones", description: "Conecta analizadores, HIS y entregas externas de forma controlada.", action: "Nueva integración", secondaryAction: "Ver bitácora", icon: GitBranch,
    stats: [
      { label: "Integraciones activas", value: "4", hint: "Sin errores críticos", icon: GitBranch },
      { label: "Mensajes hoy", value: "1,286", hint: "99.7% procesados", icon: CheckCircle2 },
      { label: "Pendientes de revisión", value: "2", hint: "Reintentos automáticos", icon: AlertCircle },
    ],
    columns: [{ key: "name", label: "Integración" }, { key: "type", label: "Tipo" }, { key: "standard", label: "Estándar / canal" }, { key: "status", label: "Estado" }, { key: "lastSync", label: "Última sincronización" }], rows: integrationRows, filters: ["Todos los tipos", "Todos los estados"],
    hint: "Cada adaptador debe validarse por separado antes de utilizarse en una operación regulada.",
  },
  audit: {
    eyebrow: "TRAZABILIDAD INMUTABLE", title: "Bitácora", description: "Consulta acciones, responsables, valor anterior, valor nuevo, motivo y momento exacto.", action: "Exportar bitácora", icon: ShieldCheck,
    stats: [
      { label: "Eventos hoy", value: "1,904", hint: "Solo anexado", icon: ShieldCheck },
      { label: "Acciones críticas", value: "146", hint: "Firmas y cambios", icon: ClipboardCheck },
      { label: "Intentos bloqueados", value: "0", hint: "Sin incidencias", icon: CheckCircle2 },
    ],
    columns: [{ key: "actor", label: "Usuario" }, { key: "action", label: "Acción" }, { key: "object", label: "Registro" }, { key: "change", label: "Cambio" }, { key: "reason", label: "Motivo" }, { key: "origin", label: "Origen" }, { key: "when", label: "Hora" }], rows: auditRows, filters: ["Todos los usuarios", "Todas las acciones", "Hoy"],
    hint: "La migración 0004 protege el audit trail contra actualizaciones y eliminaciones directas.",
  },
};

function displayCell(key: string, value: string | number) {
  const normalized = String(value);
  if (["status", "severity", "flag", "active"].includes(key)) return <span className="status-pill">{normalized}</span>;
  if (key === "priority") return <span className={`priority priority-${normalized.toLowerCase()}`}>{normalized}</span>;
  if (["id", "code", "sku", "accession"].includes(key)) return <strong className="table-id">{normalized}</strong>;
  return normalized;
}

export function ModuleView({ module, session }: { module: Exclude<ModuleKey, "dashboard">; session?: UserSession }) {
  const role = session?.role;
  if (module === "inventory") return <InventoryCenter />;
  if (module === "equipment") return <EquipmentCenter />;
  if (module === "education") return <EducationCenter role={role as Parameters<typeof EducationCenter>[0]["role"]} />;
  if (module === "quality") return <QualityCenter />;
  if (module === "documents") return <QualityCenter initialTab="documents" />;
  if (module === "logbooks") return <QualityCenter initialTab="logbooks" />;
  if (module === "training") return <QualityCenter initialTab="training" />;
  if (module === "alerts") return <AlertsCenter role={role as Parameters<typeof AlertsCenter>[0]["role"]} />;
  if (module === "incidents") return <IncidentsCenter role={role as Parameters<typeof IncidentsCenter>[0]["role"]} />;
  if (module === "audit") return <AuditCenter session={session} />;
  if (module === "compliance") return <ComplianceCenter />;
  if (module === "configuration") return <ConfigurationCenter session={session} />;
  if (module === "administration") return <AdministrationCenter />;
  if (module === "billing") return <BillingCenter />;
  if (module === "reports") return <ReportsView />;
  return <GenericModule module={module} />;
}

function GenericModule({ module }: { module: Exclude<ModuleKey, "dashboard"> }) {
  const config = moduleConfigs[module]!;
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Row[]>(() => config?.rows ?? []);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const { message, showToast, clearToast } = useToast();
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(needle)));
  }, [query, rows]);

  if (!config) return null;
  const MainIcon = config.icon;

  function exportRows() {
    downloadCsv(`nexalab-${module}.csv`, filteredRows);
    showToast(`${config.title}: archivo CSV generado.`);
  }

  function runPrimary() {
    if (config.action.toLowerCase().includes("exportar")) {
      exportRows();
      return;
    }
    if (config.action.toLowerCase().includes("validar")) {
      showToast("Selección validada. Los cambios quedan listos para firma y auditoría.");
      return;
    }
    setNewOpen(true);
  }

  function runSecondary() {
    if (config.secondaryAction?.toLowerCase().includes("exportar")) {
      exportRows();
      return;
    }
    showToast(`${config.secondaryAction ?? "Acción"}: asistente abierto en modo demostración.`);
  }

  function addRecord(record: { name: string; detail: string; status: string }) {
    const next: Row = {};
    for (const [index, column] of (config.columns ?? []).entries()) {
      if (["id", "code", "accession", "sku"].includes(column.key)) next[column.key] = `${module.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}`;
      else if (["status", "active"].includes(column.key)) next[column.key] = record.status;
      else if (index === 0 || ["name", "patient", "task"].includes(column.key)) next[column.key] = record.name;
      else if (index === 1 || ["detail", "change"].includes(column.key)) next[column.key] = record.detail;
      else next[column.key] = "Pendiente";
    }
    setRows((current) => [next, ...current]);
    showToast(`${config.title}: registro creado.`);
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div>
        <div className="header-actions">
          {config.secondaryAction ? <button className="secondary-button" onClick={runSecondary}><Upload size={15} /> {config.secondaryAction}</button> : null}
          <button className="primary-button" onClick={runPrimary}><Plus size={15} /> {config.action}</button>
        </div>
      </header>
      <section className="module-stat-grid">
        {config.stats.map((stat) => { const Icon = stat.icon; return <article className="module-stat" key={stat.label}><span><Icon size={17} /></span><div><p>{stat.label}</p><strong>{stat.value}</strong><small>{stat.hint}</small></div></article>; })}
      </section>
      <article className="panel table-panel module-table-panel">
        <div className="table-toolbar">
          <label className="table-search"><Search size={15} /><input placeholder={`Buscar en ${config.title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="filter-row">
            {config.filters?.map((filter) => <button className="filter-button" key={filter} onClick={() => showToast(`Filtro “${filter}” disponible para configurar.`)}>{filter}<ChevronDown size={13} /></button>)}
            <button className="filter-button square-filter" aria-label="Más filtros" onClick={() => showToast("Panel de filtros avanzados disponible.")}><SlidersHorizontal size={14} /></button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>{config.columns?.map((column) => <th key={column.key}>{column.label}</th>)}<th /></tr></thead>
            <tbody>
              {filteredRows.map((row, index) => <tr key={`${module}-${index}`}>{config.columns?.map((column) => <td key={column.key}>{displayCell(column.key, row[column.key])}</td>)}<td><button className="icon-button table-action" aria-label="Ver detalle" onClick={() => setSelectedRow(row)}><MoreHorizontal size={16} /></button></td></tr>)}
            </tbody>
          </table>
        </div>
        <footer className="table-footer"><span>Mostrando {filteredRows.length} registros</span><div><button disabled>Anterior</button><strong>1</strong><button disabled>Siguiente</button></div></footer>
      </article>
      <div className="module-hint"><MainIcon size={16} /><span>{config.hint ?? "Vista inicial demostrativa. Conecta Neon para persistir registros reales y habilitar permisos por laboratorio."}</span></div>
      <QuickRecordModal open={newOpen} title={config.action} description={`Crea un registro inicial en ${config.title.toLowerCase()}.`} onClose={() => setNewOpen(false)} onSave={addRecord} />
      <DetailsModal open={Boolean(selectedRow)} title={`Detalle · ${config.title}`} row={selectedRow} onClose={() => setSelectedRow(null)} />
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function ReportsView() {
  const reportIcons = [CalendarClock, BarChart3, ShieldCheck, FlaskConical, GitBranch, UserRoundCheck];
  const [newOpen, setNewOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<(typeof reportCards)[number] | null>(null);
  const [extraReports, setExtraReports] = useState<Array<{ title: string; detail: string; badge: string }>>([]);
  const { message, showToast, clearToast } = useToast();
  const reports = [...reportCards, ...extraReports];

  function exportReport(report: (typeof reports)[number]) {
    downloadCsv(`nexalab-${report.title.toLowerCase().replace(/\s+/g, "-")}.csv`, [{ reporte: report.title, detalle: report.detail, categoria: report.badge, generado: new Date().toLocaleString("es-GT") }]);
    showToast(`Reporte “${report.title}” exportado.`);
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">ANÁLISIS Y DISTRIBUCIÓN</p><h1>Reportes</h1><p>Convierte la operación, la calidad y la evidencia en información útil y exportable.</p></div>
        <div className="header-actions"><button className="secondary-button" onClick={() => setScheduleOpen(true)}><Upload size={15} /> Programaciones</button><button className="primary-button" onClick={() => setNewOpen(true)}><Plus size={15} /> Nuevo reporte</button></div>
      </header>
      <section className="module-stat-grid">
        <article className="module-stat"><span><BarChart3 size={17} /></span><div><p>Reportes disponibles</p><strong>{14 + extraReports.length}</strong><small>Incluye auditoría y calidad</small></div></article>
        <article className="module-stat"><span><Download size={17} /></span><div><p>Exportaciones este mes</p><strong>184</strong><small>PDF, CSV y XLSX</small></div></article>
        <article className="module-stat"><span><CalendarClock size={17} /></span><div><p>Programados</p><strong>4</strong><small>Próxima ejecución 18:00</small></div></article>
      </section>
      <section className="report-grid">
        {reports.map((report, index) => { const ReportIcon = reportIcons[index] ?? BarChart3; return <article className="report-card" key={`${report.title}-${index}`}><div><span>{report.badge}</span><ReportIcon size={18} strokeWidth={1.8} /></div><h2>{report.title}</h2><p>{report.detail}</p><button onClick={() => setSelectedReport(report)}>Abrir reporte <ArrowUpRight size={14} /></button></article>; })}
      </section>
      <article className="panel report-schedule-panel"><div><PackageCheck size={18} /><p><strong>Entrega automatizada</strong><span>Configura reportes periódicos para responsables, instituciones o entidades autorizadas.</span></p></div><button className="secondary-button" onClick={() => setScheduleOpen(true)}>Administrar programaciones</button></article>
      <QuickRecordModal open={newOpen} title="Nuevo reporte" description="Crea una plantilla inicial para personalizar filtros, periodicidad y destinatarios." onClose={() => setNewOpen(false)} onSave={(record) => { setExtraReports((current) => [{ title: record.name, detail: record.detail, badge: record.status }, ...current]); showToast("Plantilla de reporte creada."); }} />
      <ActionModal open={scheduleOpen} title="Programaciones de reportes" description="Las entregas automáticas quedan asociadas a un responsable y un calendario." onClose={() => setScheduleOpen(false)}><div className="modal-form"><div className="details-grid"><div><small>Diario de inventario</small><strong>18:00 · Jefatura</strong></div><div><small>Resumen de calibraciones</small><strong>Lunes · 08:00</strong></div><div><small>Auditoría operativa</small><strong>Mensual · Calidad</strong></div></div><footer className="modal-actions"><button className="primary-button" onClick={() => { setScheduleOpen(false); showToast("Programaciones revisadas."); }}>Cerrar</button></footer></div></ActionModal>
      <ActionModal open={Boolean(selectedReport)} title={selectedReport?.title ?? "Reporte"} description={selectedReport?.detail} onClose={() => setSelectedReport(null)}><div className="modal-form"><p>La vista previa está lista. Genera el archivo para compartir los datos autorizados.</p><footer className="modal-actions"><button className="secondary-button" onClick={() => setSelectedReport(null)}>Cerrar</button><button className="primary-button" onClick={() => { if (selectedReport) exportReport(selectedReport); setSelectedReport(null); }}><Download size={15} /> Exportar CSV</button></footer></div></ActionModal>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}
