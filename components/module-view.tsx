"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Download,
  FileDown,
  Filter,
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
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ModuleKey } from "@/lib/navigation";
import {
  auditRows,
  catalogRows,
  equipmentRows,
  incidentRows,
  integrationRows,
  inventoryRows,
  orderRows,
  patientRows,
  providerRows,
  qualityRows,
  recentSpecimens,
  reportCards,
  resultRows,
  usersRows,
  workbenchRows,
} from "@/lib/demo-data";

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
};

const moduleConfigs: Record<Exclude<ModuleKey, "dashboard" | "reports">, ModuleConfig> = {
  workbench: {
    eyebrow: "OPERACIÓN DIARIA", title: "Mesa de trabajo", description: "Organiza tareas por estación, prioridad y tiempo objetivo.", action: "Asignar tarea", icon: ClipboardCheck,
    stats: [
      { label: "Tareas abiertas", value: "47", hint: "11 nuevas", icon: ClipboardCheck },
      { label: "Prioritarias", value: "8", hint: "Requieren revisión", icon: AlertCircle },
      { label: "Carga crítica", value: "Química", hint: "83% de ocupación", icon: FlaskConical },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente" }, { key: "station", label: "Estación" }, { key: "task", label: "Tarea" }, { key: "assigned", label: "Responsable" }, { key: "priority", label: "Prioridad" }, { key: "due", label: "Objetivo" }, { key: "status", label: "Estado" }], rows: workbenchRows, filters: ["Todas las estaciones", "Todas las prioridades", "Turno actual"],
  },
  accessioning: {
    eyebrow: "PRE-ANALÍTICA", title: "Recepción de muestras", description: "Registra, identifica y rastrea cada muestra desde su ingreso.", action: "Registrar muestra", secondaryAction: "Importar lote", icon: TestTube2,
    stats: [
      { label: "Recibidas hoy", value: "184", hint: "+12 en la última hora", icon: TestTube2 },
      { label: "Pendientes de ingreso", value: "7", hint: "Desde referencias", icon: CalendarClock },
      { label: "Rechazadas", value: "2", hint: "1.1% del total", icon: AlertCircle },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente" }, { key: "type", label: "Tipo de muestra" }, { key: "tests", label: "Pruebas" }, { key: "priority", label: "Prioridad" }, { key: "status", label: "Estado" }, { key: "received", label: "Recepción" }, { key: "tat", label: "TAT" }], rows: recentSpecimens, filters: ["Todos los estados", "Tipo de muestra", "Hoy"],
  },
  orders: {
    eyebrow: "PRE-ANALÍTICA", title: "Órdenes", description: "Controla solicitudes, pruebas asociadas y prioridades clínicas.", action: "Crear orden", secondaryAction: "Importar", icon: ClipboardCheck,
    stats: [
      { label: "Órdenes hoy", value: "166", hint: "+9% vs. ayer", icon: ClipboardCheck },
      { label: "Urgentes", value: "14", hint: "8 en curso", icon: AlertCircle },
      { label: "Completadas", value: "142", hint: "94% dentro de SLA", icon: CheckCircle2 },
    ],
    columns: [{ key: "id", label: "Orden" }, { key: "patient", label: "Paciente" }, { key: "provider", label: "Solicitante" }, { key: "tests", label: "Pruebas" }, { key: "priority", label: "Prioridad" }, { key: "created", label: "Creada" }, { key: "status", label: "Estado" }], rows: orderRows, filters: ["Todos los estados", "Todas las prioridades", "Hoy"],
  },
  results: {
    eyebrow: "POST-ANALÍTICA", title: "Resultados", description: "Revisa, valida y libera resultados con trazabilidad completa.", action: "Validar selección", secondaryAction: "Exportar", icon: FileDown,
    stats: [
      { label: "Por validar", value: "26", hint: "8 prioritarios", icon: ClipboardCheck },
      { label: "Con banderas", value: "11", hint: "Revisión clínica", icon: AlertCircle },
      { label: "Liberados hoy", value: "142", hint: "+8% vs. ayer", icon: CheckCircle2 },
    ],
    columns: [{ key: "accession", label: "Acceso" }, { key: "patient", label: "Paciente" }, { key: "test", label: "Prueba" }, { key: "value", label: "Resultado" }, { key: "flag", label: "Bandera" }, { key: "reviewer", label: "Revisor" }, { key: "status", label: "Estado" }], rows: resultRows, filters: ["Pendientes de validación", "Todas las áreas", "Todas las banderas"],
  },
  patients: {
    eyebrow: "DATOS DE REFERENCIA", title: "Pacientes", description: "Mantén perfiles únicos y evita duplicados en cada registro.", action: "Nuevo paciente", secondaryAction: "Detectar duplicados", icon: UsersRound,
    stats: [
      { label: "Pacientes activos", value: "2,481", hint: "+42 este mes", icon: UsersRound },
      { label: "Nuevos hoy", value: "18", hint: "3 desde referencias", icon: UserRoundCheck },
      { label: "Posibles duplicados", value: "4", hint: "Requieren revisión", icon: AlertCircle },
    ],
    columns: [{ key: "id", label: "Paciente" }, { key: "name", label: "Nombre" }, { key: "document", label: "Documento" }, { key: "birth", label: "Fecha de nacimiento" }, { key: "sex", label: "Sexo" }, { key: "lastOrder", label: "Última orden" }, { key: "activeOrders", label: "Órdenes activas" }], rows: patientRows, filters: ["Todos", "Con órdenes activas", "Nuevos este mes"],
  },
  providers: {
    eyebrow: "DATOS DE REFERENCIA", title: "Solicitantes", description: "Gestiona médicos, instituciones y canales seguros de entrega.", action: "Nuevo solicitante", icon: UserRoundCheck,
    stats: [
      { label: "Solicitantes activos", value: "86", hint: "12 instituciones", icon: UserRoundCheck },
      { label: "Con integración", value: "8", hint: "HL7 o portal", icon: GitBranch },
      { label: "Órdenes hoy", value: "166", hint: "Desde 21 solicitantes", icon: ClipboardCheck },
    ],
    columns: [{ key: "code", label: "Código" }, { key: "name", label: "Solicitante" }, { key: "type", label: "Tipo" }, { key: "institution", label: "Institución" }, { key: "channel", label: "Canal" }, { key: "lastOrder", label: "Última orden" }], rows: providerRows, filters: ["Todos los tipos", "Todos los canales"],
  },
  catalog: {
    eyebrow: "DATOS MAESTROS", title: "Catálogo de pruebas", description: "Estandariza pruebas, muestras, códigos y tiempos objetivo.", action: "Nueva prueba", secondaryAction: "Importar catálogo", icon: FlaskConical,
    stats: [
      { label: "Pruebas activas", value: "124", hint: "14 perfiles", icon: FlaskConical },
      { label: "Con código LOINC", value: "92%", hint: "10 por completar", icon: ShieldCheck },
      { label: "Áreas analíticas", value: "7", hint: "Configuradas", icon: Microscope },
    ],
    columns: [{ key: "code", label: "Código" }, { key: "name", label: "Prueba" }, { key: "section", label: "Área" }, { key: "specimen", label: "Muestra" }, { key: "tat", label: "TAT objetivo" }, { key: "loinc", label: "LOINC" }, { key: "active", label: "Activa" }], rows: catalogRows, filters: ["Todas las áreas", "Pruebas activas", "Con LOINC"],
  },
  inventory: {
    eyebrow: "RECURSOS", title: "Inventario", description: "Controla reactivos, consumibles, lotes, ubicaciones y vencimientos.", action: "Nuevo artículo", secondaryAction: "Registrar consumo", icon: Boxes,
    stats: [
      { label: "Artículos activos", value: "438", hint: "12 ubicaciones", icon: Boxes },
      { label: "Por reponer", value: "3", hint: "1 crítico", icon: AlertCircle },
      { label: "Próximos a vencer", value: "8", hint: "En 30 días", icon: CalendarClock },
    ],
    columns: [{ key: "sku", label: "Código" }, { key: "name", label: "Artículo" }, { key: "category", label: "Categoría" }, { key: "lot", label: "Lote" }, { key: "location", label: "Ubicación" }, { key: "quantity", label: "Existencia" }, { key: "minimum", label: "Mínimo" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }], rows: inventoryRows, filters: ["Todas las categorías", "Todas las ubicaciones", "Estado de existencia"],
  },
  equipment: {
    eyebrow: "RECURSOS", title: "Equipos", description: "Programa mantenimiento, calibración y disponibilidad de instrumentos.", action: "Nuevo equipo", secondaryAction: "Agendar mantenimiento", icon: Microscope,
    stats: [
      { label: "Equipos registrados", value: "24", hint: "21 operativos", icon: Microscope },
      { label: "Mantenimiento próximo", value: "3", hint: "En 7 días", icon: Wrench },
      { label: "Disponibilidad", value: "97.2%", hint: "+1.3% este mes", icon: CheckCircle2 },
    ],
    columns: [{ key: "code", label: "Código" }, { key: "name", label: "Equipo" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }, { key: "calibration", label: "Última calibración" }, { key: "maintenance", label: "Próximo mantenimiento" }, { key: "utilization", label: "Utilización" }], rows: equipmentRows, filters: ["Todas las áreas", "Todos los estados"],
  },
  quality: {
    eyebrow: "QA / QC", title: "Control de calidad", description: "Registra corridas, desviaciones y acciones correctivas.", action: "Registrar QC", secondaryAction: "Nueva acción correctiva", icon: ShieldCheck,
    stats: [
      { label: "Cumplimiento QC", value: "98.6%", hint: "+0.9% este mes", icon: ShieldCheck },
      { label: "Corridas hoy", value: "36", hint: "35 conformes", icon: ClipboardCheck },
      { label: "En revisión", value: "1", hint: "Control ALT", icon: AlertCircle },
    ],
    columns: [{ key: "id", label: "Registro" }, { key: "area", label: "Área" }, { key: "control", label: "Control" }, { key: "run", label: "Hora" }, { key: "result", label: "Resultado" }, { key: "owner", label: "Responsable" }, { key: "status", label: "Estado" }], rows: qualityRows, filters: ["Todas las áreas", "Todos los estados", "Hoy"],
  },
  alerts: {
    eyebrow: "CONTROL OPERATIVO", title: "Alertas e incidencias", description: "Prioriza eventos, asigna responsables y documenta la resolución.", action: "Nueva incidencia", icon: AlertCircle,
    stats: [
      { label: "Abiertas", value: "3", hint: "1 prioridad alta", icon: AlertCircle },
      { label: "Tiempo medio de atención", value: "42 min", hint: "−8 min este mes", icon: CalendarClock },
      { label: "Cerradas esta semana", value: "18", hint: "94% dentro de SLA", icon: CheckCircle2 },
    ],
    columns: [{ key: "id", label: "Incidencia" }, { key: "type", label: "Tipo" }, { key: "title", label: "Descripción" }, { key: "severity", label: "Severidad" }, { key: "owner", label: "Responsable" }, { key: "opened", label: "Creada" }, { key: "status", label: "Estado" }], rows: incidentRows, filters: ["Incidencias abiertas", "Todas las severidades", "Todos los tipos"],
  },
  integrations: {
    eyebrow: "INTEROPERABILIDAD", title: "Integraciones", description: "Conecta analizadores, HIS y entregas externas de forma controlada.", action: "Nueva integración", secondaryAction: "Ver bitácora", icon: GitBranch,
    stats: [
      { label: "Integraciones activas", value: "4", hint: "Sin errores críticos", icon: GitBranch },
      { label: "Mensajes hoy", value: "1,286", hint: "99.7% procesados", icon: CheckCircle2 },
      { label: "Pendientes de revisión", value: "2", hint: "Reintentos automáticos", icon: AlertCircle },
    ],
    columns: [{ key: "name", label: "Integración" }, { key: "type", label: "Tipo" }, { key: "standard", label: "Estándar / canal" }, { key: "status", label: "Estado" }, { key: "lastSync", label: "Última sincronización" }], rows: integrationRows, filters: ["Todos los tipos", "Todos los estados"],
  },
  audit: {
    eyebrow: "TRAZABILIDAD", title: "Auditoría", description: "Consulta acciones críticas, responsables, origen y momento exacto.", action: "Exportar bitácora", icon: ShieldCheck,
    stats: [
      { label: "Eventos hoy", value: "1,904", hint: "Actividad normal", icon: ShieldCheck },
      { label: "Acciones críticas", value: "146", hint: "Liberaciones y cambios", icon: ClipboardCheck },
      { label: "Alertas de seguridad", value: "0", hint: "Sin incidencias", icon: CheckCircle2 },
    ],
    columns: [{ key: "actor", label: "Usuario" }, { key: "action", label: "Acción" }, { key: "object", label: "Objeto" }, { key: "origin", label: "Origen" }, { key: "when", label: "Hora" }], rows: auditRows, filters: ["Todos los usuarios", "Todas las acciones", "Hoy"],
  },
  administration: {
    eyebrow: "CONFIGURACIÓN", title: "Administración", description: "Gestiona usuarios, roles y parámetros del laboratorio.", action: "Invitar usuario", secondaryAction: "Gestionar roles", icon: UsersRound,
    stats: [
      { label: "Usuarios activos", value: "18", hint: "5 roles configurados", icon: UsersRound },
      { label: "Sesiones activas", value: "9", hint: "Turno actual", icon: UserRoundCheck },
      { label: "Cambios pendientes", value: "2", hint: "Requieren aprobación", icon: AlertCircle },
    ],
    columns: [{ key: "name", label: "Usuario" }, { key: "email", label: "Correo" }, { key: "role", label: "Rol" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }], rows: usersRows, filters: ["Todos los roles", "Todas las áreas", "Usuarios activos"],
  },
};

function displayCell(key: string, value: string | number) {
  const normalized = String(value);
  if (["status", "severity", "flag", "active"].includes(key)) return <span className="status-pill">{normalized}</span>;
  if (key === "priority") return <span className={`priority priority-${normalized.toLowerCase()}`}>{normalized}</span>;
  if (["id", "code", "sku", "accession"].includes(key)) return <strong className="table-id">{normalized}</strong>;
  return normalized;
}

export function ModuleView({ module }: { module: Exclude<ModuleKey, "dashboard"> }) {
  const [query, setQuery] = useState("");
  const config = module === "reports" ? null : moduleConfigs[module];

  const filteredRows = useMemo(() => {
    if (!config?.rows) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return config.rows;
    return config.rows.filter((row) => Object.values(row).some((value) => String(value).toLowerCase().includes(needle)));
  }, [config, query]);

  if (module === "reports") return <ReportsView />;
  if (!config) return null;

  const MainIcon = config.icon;
  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <p className="eyebrow">{config.eyebrow}</p>
          <h1>{config.title}</h1>
          <p>{config.description}</p>
        </div>
        <div className="header-actions">
          {config.secondaryAction ? <button className="secondary-button"><Upload size={15} />{config.secondaryAction}</button> : null}
          <button className="primary-button"><Plus size={15} />{config.action}</button>
        </div>
      </header>

      <section className="module-stat-grid">
        {config.stats.map((stat) => {
          const Icon = stat.icon;
          return <article className="module-stat" key={stat.label}><span><Icon size={17} /></span><div><p>{stat.label}</p><strong>{stat.value}</strong><small>{stat.hint}</small></div></article>;
        })}
      </section>

      <article className="panel table-panel module-table-panel">
        <div className="table-toolbar">
          <label className="table-search"><Search size={15} /><input placeholder={`Buscar en ${config.title.toLowerCase()}…`} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <div className="filter-row">
            {config.filters?.map((filter) => <button className="filter-button" key={filter}>{filter}<ChevronDown size={13} /></button>)}
            <button className="filter-button square-filter"><SlidersHorizontal size={14} /></button>
          </div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>{config.columns?.map((column) => <th key={column.key}>{column.label}</th>)}<th /></tr></thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr key={`${module}-${index}`}>
                  {config.columns?.map((column) => <td key={column.key}>{displayCell(column.key, row[column.key])}</td>)}
                  <td><button className="icon-button table-action"><MoreHorizontal size={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="table-footer"><span>Mostrando {filteredRows.length} registros de ejemplo</span><div><button disabled>Anterior</button><strong>1</strong><button disabled>Siguiente</button></div></footer>
      </article>
      <div className="module-hint"><MainIcon size={16} /><span>Vista inicial demostrativa. Conecta Neon para persistir registros reales y habilitar permisos por laboratorio.</span></div>
    </div>
  );
}

function ReportsView() {
  return (
    <div className="page-stack">
      <header className="page-header">
        <div><p className="eyebrow">ANÁLISIS Y DISTRIBUCIÓN</p><h1>Reportes</h1><p>Convierte la operación del laboratorio en información útil y exportable.</p></div>
        <div className="header-actions"><button className="secondary-button"><Upload size={15} /> Programaciones</button><button className="primary-button"><Plus size={15} /> Nuevo reporte</button></div>
      </header>
      <section className="module-stat-grid">
        <article className="module-stat"><span><BarChart3 size={17} /></span><div><p>Reportes disponibles</p><strong>12</strong><small>6 plantillas base</small></div></article>
        <article className="module-stat"><span><Download size={17} /></span><div><p>Exportaciones este mes</p><strong>184</strong><small>PDF, CSV y XLSX</small></div></article>
        <article className="module-stat"><span><CalendarClock size={17} /></span><div><p>Programados</p><strong>4</strong><small>Próxima ejecución 18:00</small></div></article>
      </section>
      <section className="report-grid">
        {reportCards.map((report) => <article className="report-card" key={report.title}><div><span>{report.badge}</span><BarChart3 size={18} /></div><h2>{report.title}</h2><p>{report.detail}</p><button>Abrir reporte <ArrowUpRight size={14} /></button></article>)}
      </section>
      <article className="panel report-schedule-panel"><div><PackageCheck size={18} /><p><strong>Entrega automatizada</strong><span>Configura reportes periódicos para responsables, instituciones o entidades de salud pública.</span></p></div><button className="secondary-button">Administrar programaciones</button></article>
    </div>
  );
}
