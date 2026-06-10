"use client";

import type { LucideIcon } from "lucide-react";
import { CheckCircle2, CircleAlert, CircleDashed, Plus, Search } from "lucide-react";
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
}: Readonly<{ items: Array<{ key: string; label: string }>; active: string; onChange: (key: string) => void }>) {
  return (
    <div className="tabs" role="tablist" aria-label="Secciones">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
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

function renderCell(key: string, value: TableRow[string]) {
  const text = value === null || value === undefined ? "—" : String(value);
  if (["status", "state", "severity", "active", "blocking"].includes(key)) {
    return <span className="status-pill">{text}</span>;
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
}: Readonly<{
  columns: TableColumn[];
  rows: TableRow[];
  searchable?: boolean;
  searchPlaceholder?: string;
  footer?: React.ReactNode;
}>) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(needle)));
  }, [query, rows]);

  return (
    <article className="panel table-panel module-table-panel">
      {searchable ? (
        <div className="table-toolbar">
          <label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} /></label>
        </div>
      ) : null}
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>
            {filtered.map((row, index) => (
              <tr key={`${index}-${String(row.code ?? row.id ?? "row")}`}>
                {columns.map((column) => <td key={column.key}>{renderCell(column.key, row[column.key])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="table-footer"><span>{filtered.length} registros visibles</span>{footer}</footer>
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

export function InlineNotice({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="inline-notice">
      <CircleAlert size={17} />
      <p><strong>{title}</strong><span>{children}</span></p>
    </div>
  );
}
