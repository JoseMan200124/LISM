// Sistema de plantillas reutilizable para reportes PDF de NexaLab.
//
// Estrategia deliberada: NO se introduce Puppeteer/Playwright. El Dockerfile
// actual (Alpine, sin Chromium instalado) y la técnica ya usada en producción
// (`window.print()` sobre una ventana con HTML/CSS) ya son compatibles con
// Docker/Azure Container Apps sin ningún cambio de infraestructura — este
// módulo solo profesionaliza esa misma técnica con una plantilla consistente,
// branding institucional real y CSS de impresión correcto (paginación A4,
// encabezados de tabla repetidos, numeración de página).
//
// Este archivo es seguro para importar desde componentes cliente (sin
// dependencias de Node/fs) porque `handleExportPdf` corre en el navegador
// (usa window.print()). La resolución del logo institucional desde disco
// vive aparte, en lib/report-branding-server.ts (server-only), consumida
// por app/api/organization/branding/route.ts.

export type ReportBranding = { organizationName: string | null; logoDataUri: string };
export type ReportKpi = { label: string; value: string; delta: string };
export type ReportTableColumn = { key: string; label: string };
export type ReportTableRow = Record<string, string>;
export type ReportAlert = { title: string; detail: string; severity: "Alta" | "Media" | "Baja"; when: string };

