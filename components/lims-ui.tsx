"use client";

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleAlert, CircleDashed, FlaskConical, Plus, RefreshCw, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

export type TableColumn = { key: string; label: string };
export type TableRow = Record<string, string | number | boolean | null | undefined>;

export function PageIntro({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{ eyebrow: string; title: string; description: string; children?: React.ReactNode }>) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children ? <div className="header-actions">{children}</div> : null}
    </header>
  );
}

export function StatGrid({
  items,
}: Readonly<{
  items: Array<{ label: string; value: string; hint: string; icon: LucideIcon }>;
}>) {
  return (
    <section className="module-stat-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <article className="module-stat" key={item.label}>
            <span><Icon size={17} /></span>
            <div><p>{item.label}</p><strong>{item.value}</strong><small>{item.hint}</small></div>
          </article>
        );
      })}
    </section>
  );
}

export function Tabs({
  items,
  active,
  onChange,
}: Readonly<{ items: Array<{ key: string; label: string; tutorialId?: string }>; active: string; onChange: (key: string) => void }>) {
  return (
    <div className="tabs" role="tablist" aria-label="Secciones">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          data-tutorial={item.tutorialId}
          className={`tab-button ${active === item.key ? "tab-button-active" : ""}`}
          onClick={() => onChange(item.key)}
          role="tab"
          aria-selected={active === item.key}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

const STATUS_PILL_MAP: Record<string, string> = {
  // Éxito / operativo
  lista: "status-pill-success", listo: "status-pill-success",
  activo: "status-pill-success", activa: "status-pill-success",
  operativo: "status-pill-success", disponible: "status-pill-success",
  completada: "status-pill-success", completado: "status-pill-success",
  implementado: "status-pill-success", entregada: "status-pill-success",
  aprobada: "status-pill-success", aprobado: "status-pill-success",
  devuelta: "status-pill-success",
  // Advertencia / en proceso
  preparación: "status-pill-warning", "en preparación": "status-pill-warning",
  pendiente: "status-pill-warning", vigilar: "status-pill-warning",
  "en mantenimiento": "status-pill-warning", "en curso": "status-pill-warning",
  "en revisión": "status-pill-warning", parcial: "status-pill-partial",
  // Info / planificado
  planificada: "status-pill-info", planificado: "status-pill-info",
  programada: "status-pill-info", programado: "status-pill-info",
  "en calibración": "status-pill-blue",
  // Neutral / borrador
  borrador: "status-pill-neutral", inactivo: "status-pill-neutral",
  inactiva: "status-pill-neutral", procedimiento: "status-pill-neutral",
  // Oscuro / finalizado
  ejecutada: "status-pill-dark", ejecutado: "status-pill-dark",
  cerrada: "status-pill-dark", cerrado: "status-pill-dark",
  // Peligro / crítico
  cancelada: "status-pill-danger", cancelado: "status-pill-danger",
  rechazada: "status-pill-danger", rechazado: "status-pill-danger",
  vencido: "status-pill-danger", crítica: "status-pill-danger",
  alta: "status-pill-danger", reponer: "status-pill-danger",
  "fuera de servicio": "status-pill-danger",
  // Severidades
  media: "status-pill-warning", baja: "status-pill-info",
};

function statusPillClass(text: string): string {
  return STATUS_PILL_MAP[text.toLowerCase()] ?? "status-pill-neutral";
}

function renderCell(key: string, value: TableRow[string]) {
  const text = value === null || value === undefined ? "—" : String(value);
  if (["status", "state", "severity", "active", "blocking"].includes(key)) {
    const cls = statusPillClass(text);
    return <span className={`status-pill ${cls}`}>{text}</span>;
  }
  if (["code", "id", "sku"].includes(key)) return <strong className="table-id">{text}</strong>;
  return text;
}

export function SimpleTable({
  columns,
  rows,
  searchable = true,
  searchPlaceholder = "Buscar…",
  footer,
  emptyTitle = "Sin registros",
  emptyMessage = "Todavía no hay información disponible en esta sección.",
  onRowClick,
}: Readonly<{
  columns: TableColumn[];
  rows: TableRow[];
  searchable?: boolean;
  searchPlaceholder?: string;
  footer?: React.ReactNode;
  emptyTitle?: string;
  emptyMessage?: string;
  // Cuando se pasa, cada fila es un control accesible (botón) que abre el
  // detalle/edición del registro. La fila recibe el objeto completo, así que
  // puede incluir un campo `id` no mostrado en columnas.
  onRowClick?: (row: TableRow) => void;
}>) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [query, rows]);

  const isEmpty = rows.length === 0;
  const noResults = !isEmpty && filtered.length === 0;

  return (
    <article className="panel table-panel module-table-panel">
      {searchable ? (
        <div className="table-toolbar">
          <label className="table-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
          </label>
        </div>
      ) : null}

      {isEmpty ? (
        <div className="empty-state">
          <div className="empty-icon"><FlaskConical size={22} /></div>
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
        </div>
      ) : noResults ? (
        <div className="empty-state">
          <div className="empty-icon"><Search size={22} /></div>
          <h3>Sin resultados</h3>
          <p>No hay registros que coincidan con <strong>&ldquo;{query}&rdquo;</strong>. Prueba con otro término.</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>
                {filtered.map((row, index) => (
                  <tr
                    key={`${index}-${String(row.code ?? row.id ?? "row")}`}
                    className={onRowClick ? "data-row-clickable" : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "button" : undefined}
                    onKeyDown={onRowClick ? (event) => {
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRowClick(row); }
                    } : undefined}
                  >
                    {columns.map((column) => <td key={column.key}>{renderCell(column.key, row[column.key])}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="table-footer"><span>{filtered.length} registros visibles</span>{footer}</footer>
        </>
      )}
    </article>
  );
}

export function SkeletonKpiGrid({ cols = 4 }: Readonly<{ cols?: 3 | 4 }>) {
  return (
    <div className={`skel-grid-${cols}`}>
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="skel skel-kpi" style={{ display: "grid", gap: "10px", alignContent: "start", padding: "15px" }}>
          <div className="skel skel-title" />
          <div className="skel skel-line" style={{ width: "30%", height: "28px", marginTop: "6px" }} />
          <div className="skel skel-line-sm" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: Readonly<{ rows?: number; cols?: number }>) {
  const widths = ["60%", "100%", "80%", "55%", "70%", "45%"];
  return (
    <article className="panel table-panel module-table-panel">
      <div className="table-toolbar">
        <div className="skel skel-line" style={{ width: "220px", height: "36px", borderRadius: "7px" }} />
      </div>
      <div className="table-scroll">
        {Array.from({ length: rows }).map((_, ri) => (
          <div key={ri} className="skel-table-row" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {Array.from({ length: cols }).map((__, ci) => (
              <div key={ci} className="skel skel-line" style={{ width: widths[(ri + ci) % widths.length] }} />
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

export function RuleState({ state }: Readonly<{ state: "IMPLEMENTED" | "CONFIGURE" | "PROCEDURE" }>) {
  if (state === "IMPLEMENTED") return <span className="compliance-state state-implemented"><CheckCircle2 size={14} /> Implementado</span>;
  if (state === "CONFIGURE") return <span className="compliance-state state-configure"><CircleAlert size={14} /> Configurar</span>;
  return <span className="compliance-state state-procedure"><CircleDashed size={14} /> Procedimiento</span>;
}

export function EmptyAction({ label, onClick }: Readonly<{ label: string; onClick?: () => void }>) {
  return <button className="primary-button" type="button" onClick={onClick} disabled={!onClick}><Plus size={15} /> {label}</button>;
}

export function ErrorState({
  title = "No se pudo cargar la información",
  description,
  onRetry,
}: Readonly<{ title?: string; description: string; onRetry?: () => void }>) {
  return (
    <div className="empty-state error-state" role="alert">
      <div className="empty-icon"><TriangleAlert size={22} /></div>
      <h3>{title}</h3>
      <p>{description}</p>
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          <RefreshCw size={15} /> Reintentar
        </button>
      ) : null}
    </div>
  );
}

export function InlineNotice({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="inline-notice">
      <CircleAlert size={17} />
      <p><strong>{title}</strong><span>{children}</span></p>
    </div>
  );
}
