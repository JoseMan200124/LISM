"use client";

import { useState } from "react";
import { FileDown, FileText } from "lucide-react";
import { renderReportDocument, type ReportBranding, type ReportTableColumn } from "@/lib/report-template";
import { roleLabels } from "@/lib/permissions";
import type { UserSession } from "@/lib/session";

// Reportes de cumplimiento en PDF. Reutilizan la plantilla institucional
// (lib/report-template.ts) y la técnica ya usada en producción: se abre una
// ventana con el documento maquetado y se imprime. Sin Chromium en el servidor.

export type ReportKey =
  | "inventory" | "kardex" | "consumption-user" | "consumption-area"
  | "expiring" | "depleted" | "movements";

type ReportDefinition = {
  key: ReportKey;
  title: string;
  description: string;
  columns: ReportTableColumn[];
  /** Columnas que se muestran como fecha corta. */
  dateKeys?: string[];
  /** Columnas que se muestran como fecha y hora. */
  dateTimeKeys?: string[];
};

const MOVEMENT_LABEL: Record<string, string> = {
  RECEIPT: "Entrada", CONSUMPTION: "Consumo", ADJUSTMENT: "Ajuste",
  DISPOSAL: "Descarte", TRANSFER: "Transferencia", RETURN: "Devolución",
};

export const REPORTS: ReportDefinition[] = [
  {
    key: "inventory",
    title: "Inventario actual",
    description: "Existencia por envase con lote, ubicación, vencimiento y clasificación.",
    columns: [
      { key: "sku", label: "Código" }, { key: "name", label: "Reactivo" }, { key: "cas_number", label: "CAS" },
      { key: "category", label: "Categoría" }, { key: "lot_number", label: "Lote" },
      { key: "location", label: "Ubicación" }, { key: "quantity", label: "Existencia" },
      { key: "unit", label: "Unidad" }, { key: "expires_at", label: "Vence" }, { key: "controlled", label: "Controlado" },
    ],
    dateKeys: ["expires_at"],
  },
  {
    key: "kardex",
    title: "Kardex",
    description: "Entradas, salidas, ajustes y descartes con saldo antes y después.",
    columns: [
      { key: "performed_at", label: "Fecha y hora" }, { key: "sku", label: "Código" }, { key: "name", label: "Reactivo" },
      { key: "movement_type", label: "Movimiento" }, { key: "quantity_delta", label: "Cantidad" },
      { key: "previous_quantity", label: "Saldo antes" }, { key: "resulting_quantity", label: "Saldo después" },
      { key: "performed_by", label: "Responsable" }, { key: "usage_area", label: "Área o proyecto" },
      { key: "authorized_by", label: "Autoriza" }, { key: "note", label: "Observaciones" },
    ],
    dateTimeKeys: ["performed_at"],
  },
  {
    key: "consumption-user",
    title: "Consumo por usuario",
    description: "Cuánto consumió cada persona, por reactivo, en el periodo elegido.",
    columns: [
      { key: "person", label: "Persona" }, { key: "sku", label: "Código" }, { key: "item_name", label: "Reactivo" },
      { key: "total_consumed", label: "Consumo total" }, { key: "unit", label: "Unidad" },
      { key: "movements", label: "Movimientos" }, { key: "last_movement", label: "Último consumo" },
    ],
    dateTimeKeys: ["last_movement"],
  },
  {
    key: "consumption-area",
    title: "Consumo por laboratorio o proyecto",
    description: "Consumo agrupado por el área o proyecto declarado en cada salida.",
    columns: [
      { key: "area", label: "Área o proyecto" }, { key: "sku", label: "Código" }, { key: "item_name", label: "Reactivo" },
      { key: "total_consumed", label: "Consumo total" }, { key: "unit", label: "Unidad" },
      { key: "movements", label: "Movimientos" }, { key: "last_movement", label: "Último consumo" },
    ],
    dateTimeKeys: ["last_movement"],
  },
  {
    key: "expiring",
    title: "Reactivos próximos a vencer",
    description: "Envases con vencimiento dentro del horizonte elegido, con los días restantes.",
    columns: [
      { key: "sku", label: "Código" }, { key: "name", label: "Reactivo" }, { key: "lot_number", label: "Lote" },
      { key: "quantity", label: "Existencia" }, { key: "unit", label: "Unidad" },
      { key: "location", label: "Ubicación" }, { key: "expires_at", label: "Vence" },
      { key: "days_left", label: "Días" }, { key: "controlled", label: "Controlado" },
    ],
    dateKeys: ["expires_at"],
  },
  {
    key: "depleted",
    title: "Reactivos agotados",
    description: "Envases sin existencia, con su último movimiento y su cantidad inicial.",
    columns: [
      { key: "sku", label: "Código" }, { key: "name", label: "Reactivo" }, { key: "lot_number", label: "Lote" },
      { key: "initial_quantity", label: "Cantidad inicial" }, { key: "unit", label: "Unidad" },
      { key: "location", label: "Ubicación" }, { key: "last_movement", label: "Último movimiento" },
      { key: "status", label: "Estado" },
    ],
    dateTimeKeys: ["last_movement"],
  },
  {
    key: "movements",
    title: "Historial de movimientos",
    description: "Todos los movimientos del periodo, en orden cronológico inverso.",
    columns: [
      { key: "performed_at", label: "Fecha y hora" }, { key: "sku", label: "Código" }, { key: "name", label: "Reactivo" },
      { key: "movement_type", label: "Movimiento" }, { key: "quantity_delta", label: "Cantidad" },
      { key: "resulting_quantity", label: "Saldo" }, { key: "performed_by", label: "Responsable" },
      { key: "usage_area", label: "Área" }, { key: "note", label: "Observaciones" },
    ],
    dateTimeKeys: ["performed_at"],
  },
];

