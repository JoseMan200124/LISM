"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, Clock3, ExternalLink } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type AlertRow = {
  id: string; title: string; details: string | null; severity: string; status: string;
  source_type: string | null; source_id: string | null; created_at: string; rule_name?: string | null;
};
type RuleRow = {
  id: string; rule_key: string; name: string; source_type: string; trigger_type: string;
  severity: string; active: boolean; recipient_config?: Record<string, unknown>;
  channel_config?: unknown; escalation_config?: { roles?: string[]; after_minutes?: number };
};

const SEVERITY_LABEL: Record<string, string> = { CRITICAL: "Crítica", HIGH: "Alta", WARNING: "Media", INFO: "Baja" };
const STATUS_LABEL: Record<string, string> = { OPEN: "Abierta", ASSIGNED: "Asignada", IN_REVIEW: "En revisión", RESOLVED: "Resuelta", CLOSED: "Cerrada" };
const SOURCE_LABEL: Record<string, string> = { EQUIPMENT: "Equipo", INVENTORY: "Inventario", INVENTORY_ITEM: "Inventario", RESOURCE_RESERVATION: "Reserva", EDUCATIONAL_PRACTICE: "Práctica" };
const TRIGGER_EXPLAIN: Record<string, string> = {
  DATE_OVERDUE: "Se activa cuando una fecha (calibración, mantenimiento o vencimiento) ya pasó.",
  DATE_WINDOW: "Se activa cuando una fecha se acerca dentro de la ventana configurada.",
  THRESHOLD: "Se activa cuando la existencia baja del mínimo definido.",
  MISSING_LOG: "Se activa cuando falta un registro esperado (por ejemplo, una verificación diaria).",
};

function severityPill(sev: string): string {
  if (sev === "CRITICAL" || sev === "HIGH") return "status-pill-danger";
  if (sev === "WARNING") return "status-pill-warning";
  return "status-pill-info";
}
function fmtDateTime(value: unknown): string {
  if (!value) return "—";
  try { return new Date(String(value)).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return String(value); }
}
function alertSourceHref(a: { source_type: string | null }): string | null {
  switch (a.source_type) {
    case "INVENTORY_ITEM": case "INVENTORY": return "/app/inventory";
    case "EQUIPMENT": return "/app/equipment";
    case "EDUCATIONAL_PRACTICE": return "/app/education?tab=practices";
    case "RESOURCE_RESERVATION": return "/app/education?tab=reservations";
    default: return null;
  }
}

