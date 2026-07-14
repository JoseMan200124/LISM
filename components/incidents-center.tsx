"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, ExternalLink, Plus, ShieldAlert } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

type IncidentRow = {
  id: string; incident_code: string; title: string; category: string; severity: string; status: string;
  location: string | null; related_type: string | null; related_id: string | null;
  occurred_at: string | null; created_at: string; assigned_name?: string | null;
  description?: string | null; actions_taken?: string | null; resolution?: string | null; created_name?: string | null;
};
type ResourceOption = { id: string; label: string };

const CATEGORY_LABEL: Record<string, string> = { ACCIDENT: "Accidente", EQUIPMENT_DAMAGE: "Daño de equipo", SPILL: "Derrame", FINDING: "Hallazgo", DEVIATION: "Desviación", NONCOMPLIANCE: "Incumplimiento", OTHER: "Otro" };
const SEVERITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };
const STATUS_LABEL: Record<string, string> = { OPEN: "Abierta", IN_PROGRESS: "En proceso", RESOLVED: "Resuelta", CLOSED: "Cerrada", ARCHIVED: "Archivada" };
const RELATED_LABEL: Record<string, string> = { EQUIPMENT: "Equipo", INVENTORY_ITEM: "Inventario", EDUCATIONAL_PRACTICE: "Práctica" };

function fmtDate(v: unknown): string { if (!v) return "—"; try { return new Date(String(v)).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(v); } }
function severityPill(s: string): string { if (s === "CRITICAL" || s === "HIGH") return "status-pill-danger"; if (s === "MEDIUM") return "status-pill-warning"; return "status-pill-info"; }
function relatedHref(t: string | null): string | null {
  if (t === "EQUIPMENT") return "/app/equipment";
  if (t === "INVENTORY_ITEM") return "/app/inventory";
  if (t === "EDUCATIONAL_PRACTICE") return "/app/education?tab=practices";
  return null;
}