const PRIMARY = "#1d6b64";
const PRIMARY_DARK = "#145250";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderReportHeader(input: {
  reportTitle: string;
  roleLabel: string;
  branding: ReportBranding;
  laboratoryName: string;
  generatedBy?: string;
  filtersSummary?: string;
}): string {
  const date = new Date().toLocaleDateString("es-GT", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const time = new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" });
  const logoImg = input.branding.logoDataUri
    ? `<img src="${input.branding.logoDataUri}" alt="Logo" class="rpt-logo-img" />`
    : `<div class="rpt-logo-mark">NL</div>`;

  return `
<div class="rpt-header">
  <div class="rpt-logo">
    ${logoImg}
    <div class="rpt-logo-text">
      <strong>${escapeHtml(input.branding.organizationName || "NexaLab")}</strong>
      <span>${input.branding.organizationName ? "Generado con NexaLab" : "Sistema de Información de Laboratorio"}</span>
    </div>
  </div>
  <div class="rpt-meta">
    <h1>${escapeHtml(input.reportTitle)}</h1>
    <p>${date} · ${time}</p>
    <p>${escapeHtml(input.laboratoryName)}</p>
    ${input.filtersSummary ? `<p>${escapeHtml(input.filtersSummary)}</p>` : ""}
    ${input.generatedBy ? `<p>Generado por ${escapeHtml(input.generatedBy)}</p>` : ""}
    <div class="rpt-role-badge">${escapeHtml(input.roleLabel)}</div>
  </div>
</div>`;
}

function renderReportSummary(kpis: ReportKpi[]): string {
  if (kpis.length === 0) return "";
  const accents = [PRIMARY, "#b7782d", "#b5554d", "#4f806b"];
  const kpiHtml = kpis.map((k, i) => `
    <div class="rpt-kpi" style="border-left-color:${accents[i % accents.length]}">
      <div class="rpt-kpi-label">${escapeHtml(k.label)}</div>
      <strong class="rpt-kpi-value">${escapeHtml(k.value)}</strong>
      <em class="rpt-kpi-delta">${escapeHtml(k.delta)}</em>
    </div>`).join("");
  return `
<div class="rpt-section"><span>Resumen ejecutivo</span></div>
<div class="rpt-kpis">${kpiHtml}</div>`;
}

function renderReportTable(sectionTitle: string, columns: ReportTableColumn[], rows: ReportTableRow[]): string {
  const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.map((row) => `<tr>${columns.map((c) => `<td>${escapeHtml(row[c.key])}</td>`).join("")}</tr>`).join("");
  return `
<div class="rpt-section"><span>${escapeHtml(sectionTitle)} (${rows.length})</span></div>
<table class="rpt-table">
  <thead><tr>${head}</tr></thead>
  <tbody>${body || `<tr><td colspan="${columns.length}" class="rpt-empty">Sin registros para los filtros aplicados.</td></tr>`}</tbody>
</table>`;
}

function renderReportAlerts(alerts: ReportAlert[]): string {
  if (alerts.length === 0) return "";
  const html = alerts.map((a) => `
    <div class="rpt-alert rpt-alert-${a.severity.toLowerCase()}">
      <span class="rpt-alert-dot"></span>
      <div>
        <p class="rpt-alert-title">${escapeHtml(a.title)}</p>
        <p class="rpt-alert-detail">${escapeHtml(a.detail)}</p>
        <p class="rpt-alert-meta">${escapeHtml(a.severity)} · ${escapeHtml(a.when)}</p>
      </div>
    </div>`).join("");
  return `
<div class="rpt-section"><span>Alertas activas (${alerts.length})</span></div>
<div class="rpt-alerts">${html}</div>`;
}

function renderReportFooter(branding: ReportBranding): string {
  const institution = branding.organizationName ? escapeHtml(branding.organizationName) : "NexaLab";
  return `
<div class="rpt-footer">
  <p>Generado con NexaLab · ${institution} · Información confidencial del laboratorio</p>
</div>`;
}

const REPORT_STYLES = `
@page{margin:16mm 18mm 20mm;size:A4}
@page{@bottom-center{content:"Página " counter(page) " de " counter(pages);font-size:8px;color:#9ea9ab}}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;font-size:11px;color:#1e3035;background:#fff;margin:0;padding:24px;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
.rpt-header{display:flex;align-items:flex-start;justify-content:space-between;padding-bottom:16px;border-bottom:2.5px solid ${PRIMARY};margin-bottom:22px}
.rpt-logo{display:flex;align-items:center;gap:12px}
.rpt-logo-img{width:44px;height:44px;object-fit:contain;flex-shrink:0}
.rpt-logo-mark{width:44px;height:44px;border-radius:10px;background:${PRIMARY};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;letter-spacing:-.5px;flex-shrink:0}
.rpt-logo-text strong{display:block;font-size:19px;font-weight:800;color:${PRIMARY};letter-spacing:-.5px;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rpt-logo-text span{display:block;font-size:8px;font-weight:700;color:#7f8e91;letter-spacing:1.1px;text-transform:uppercase;margin-top:2px}
.rpt-meta{text-align:right;max-width:60%}
.rpt-meta h1{margin:0;font-size:14px;font-weight:700;color:#1e3035;letter-spacing:-.2px}
.rpt-meta p{margin:4px 0 0;font-size:10px;color:#7f8e91;line-height:1.5;word-wrap:break-word}
.rpt-role-badge{display:inline-block;margin-top:7px;padding:3px 10px;border-radius:12px;background:#e6f2ef;color:${PRIMARY};font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
.rpt-section{margin:22px 0 12px;display:flex;align-items:center;gap:8px;break-after:avoid}
.rpt-section::before{content:"";width:4px;height:16px;background:${PRIMARY};border-radius:2px;flex-shrink:0}
.rpt-section span{font-size:9.5px;font-weight:800;color:${PRIMARY};text-transform:uppercase;letter-spacing:.8px}
.rpt-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:22px}
.rpt-kpi{padding:12px 14px;border:1px solid #e4ebe8;border-radius:8px;border-left:3px solid ${PRIMARY};background:#fbfcfb;break-inside:avoid}
.rpt-kpi-label{font-size:9px;font-weight:700;color:#7f8e91;text-transform:uppercase;letter-spacing:.4px}
.rpt-kpi-value{display:block;margin-top:7px;font-size:24px;font-weight:800;color:#1e3035;letter-spacing:-.8px;line-height:1}
.rpt-kpi-delta{display:block;margin-top:5px;font-size:9px;font-style:normal;color:${PRIMARY}}
.rpt-table{width:100%;border-collapse:collapse;font-size:10.5px}
.rpt-table thead{display:table-header-group}
.rpt-table tr{break-inside:avoid;page-break-inside:avoid}
.rpt-table thead th{padding:7px 10px;background:#f1f6f4;border:1px solid #e4ebe8;font-size:9px;font-weight:800;color:#879497;text-align:left;text-transform:uppercase;letter-spacing:.5px}
.rpt-table tbody td{padding:9px 10px;border:1px solid #eaefee;color:#4e6368;word-break:break-word}
.rpt-table tbody tr:nth-child(even) td{background:#fafcfb}
.rpt-empty{text-align:center;color:#9ea9ab;font-style:italic}
.rpt-code{color:${PRIMARY};font-weight:700;font-size:10px}
.rpt-badge-success{display:inline-block;padding:2px 8px;border-radius:10px;color:#3e715f;background:#eef6f2;font-size:9px;font-weight:700}
.rpt-badge-warning{display:inline-block;padding:2px 8px;border-radius:10px;color:#9c6827;background:#fbf4e8;font-size:9px;font-weight:700}
.rpt-badge-info{display:inline-block;padding:2px 8px;border-radius:10px;color:#52707a;background:#eef3f4;font-size:9px;font-weight:700}
.rpt-badge-neutral{display:inline-block;padding:2px 8px;border-radius:10px;color:#7d8e90;background:#f1f4f3;font-size:9px;font-weight:700}
.rpt-badge-danger{display:inline-block;padding:2px 8px;border-radius:10px;color:#943b35;background:#fbeee9;font-size:9px;font-weight:700}
.rpt-alerts{display:grid;gap:7px}
.rpt-alert{display:grid;grid-template-columns:8px 1fr;gap:10px;padding:10px 12px;border:1px solid #eaefee;border-radius:7px;align-items:start;break-inside:avoid}
.rpt-alert-dot{width:8px;height:8px;border-radius:50%;margin-top:3px}
.rpt-alert-alta .rpt-alert-dot{background:#b5554d}
.rpt-alert-media .rpt-alert-dot{background:#b7782d}
.rpt-alert-baja .rpt-alert-dot{background:${PRIMARY_DARK}}
.rpt-alert-title{font-size:11px;font-weight:700;color:#354b50;margin:0 0 3px}
.rpt-alert-detail{font-size:10px;color:#738386;margin:0}
.rpt-alert-meta{font-size:9px;color:#9ea9ab;margin:3px 0 0}
.rpt-footer{margin-top:30px;padding-top:12px;border-top:1px solid #e4ebe8}
.rpt-footer p{margin:0;font-size:9px;color:#9ea9ab}
@media print{body{padding:0}}
`;

export function renderReportDocument(input: {
  reportTitle: string;
  roleLabel: string;
  branding: ReportBranding;
  laboratoryName: string;
  generatedBy?: string;
  filtersSummary?: string;
  kpis: ReportKpi[];
  tableSectionTitle: string;
  tableColumns: ReportTableColumn[];
  tableRows: ReportTableRow[];
  alerts?: ReportAlert[];
  autoPrint?: boolean;
}): string {
  const header = renderReportHeader(input);
  const summary = renderReportSummary(input.kpis);
  const table = renderReportTable(input.tableSectionTitle, input.tableColumns, input.tableRows);
  const alerts = renderReportAlerts(input.alerts ?? []);
  const footer = renderReportFooter(input.branding);
  const autoPrintScript = input.autoPrint === false
    ? ""
    : `<script>window.addEventListener("load",function(){window.focus();window.print();});</script>`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>NexaLab — ${escapeHtml(input.reportTitle)}</title>
<style>${REPORT_STYLES}</style>
</head>
<body>
${header}
${summary}
${table}
${alerts}
${footer}
${autoPrintScript}
</body>
</html>`;
}