export function AlertsCenter() {
  const [tab, setTab] = useState("alerts");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);
  const [selectedRule, setSelectedRule] = useState<RuleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [aRes, rRes] = await Promise.all([fetch("/api/alerts"), fetch("/api/alerts/rules")]);
      if (!aRes.ok) { setState("error"); return; }
      const aData = await aRes.json() as { data?: AlertRow[] };
      const rData = rRes.ok ? await rRes.json() as { data?: RuleRow[] } : { data: [] };
      setAlerts(aData.data ?? []);
      setRules(rData.data ?? []);
      setState("ready");
    } catch { setState("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openAlerts = useMemo(() => alerts.filter((a) => !["RESOLVED", "CLOSED"].includes(a.status)), [alerts]);

  async function actOnAlert(id: string, action: "ACKNOWLEDGE" | "ASSIGN_TO_ME" | "RESOLVE", note = "") {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, note }) });
      if (res.ok) { showToast("Alerta actualizada."); setSelectedAlert(null); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo actualizar la alerta."); }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  async function toggleRule(rule: RuleRow) {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts/rules", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, active: !rule.active }) });
      if (res.ok) { showToast(rule.active ? "Regla desactivada." : "Regla activada."); setSelectedRule(null); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo actualizar la regla."); }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  const alertRows: TableRow[] = alerts.map((a) => ({
    id: a.id,
    title: a.title,
    source: a.source_type ? (SOURCE_LABEL[a.source_type] ?? a.source_type) : "—",
    severity: SEVERITY_LABEL[a.severity] ?? a.severity,
    status: STATUS_LABEL[a.status] ?? a.status,
    created: fmtDateTime(a.created_at),
  }));

  const ruleRows: TableRow[] = rules.map((r) => ({
    id: r.id,
    name: r.name,
    source: SOURCE_LABEL[r.source_type] ?? r.source_type,
    severity: SEVERITY_LABEL[r.severity] ?? r.severity,
    active: r.active ? "Activa" : "Inactiva",
  }));

  const escalationRules = rules.filter((r) => r.escalation_config && typeof r.escalation_config.after_minutes === "number");

  if (state === "loading") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="CONTROL OPERATIVO" title="Alertas y reglas" description="Atiende primero lo crítico. Cada alerta enlaza con el registro que la originó." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={5} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="CONTROL OPERATIVO" title="Alertas y reglas" description="Atiende primero lo crítico. Cada alerta enlaza con el registro que la originó." />
        <ErrorState description="No se pudieron cargar las alertas. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONTROL OPERATIVO" title="Alertas y reglas" description="Atiende primero lo crítico. Cada alerta enlaza con el registro que la originó." />
      <StatGrid items={[
        { label: "Alertas activas", value: String(openAlerts.length), hint: openAlerts.length ? "Requieren atención" : "Todo al día", icon: AlertTriangle },
        { label: "Reglas configuradas", value: String(rules.length), hint: `${rules.filter((r) => r.active).length} activas`, icon: BellRing },
        { label: "Con escalamiento", value: String(escalationRules.length), hint: "Rutas definidas", icon: Clock3 },
      ]} />
      <InlineNotice title="Alertas automáticas">Estas alertas las genera el sistema por inventario, vencimientos, equipos, mantenimiento, calibración y prácticas. Los incidentes o hallazgos registrados a mano se gestionarán en su propio módulo.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "alerts", label: "Alertas" }, { key: "rules", label: "Reglas" }, { key: "escalations", label: "Escalamientos" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "alerts" ? (
            <section>
              <div className="section-heading"><div><h2>Alertas del laboratorio</h2><p>Haz clic en una alerta para ver el detalle y abrir el registro que la originó.</p></div></div>
              <SimpleTable
                columns={[{ key: "title", label: "Alerta" }, { key: "source", label: "Origen" }, { key: "severity", label: "Severidad" }, { key: "status", label: "Estado" }, { key: "created", label: "Creada" }]}
                rows={alertRows}
                onRowClick={(row) => { const found = alerts.find((a) => a.id === row.id); if (found) setSelectedAlert(found); }}
                emptyTitle="No hay alertas activas en este momento"
                emptyMessage="Cuando el sistema detecte stock bajo, vencimientos o equipos que requieran atención, aparecerán aquí."
              />
            </section>
          ) : null}
          {tab === "rules" ? (
            <section>
              <div className="section-heading"><div><h2>Reglas de alerta</h2><p>Definen qué se vigila y a quién se avisa. Haz clic para ver el detalle y activar o desactivar.</p></div></div>
              <SimpleTable
                columns={[{ key: "name", label: "Regla" }, { key: "source", label: "Origen" }, { key: "severity", label: "Severidad" }, { key: "active", label: "Estado" }]}
                rows={ruleRows}
                onRowClick={(row) => { const found = rules.find((r) => r.id === row.id); if (found) setSelectedRule(found); }}
                emptyTitle="Sin reglas configuradas"
                emptyMessage="Aún no hay reglas de alerta para este laboratorio."
              />
            </section>
          ) : null}
          {tab === "escalations" ? (
            <section>
              <div className="section-heading"><div><h2>Rutas de escalamiento</h2><p>A quién se informa cuando una alerta no se atiende a tiempo.</p></div></div>
              <SimpleTable
                columns={[{ key: "rule", label: "Regla" }, { key: "roles", label: "Escala a" }, { key: "after", label: "Después de" }]}
                rows={escalationRules.map((r) => ({ id: r.id, rule: r.name, roles: (r.escalation_config?.roles ?? []).join(", ") || "—", after: `${r.escalation_config?.after_minutes} min` }))}
                onRowClick={(row) => { const found = rules.find((r) => r.id === row.id); if (found) setSelectedRule(found); }}
                emptyTitle="Sin escalamientos"
                emptyMessage="Ninguna regla tiene una ruta de escalamiento configurada."
              />
            </section>
          ) : null}
        </div>
      </article>

      <ActionModal open={Boolean(selectedAlert)} title={selectedAlert?.title ?? "Alerta"} description="Detalle de la alerta automática." onClose={() => setSelectedAlert(null)}>
        {selectedAlert ? (
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Severidad</small><strong><span className={`status-pill ${severityPill(selectedAlert.severity)}`}>{SEVERITY_LABEL[selectedAlert.severity] ?? selectedAlert.severity}</span></strong></div>
              <div><small>Estado</small><strong>{STATUS_LABEL[selectedAlert.status] ?? selectedAlert.status}</strong></div>
              <div><small>Origen</small><strong>{selectedAlert.source_type ? (SOURCE_LABEL[selectedAlert.source_type] ?? selectedAlert.source_type) : "—"}</strong></div>
              <div><small>Creada</small><strong>{fmtDateTime(selectedAlert.created_at)}</strong></div>
              {selectedAlert.details ? <div className="field-span-two"><small>Detalle</small><strong>{selectedAlert.details}</strong></div> : null}
            </div>
            {alertSourceHref(selectedAlert) ? (
              <Link href={alertSourceHref(selectedAlert)!} className="secondary-button" style={{ marginTop: 12 }}><ExternalLink size={15} /> Abrir registro de origen</Link>
            ) : null}
            <footer className="modal-actions">
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void actOnAlert(selectedAlert.id, "ACKNOWLEDGE")}>Reconocer</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void actOnAlert(selectedAlert.id, "ASSIGN_TO_ME")}>Asignarme</button>
              <button type="button" className="primary-button" disabled={busy} onClick={() => { const note = window.prompt("¿Cómo se resolvió la alerta?") ?? ""; if (note.trim().length >= 3) void actOnAlert(selectedAlert.id, "RESOLVE", note); else if (note !== "") showError("Indica cómo se resolvió la alerta (mínimo 3 caracteres)."); }}>Resolver</button>
            </footer>
          </div>
        ) : null}
      </ActionModal>

      <ActionModal open={Boolean(selectedRule)} title={selectedRule?.name ?? "Regla"} description="Qué vigila esta regla y a quién avisa." onClose={() => setSelectedRule(null)}>
        {selectedRule ? (
          <div className="modal-form">
            <p>{TRIGGER_EXPLAIN[selectedRule.trigger_type] ?? "Regla de alerta configurada para este laboratorio."}</p>
            <div className="details-grid">
              <div><small>Origen</small><strong>{SOURCE_LABEL[selectedRule.source_type] ?? selectedRule.source_type}</strong></div>
              <div><small>Severidad</small><strong>{SEVERITY_LABEL[selectedRule.severity] ?? selectedRule.severity}</strong></div>
              <div><small>Estado</small><strong>{selectedRule.active ? "Activa" : "Inactiva"}</strong></div>
              {selectedRule.escalation_config?.after_minutes ? <div><small>Escala tras</small><strong>{selectedRule.escalation_config.after_minutes} min → {(selectedRule.escalation_config.roles ?? []).join(", ")}</strong></div> : null}
            </div>
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSelectedRule(null)}>Cerrar</button>
              <button type="button" className={selectedRule.active ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void toggleRule(selectedRule)}>{selectedRule.active ? "Desactivar" : "Activar"}</button>
            </footer>
          </div>
        ) : null}
      </ActionModal>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}