async function fetchBranding(): Promise<ReportBranding & { laboratoryName: string }> {
  try {
    const response = await fetch("/api/organization/branding");
    if (!response.ok) throw new Error("branding");
    const payload = await response.json() as { data: ReportBranding & { laboratoryName: string } };
    return payload.data;
  } catch {
    return { organizationName: null, logoDataUri: "", laboratoryName: "Laboratorio" };
  }
}

function formatCell(value: unknown, key: string, definition: ReportDefinition): string {
  if (value === null || value === undefined || value === "") return "—";
  if (definition.dateKeys?.includes(key)) {
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }) : String(value);
  }
  if (definition.dateTimeKeys?.includes(key)) {
    const date = new Date(String(value));
    return Number.isFinite(date.getTime())
      ? date.toLocaleString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : String(value);
  }
  if (key === "movement_type") return MOVEMENT_LABEL[String(value)] ?? String(value);
  return String(value);
}

export function ReagentReports({ session }: Readonly<{ session?: UserSession }>) {
  const [busy, setBusy] = useState<ReportKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [onlyControlled, setOnlyControlled] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function generate(definition: ReportDefinition) {
    setBusy(definition.key);
    setMessage(null);
    try {
      const params = new URLSearchParams({ type: definition.key });
      if (onlyControlled) params.set("controlled", "1");
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const [response, branding] = await Promise.all([
        fetch(`/api/compliance/reports?${params.toString()}`),
        fetchBranding(),
      ]);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: undefined })) as { message?: string };
        setMessage(payload.message || "No se pudo generar el reporte.");
        return;
      }
      const payload = await response.json() as { data?: Array<Record<string, unknown>> };
      const rows = payload.data ?? [];
      if (!rows.length) {
        setMessage("No hay datos para ese reporte con los filtros elegidos.");
        return;
      }

      const filters = [
        onlyControlled ? "Solo reactivos controlados y de doble uso" : "Todo el inventario",
        from ? `Desde ${from}` : null,
        to ? `Hasta ${to}` : null,
      ].filter(Boolean).join(" · ");

      const html = renderReportDocument({
        reportTitle: definition.title,
        roleLabel: session ? roleLabels[session.role] : "Usuario",
        branding,
        laboratoryName: branding.laboratoryName,
        generatedBy: session?.name,
        filtersSummary: filters,
        kpis: [
          { label: "Registros", value: String(rows.length), delta: definition.title },
          { label: "Alcance", value: onlyControlled ? "Controlados" : "Todo", delta: "Filtro aplicado" },
          { label: "Generado", value: new Date().toLocaleDateString("es-GT"), delta: session?.name ?? "" },
        ],
        tableSectionTitle: definition.title,
        tableColumns: definition.columns,
        tableRows: rows.map((row) => {
          const formatted: Record<string, string> = {};
          for (const column of definition.columns) formatted[column.key] = formatCell(row[column.key], column.key, definition);
          return formatted;
        }),
      });

      const win = window.open("", "_blank", "width=980,height=760,scrollbars=yes");
      if (!win) {
        setMessage("El navegador bloqueó la ventana del reporte. Permite las ventanas emergentes de este sitio.");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      setMessage("No se pudo conectar con el servidor.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="research-panel">
      <p className="form-help">
        Cada reporte se abre listo para imprimir o guardar como PDF, con el logotipo de la institución,
        el usuario que lo generó y la fecha. Es el formato que se entrega en una inspección.
      </p>

      <div className="form-grid form-grid-two">
        <label className="check-line field-span-two">
          <input type="checkbox" checked={onlyControlled} onChange={(event) => setOnlyControlled(event.target.checked)} />
          <span>Solo reactivos controlados y de doble uso</span>
        </label>
        <label><span>Desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>

      {message ? <p className="modal-note">{message}</p> : null}

      <div className="report-grid">
        {REPORTS.map((definition) => (
          <article className="report-card" key={definition.key}>
            <div><span>PDF</span><FileText size={18} strokeWidth={1.8} /></div>
            <h2>{definition.title}</h2>
            <p>{definition.description}</p>
            <button type="button" disabled={busy === definition.key} onClick={() => void generate(definition)}>
              <FileDown size={14} /> {busy === definition.key ? "Generando…" : "Generar PDF"}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