export function IncidentsCenter({ role }: Readonly<{ role?: UserSession["role"] }>) {
  const canManage = role ? hasPermission({ role } as UserSession, "incidents.manage") : false;
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [pending, setPending] = useState(false);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [tab, setTab] = useState("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<IncidentRow | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch("/api/incidents");
      if (!res.ok) { setState("error"); return; }
      const payload = await res.json() as { data?: IncidentRow[]; mode?: string };
      setIncidents(payload.data ?? []);
      setPending(payload.mode === "pending-migration");
      setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = incidents.filter((i) => !["RESOLVED", "CLOSED", "ARCHIVED"].includes(i.status));
  const shown = tab === "open" ? open : incidents;

  async function createIncident(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch("/api/incidents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (res.ok) { showToast("Incidencia registrada."); setCreateOpen(false); await load(); return true; }
      const p = await res.json().catch(() => ({})) as { message?: string };
      showError(p.message ?? "No se pudo registrar la incidencia."); return false;
    } catch { showError("No se pudo conectar con el servidor."); return false; }
  }

  async function updateIncident(id: string, body: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/incidents/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) { showToast("Incidencia actualizada."); setSelected(null); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo actualizar."); }
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  const rows: TableRow[] = shown.map((i) => ({
    id: i.id,
    code: i.incident_code,
    title: i.title,
    category: CATEGORY_LABEL[i.category] ?? i.category,
    severity: SEVERITY_LABEL[i.severity] ?? i.severity,
    status: STATUS_LABEL[i.status] ?? i.status,
    assigned: i.assigned_name ?? "Sin asignar",
    created: fmtDate(i.created_at),
  }));

  if (state === "loading") {
    return <div className="page-stack"><PageIntro eyebrow="SEGURIDAD Y CALIDAD" title="Incidencias y hallazgos" description="Registra accidentes, daños, derrames, hallazgos y desviaciones del laboratorio." /><SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={7} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }
  if (state === "error") {
    return <div className="page-stack"><PageIntro eyebrow="SEGURIDAD Y CALIDAD" title="Incidencias y hallazgos" description="Registra accidentes, daños, derrames, hallazgos y desviaciones del laboratorio." /><ErrorState description="No se pudieron cargar las incidencias. Intenta de nuevo." onRetry={() => void load()} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="SEGURIDAD Y CALIDAD" title="Incidencias y hallazgos" description="Registros manuales del laboratorio, separados de las alertas automáticas.">
        {canManage ? <button className="primary-button" onClick={() => setCreateOpen(true)} disabled={pending}><Plus size={15} /> Nueva incidencia</button> : null}
      </PageIntro>
      {pending ? <InlineNotice title="Módulo por activar">Este módulo estará disponible en cuanto se aplique la actualización de base de datos (migración 0014). La navegación y los permisos ya están listos.</InlineNotice> : null}
      <StatGrid items={[
        { label: "Abiertas", value: String(open.length), hint: open.length ? "Requieren seguimiento" : "Sin pendientes", icon: ShieldAlert },
        { label: "Total registradas", value: String(incidents.length), hint: "Historial del laboratorio", icon: ClipboardList },
        { label: "Críticas / altas", value: String(open.filter((i) => ["CRITICAL", "HIGH"].includes(i.severity)).length), hint: "Prioridad", icon: ShieldAlert },
      ]} />
      <InlineNotice title="¿Alerta o incidencia?">Las alertas (stock, vencimientos, calibración) las genera el sistema automáticamente en el módulo Alertas. Aquí registras manualmente lo que ocurre en el laboratorio: accidentes, daños, derrames, hallazgos u observaciones.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "open", label: "Abiertas" }, { key: "all", label: "Todas" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          <SimpleTable
            columns={[{ key: "code", label: "Código" }, { key: "title", label: "Incidencia" }, { key: "category", label: "Tipo" }, { key: "severity", label: "Severidad" }, { key: "status", label: "Estado" }, { key: "assigned", label: "Responsable" }, { key: "created", label: "Creada" }]}
            rows={rows}
            onRowClick={(row) => { const found = incidents.find((i) => i.id === row.id); if (found) setSelected(found); }}
            emptyTitle={pending ? "Módulo por activar" : "Sin incidencias"}
            emptyMessage={pending ? "Aplica la migración 0014 para comenzar a registrar incidencias." : "Registra la primera incidencia o hallazgo del laboratorio."}
          />
        </div>
      </article>

      {createOpen ? <IncidentModal onClose={() => setCreateOpen(false)} onSave={createIncident} /> : null}

      <ActionModal open={Boolean(selected)} title={selected ? `${selected.incident_code} · ${selected.title}` : "Incidencia"} description="Detalle y seguimiento de la incidencia." onClose={() => setSelected(null)}>
        {selected ? (
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Tipo</small><strong>{CATEGORY_LABEL[selected.category] ?? selected.category}</strong></div>
              <div><small>Severidad</small><strong><span className={`status-pill ${severityPill(selected.severity)}`}>{SEVERITY_LABEL[selected.severity] ?? selected.severity}</span></strong></div>
              <div><small>Estado</small><strong>{STATUS_LABEL[selected.status] ?? selected.status}</strong></div>
              <div><small>Responsable</small><strong>{selected.assigned_name ?? "Sin asignar"}</strong></div>
              {selected.location ? <div><small>Ubicación</small><strong>{selected.location}</strong></div> : null}
              {selected.occurred_at ? <div><small>Ocurrió</small><strong>{fmtDate(selected.occurred_at)}</strong></div> : null}
              {selected.description ? <div className="field-span-two"><small>Descripción</small><strong>{selected.description}</strong></div> : null}
              {selected.actions_taken ? <div className="field-span-two"><small>Acciones tomadas</small><strong>{selected.actions_taken}</strong></div> : null}
              {selected.resolution ? <div className="field-span-two"><small>Resolución</small><strong>{selected.resolution}</strong></div> : null}
            </div>
            {selected.related_type && relatedHref(selected.related_type) ? (
              <Link href={relatedHref(selected.related_type)!} className="secondary-button" style={{ marginTop: 12 }}><ExternalLink size={15} /> Abrir {RELATED_LABEL[selected.related_type] ?? "registro"} relacionado</Link>
            ) : null}
            {canManage ? (
              <footer className="modal-actions">
                {selected.status === "OPEN" ? <button type="button" className="secondary-button" onClick={() => void updateIncident(selected.id, { status: "IN_PROGRESS" })}>Marcar en proceso</button> : null}
                {!["RESOLVED", "CLOSED", "ARCHIVED"].includes(selected.status) ? <button type="button" className="primary-button" onClick={() => { const r = window.prompt("Resolución / cierre de la incidencia:") ?? ""; if (r.trim().length >= 3) void updateIncident(selected.id, { status: "RESOLVED", resolution: r }); else if (r !== "") showError("Describe la resolución (mínimo 3 caracteres)."); }}>Resolver</button> : <button type="button" className="secondary-button" onClick={() => void updateIncident(selected.id, { status: "ARCHIVED" })}>Archivar</button>}
              </footer>
            ) : null}
          </div>
        ) : null}
      </ActionModal>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function IncidentModal({ onClose, onSave }: Readonly<{ onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [relatedType, setRelatedType] = useState<"" | "EQUIPMENT" | "INVENTORY_ITEM" | "EDUCATIONAL_PRACTICE">("");
  const [options, setOptions] = useState<ResourceOption[]>([]);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!relatedType) { setOptions([]); return; }
    let active = true;
    setLoadingOpts(true);
    const url = relatedType === "EQUIPMENT" ? "/api/equipment" : relatedType === "INVENTORY_ITEM" ? "/api/inventory" : "/api/education/practices";
    void fetch(url).then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })).then((p: { data?: Array<Record<string, unknown>> }) => {
      if (!active) return;
      setOptions((p.data ?? []).filter((x) => x.id).map((x) => ({
        id: String(x.id),
        label: relatedType === "INVENTORY_ITEM" ? `${x.sku ?? ""} · ${x.name ?? ""}` : relatedType === "EDUCATIONAL_PRACTICE" ? `${x.practice_code ?? ""} · ${x.title ?? ""}` : `${x.code ?? ""} · ${x.name ?? ""}`,
      })));
      setLoadingOpts(false);
    });
    return () => { active = false; };
  }, [relatedType]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (title.length < 3) { setError("Escribe un título descriptivo."); return; }
    const occurredDate = String(data.get("occurred") ?? "");
    setSaving(true);
    const ok = await onSave({
      title,
      category: String(data.get("category") ?? "FINDING"),
      severity: String(data.get("severity") ?? "MEDIUM"),
      description: String(data.get("description") ?? "").trim() || undefined,
      location: String(data.get("location") ?? "").trim() || undefined,
      relatedType: relatedType || undefined,
      relatedId: relatedType ? (String(data.get("relatedId") ?? "") || undefined) : undefined,
      occurredAt: occurredDate ? new Date(`${occurredDate}T00:00`).toISOString() : undefined,
      actionsTaken: String(data.get("actions") ?? "").trim() || undefined,
    });
    setSaving(false);
    if (ok) return;
  }

  return (
    <ActionModal open title="Nueva incidencia o hallazgo" description="Registra lo ocurrido para asignarlo, darle seguimiento y cerrarlo." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título</span><input name="title" required minLength={3} placeholder="Derrame de reactivo en mesa 3" /></label>
          <label><span>Tipo</span>
            <select name="category" defaultValue="FINDING">
              <option value="ACCIDENT">Accidente</option>
              <option value="EQUIPMENT_DAMAGE">Daño de equipo</option>
              <option value="SPILL">Derrame</option>
              <option value="FINDING">Hallazgo</option>
              <option value="DEVIATION">Desviación</option>
              <option value="NONCOMPLIANCE">Incumplimiento</option>
              <option value="OTHER">Otro</option>
            </select>
          </label>
          <label><span>Severidad</span>
            <select name="severity" defaultValue="MEDIUM"><option value="LOW">Baja</option><option value="MEDIUM">Media</option><option value="HIGH">Alta</option><option value="CRITICAL">Crítica</option></select>
          </label>
          <label><span>Ubicación</span><input name="location" placeholder="Laboratorio A · Mesa 3" /></label>
          <label><span>Fecha del hecho</span><input name="occurred" type="date" /></label>
          <label><span>Relacionado con</span>
            <select value={relatedType} onChange={(e) => setRelatedType(e.target.value as typeof relatedType)}>
              <option value="">Nada</option>
              <option value="EQUIPMENT">Equipo</option>
              <option value="INVENTORY_ITEM">Inventario</option>
              <option value="EDUCATIONAL_PRACTICE">Práctica</option>
            </select>
          </label>
          {relatedType ? (
            <label><span>Registro</span>
              <select name="relatedId" disabled={loadingOpts}>
                <option value="">{loadingOpts ? "Cargando…" : options.length ? "Selecciona…" : "Sin registros"}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field-span-two"><span>Descripción</span><textarea name="description" rows={3} placeholder="Qué ocurrió, cómo y quiénes estuvieron involucrados…" /></label>
          <label className="field-span-two"><span>Acciones tomadas (opcional)</span><textarea name="actions" rows={2} placeholder="Contención inmediata, limpieza, notificaciones…" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Registrar incidencia"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}
