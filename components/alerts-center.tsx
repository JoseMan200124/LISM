"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BellRing, Clock3, ExternalLink, Plus } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import type { UserSession } from "@/lib/session";
import { notifyNotificationCountChanged } from "@/components/sidebar-alert-count";
import { sourceRecordHref } from "@/lib/deep-links";
import { EDUCATIONAL_RULE_TEMPLATES } from "@/lib/alert-rules";

type AlertRow = {
  id: string; title: string; details: string | null; severity: string; status: string;
  source_type: string | null; source_id: string | null; created_at: string; rule_name?: string | null;
};
type RuleRow = {
  id: string; rule_key: string; name: string; source_type: string; trigger_type: string;
  severity: string; active: boolean; recipient_config?: Record<string, unknown>;
  channel_config?: unknown; escalation_config?: { roles?: string[]; after_minutes?: number };
};
type EscalationRow = { id: string; alert_rule_id: string; rule_name: string; wait_minutes: number; recipient_config?: { roles?: string[] }; channel_config?: string[]; target_severity?: string | null; repeat_minutes?: number | null; subsequent_action?: string; status: string };

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
function alertSourceHref(a: { source_type: string | null; source_id: string | null }): string | null {
  return sourceRecordHref(a.source_type, a.source_id);
}

export function AlertsCenter({ role }: Readonly<{ role?: UserSession["role"] }>) {
  const canManage = role === "OWNER" || role === "LAB_ADMIN" || role === "HEAD_OF_LAB";
  const [tab, setTab] = useState("alerts");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [escalations, setEscalations] = useState<EscalationRow[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<AlertRow | null>(null);
  const [selectedRule, setSelectedRule] = useState<RuleRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolutionOpen, setResolutionOpen] = useState(false);
  const [ruleTemplateKey, setRuleTemplateKey] = useState<string>("");
  const [ruleCreateOpen, setRuleCreateOpen] = useState(false);
  const [ruleDefaultSource, setRuleDefaultSource] = useState<string>("INVENTORY_ITEM");
  const [ruleTest, setRuleTest] = useState<{ total: number; examples: Array<{ id: string; code?: string; name?: string }> } | null>(null);
  const [escalationEdit, setEscalationEdit] = useState<EscalationRow | null | "new">(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [aRes, rRes, eRes] = await Promise.all([fetch("/api/alerts"), fetch("/api/alerts/rules"), fetch("/api/alerts/escalations")]);
      if (!aRes.ok) { setState("error"); return; }
      const aData = await aRes.json() as { data?: AlertRow[] };
      const rData = rRes.ok ? await rRes.json() as { data?: RuleRow[] } : { data: [] };
      setAlerts(aData.data ?? []);
      setRules(rData.data ?? []);
      const eData = eRes.ok ? await eRes.json() as { data?: EscalationRow[] } : { data: [] };
      setEscalations(eData.data ?? []);
      setState("ready");
    } catch { setState("error"); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const alertId = new URLSearchParams(window.location.search).get("alertId");
    if (!alertId) return;
    const found = alerts.find((alert) => alert.id === alertId);
    if (found) setSelectedAlert(found);
  }, [alerts]);

  // Enlace directo desde Inventario/Equipos: ?tab=rules&action=create&source=…
  // abre el asistente de nueva regla con el origen preseleccionado.
  useEffect(() => {
    if (!canManage) return;
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get("tab");
    if (requestedTab && ["alerts", "rules", "escalations"].includes(requestedTab)) setTab(requestedTab);
    if (params.get("action") === "create") {
      const source = params.get("source");
      if (source) setRuleDefaultSource(source);
      setTab("rules");
      setRuleCreateOpen(true);
    }
  }, [canManage]);

  const openAlerts = useMemo(() => alerts.filter((a) => !["RESOLVED", "CLOSED"].includes(a.status)), [alerts]);

  async function actOnAlert(id: string, action: "ACKNOWLEDGE" | "ASSIGN_TO_ME" | "RESOLVE" | "REOPEN", note = "", resolution?: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, note, resolution }) });
      if (res.ok) { showToast("Alerta actualizada."); setSelectedAlert(null); setResolutionOpen(false); notifyNotificationCountChanged(); await load(); }
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

  async function createRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); setBusy(true);
    const response = await fetch("/api/alerts/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(data.get("name")), sourceType: String(data.get("sourceType")), triggerType: String(data.get("triggerType")), conditionConfig: { description: String(data.get("condition")) }, severity: String(data.get("severity")), recipientConfig: { roles: data.getAll("roles") }, channelConfig: data.getAll("channels"), escalationConfig: { after_minutes: Number(data.get("afterMinutes") ?? 0) || undefined, roles: ["HEAD_OF_LAB"] } }) });
    setBusy(false); if (response.ok) { showToast("Regla creada."); setRuleCreateOpen(false); await load(); } else { const payload = await response.json().catch(() => ({})) as { message?: string }; showError(payload.message ?? "No se pudo crear la regla."); }
  }

  async function ruleAction(rule: RuleRow, action: "duplicate" | "archive" | "test") {
    setBusy(true); setRuleTest(null);
    const response = action === "test" ? await fetch(`/api/alerts/rules/${rule.id}/test`, { method: "POST" }) : action === "archive" ? await fetch(`/api/alerts/rules/${rule.id}`, { method: "DELETE" }) : await fetch(`/api/alerts/rules/${rule.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ duplicate: true }) });
    setBusy(false);
    if (!response.ok) { showError("No se pudo completar la acción sobre la regla."); return; }
    if (action === "test") { const payload = await response.json() as { data: { total: number; examples: Array<{ id: string; code?: string; name?: string }> } }; setRuleTest(payload.data); }
    else { showToast(action === "archive" ? "Regla archivada." : "Regla duplicada como inactiva."); setSelectedRule(null); await load(); }
  }

  async function saveEscalation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const editing = escalationEdit !== "new" && escalationEdit !== null;
    const body = { alertRuleId: String(data.get("alertRuleId")), waitMinutes: Number(data.get("waitMinutes")), recipientConfig: { roles: [String(data.get("recipient"))] }, channelConfig: [String(data.get("channel"))], targetSeverity: String(data.get("severity")), repeatMinutes: Number(data.get("repeatMinutes")) || undefined, subsequentAction: String(data.get("action")) };
    const response = await fetch(editing ? `/api/alerts/escalations/${escalationEdit.id}` : "/api/alerts/escalations", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing ? { ...body, alertRuleId: undefined } : body) });
    if (response.ok) { showToast(editing ? "Escalamiento actualizado." : "Escalamiento creado."); setEscalationEdit(null); await load(); } else showError("No se pudo guardar el escalamiento.");
  }

  async function setEscalationStatus(escalation: EscalationRow, status: "ACTIVE" | "INACTIVE" | "ARCHIVED") {
    const response = await fetch(`/api/alerts/escalations/${escalation.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (response.ok) { showToast("Escalamiento actualizado."); setEscalationEdit(null); await load(); } else showError("No se pudo actualizar el escalamiento.");
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

  const escalationRules = escalations;
  const selectedTemplate = EDUCATIONAL_RULE_TEMPLATES.find((template) => template.key === ruleTemplateKey);

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
        <div data-tutorial="alerts-tabs"><Tabs items={canManage ? [{ key: "alerts", label: "Alertas" }, { key: "rules", label: "Reglas" }, { key: "escalations", label: "Escalamientos" }] : [{ key: "alerts", label: "Alertas relacionadas" }]} active={tab} onChange={setTab} /></div>
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
            <section data-tutorial="alert-rules-list">
              <div className="section-heading"><div><h2>Reglas de alerta</h2><p>Definen qué se vigila y a quién se avisa. Haz clic para ver el detalle y activar o desactivar.</p></div><button className="primary-button" onClick={() => setRuleCreateOpen(true)}><Plus size={15} /> Nueva regla</button></div>
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
              <div className="section-heading"><div><h2>Rutas de escalamiento</h2><p>A quién se informa cuando una alerta no se atiende a tiempo.</p></div><button className="primary-button" onClick={() => setEscalationEdit("new")}><Plus size={15} /> Nuevo escalamiento</button></div>
              <SimpleTable
                columns={[{ key: "rule", label: "Regla" }, { key: "roles", label: "Escala a" }, { key: "after", label: "Después de" }]}
                rows={escalationRules.map((r) => ({ id: r.id, rule: r.rule_name, roles: (r.recipient_config?.roles ?? []).join(", ") || "—", after: `${r.wait_minutes} min` }))}
                onRowClick={(row) => { const found = escalations.find((r) => r.id === row.id); if (found) setEscalationEdit(found); }}
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
            {resolutionOpen ? <form className="form-grid form-grid-two" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const explanation = String(data.get("explanation") ?? "").trim(); void actOnAlert(selectedAlert.id, "RESOLVE", explanation, { result: String(data.get("result") ?? "").trim(), explanation, responsible: String(data.get("responsible") ?? "").trim(), resolvedAt: new Date(String(data.get("resolvedAt"))).toISOString(), evidence: String(data.get("evidence") ?? "").trim() || undefined, correctiveAction: String(data.get("correctiveAction") ?? "").trim() }); }}><label><span>Resultado</span><input name="result" required minLength={2} /></label><label><span>Responsable</span><input name="responsible" required minLength={2} /></label><label><span>Fecha</span><input name="resolvedAt" type="datetime-local" required defaultValue={new Date().toISOString().slice(0, 16)} /></label><label><span>Evidencia opcional</span><input name="evidence" /></label><label className="field-span-two"><span>Explicación</span><textarea name="explanation" required minLength={3} rows={3} /></label><label className="field-span-two"><span>Acción correctiva</span><textarea name="correctiveAction" required minLength={3} rows={3} /></label><button type="button" className="secondary-button" onClick={() => setResolutionOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>Confirmar resolución</button></form> : null}
            <footer className="modal-actions">
              {selectedAlert.status === "RESOLVED" ? <button type="button" className="secondary-button" disabled={busy} onClick={() => void actOnAlert(selectedAlert.id, "REOPEN")}>Reabrir</button> : <><button type="button" className="secondary-button" disabled={busy} onClick={() => void actOnAlert(selectedAlert.id, "ACKNOWLEDGE")}>Reconocer</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void actOnAlert(selectedAlert.id, "ASSIGN_TO_ME")}>Asignarme</button><button type="button" className="primary-button" disabled={busy} onClick={() => setResolutionOpen(true)}>Resolver</button></>}
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
            {ruleTest ? <InlineNotice title="Resultado de la prueba">Coinciden {ruleTest.total} registros. No se creó ninguna alerta real.{ruleTest.examples.length ? ` Ejemplos: ${ruleTest.examples.map((example) => example.code ?? example.name ?? example.id).join(", ")}.` : ""}</InlineNotice> : null}
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setSelectedRule(null)}>Cerrar</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void ruleAction(selectedRule, "test")}>Probar regla</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void ruleAction(selectedRule, "duplicate")}>Duplicar</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void ruleAction(selectedRule, "archive")}>Archivar</button>
              <button type="button" className={selectedRule.active ? "secondary-button" : "primary-button"} disabled={busy} onClick={() => void toggleRule(selectedRule)}>{selectedRule.active ? "Desactivar" : "Activar"}</button>
            </footer>
          </div>
        ) : null}
      </ActionModal>

      <ActionModal open={ruleCreateOpen} title="Nueva regla educativa" description="Define el origen, la condición, severidad, destinatarios, canal y escalamiento." onClose={() => setRuleCreateOpen(false)} wide>
        <label><span>Comenzar desde una plantilla (opcional)</span><select value={ruleTemplateKey} onChange={(event) => setRuleTemplateKey(event.target.value)}><option value="">Regla personalizada</option>{EDUCATIONAL_RULE_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}</select></label>
        <form key={ruleTemplateKey} className="modal-form" onSubmit={createRule}><div className="form-grid form-grid-two"><label className="field-span-two"><span>Nombre</span><input name="name" required minLength={3} defaultValue={selectedTemplate?.name ?? ""} placeholder="Stock bajo de reactivos" /></label><label><span>Origen</span><select name="sourceType" defaultValue={selectedTemplate?.sourceType ?? ruleDefaultSource}><option value="INVENTORY_ITEM">Inventario</option><option value="EQUIPMENT">Equipo</option><option value="EQUIPMENT_PLAN">Plan de equipo</option><option value="EDUCATIONAL_PRACTICE">Práctica</option><option value="RESOURCE_RESERVATION">Reserva</option><option value="INCIDENT">Incidencia</option></select></label><label><span>Condición</span><select name="triggerType" defaultValue={selectedTemplate?.triggerType ?? "THRESHOLD"}><option value="THRESHOLD">Umbral / stock mínimo</option><option value="DATE_WINDOW">Fecha próxima</option><option value="DATE_OVERDUE">Fecha vencida</option><option value="STATUS">Estado</option><option value="AGE">Tiempo sin atención</option><option value="MISSING_LOG">Registro faltante</option></select></label><label className="field-span-two"><span>Explicación de la condición</span><input name="condition" required defaultValue={selectedTemplate?.name ?? ""} placeholder="Existencia menor o igual al stock mínimo" /></label><label><span>Severidad</span><select name="severity"><option value="WARNING">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option><option value="INFO">Informativa</option></select></label><label><span>Escalar después de (minutos)</span><input name="afterMinutes" type="number" min="1" defaultValue="1440" /></label><fieldset><legend>Destinatarios</legend><label><input type="checkbox" name="roles" value="LAB_ADMIN" defaultChecked /> Administrador</label><label><input type="checkbox" name="roles" value="HEAD_OF_LAB" defaultChecked /> Jefe de laboratorio</label></fieldset><fieldset><legend>Canales</legend><label><input type="checkbox" name="channels" value="IN_APP" defaultChecked /> Panel</label><label><input type="checkbox" name="channels" value="EMAIL" /> Correo</label><label><input type="checkbox" name="channels" value="WHATSAPP" /> WhatsApp</label></fieldset></div><footer className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRuleCreateOpen(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Crear regla"}</button></footer></form>
      </ActionModal>

      <ActionModal open={escalationEdit !== null} title={escalationEdit === "new" ? "Nuevo escalamiento" : "Editar escalamiento"} description="Ejemplo: si una alerta crítica no se reconoce en 60 minutos, notificar al jefe de laboratorio." onClose={() => setEscalationEdit(null)}>
        <form className="modal-form" onSubmit={saveEscalation}>
          <div className="form-grid">
            {escalationEdit === "new" ? <label><span>Regla</span><select name="alertRuleId" required><option value="">Selecciona…</option>{rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}</select></label> : null}
            <label><span>Tiempo de espera (minutos)</span><input name="waitMinutes" type="number" min="1" required defaultValue={escalationEdit === "new" ? 60 : escalationEdit?.wait_minutes} /></label>
            <label><span>Destinatario</span><select name="recipient" defaultValue={escalationEdit === "new" ? "HEAD_OF_LAB" : escalationEdit?.recipient_config?.roles?.[0]}><option value="HEAD_OF_LAB">Jefe de laboratorio</option><option value="LAB_ADMIN">Administrador</option><option value="PROFESSOR">Profesor responsable</option></select></label>
            <label><span>Canal</span><select name="channel" defaultValue={escalationEdit === "new" ? "IN_APP" : escalationEdit?.channel_config?.[0]}><option value="IN_APP">Panel</option><option value="EMAIL">Correo</option><option value="WHATSAPP">WhatsApp</option></select></label>
            <label><span>Severidad</span><select name="severity" defaultValue={escalationEdit === "new" ? "CRITICAL" : escalationEdit?.target_severity ?? "CRITICAL"}><option value="WARNING">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select></label>
            <label><span>Repetir después de (minutos)</span><input name="repeatMinutes" type="number" min="1" defaultValue={escalationEdit === "new" ? "" : escalationEdit?.repeat_minutes ?? ""} /></label>
            <label><span>Acción posterior</span><select name="action" defaultValue={escalationEdit === "new" ? "NOTIFY" : escalationEdit?.subsequent_action}><option value="NOTIFY">Notificar</option><option value="REASSIGN">Reasignar</option><option value="RAISE_SEVERITY">Elevar severidad</option></select></label>
          </div>
          <footer className="modal-actions">
            {escalationEdit && escalationEdit !== "new" ? <><button type="button" className="secondary-button" onClick={() => void setEscalationStatus(escalationEdit, escalationEdit.status === "ACTIVE" ? "INACTIVE" : "ACTIVE")}>{escalationEdit.status === "ACTIVE" ? "Desactivar" : "Activar"}</button><button type="button" className="secondary-button" onClick={() => void setEscalationStatus(escalationEdit, "ARCHIVED")}>Archivar</button></> : null}
            <button type="button" className="secondary-button" onClick={() => setEscalationEdit(null)}>Cancelar</button><button type="submit" className="primary-button">Guardar</button>
          </footer>
        </form>
      </ActionModal>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}
