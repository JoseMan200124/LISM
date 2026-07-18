"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, CheckCircle2, ClipboardCheck, FileDown, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import { formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

type AuditRow = {
  id: string;
  action: string;
  action_label: string;
  module: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string;
  actor_email: string | null;
  previous_value: unknown;
  new_value: unknown;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
};

type RestoreRow = {
  id: string;
  status: string;
  quantity: string | number;
  reason: string;
  sku: string;
  item_name: string;
  unit: string;
  item_status: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  discarded_at: string | null;
  discard_note: string | null;
  created_at: string;
};

const RESTORE_STATUS_LABEL: Record<string, string> = { PENDING: "Pendiente", APPROVED: "Aprobada", REJECTED: "Rechazada" };

function shortJson(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

export function AuditCenter({ session }: Readonly<{ session?: UserSession }>) {
  const canReview = session ? hasPermission(session, "configuration.manage") : false;
  const [tab, setTab] = useState("log");
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [restores, setRestores] = useState<RestoreRow[]>([]);
  const [restoresPending, setRestoresPending] = useState(false);
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [reviewing, setReviewing] = useState<RestoreRow | null>(null);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [aRes, rRes] = await Promise.all([fetch("/api/audit"), fetch("/api/inventory/restore-requests")]);
      if (!aRes.ok) { setState("error"); return; }
      const aData = await aRes.json() as { data?: AuditRow[] };
      setRows(aData.data ?? []);
      if (rRes.ok) {
        const rData = await rRes.json() as { data?: RestoreRow[]; mode?: string };
        setRestores(rData.data ?? []);
        setRestoresPending(rData.mode === "pending-migration");
      }
      setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const modules = useMemo(() => [...new Set(rows.map((row) => row.module))].sort((a, b) => a.localeCompare(b, "es")), [rows]);
  const shown = moduleFilter === "ALL" ? rows : rows.filter((row) => row.module === moduleFilter);

  const tableRows: TableRow[] = shown.map((row) => ({
    id: row.id,
    when: formatDateTime(row.created_at),
    actor: row.actor_name,
    module: row.module,
    action: row.action_label,
    reason: row.reason ?? "—",
  }));

  async function exportExcel() {
    setExporting(true);
    try {
      const response = await fetch("/api/audit?format=xlsx");
      if (!response.ok) { showError("No se pudo generar el archivo de Excel."); return; }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `nexalab-bitacora-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast("Bitácora exportada a Excel.");
    } catch {
      showError("No se pudo generar el archivo de Excel.");
    } finally {
      setExporting(false);
    }
  }

  async function reviewRestore(id: string, action: "APPROVE" | "REJECT", note: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/inventory/restore-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      if (response.ok) {
        showToast(action === "APPROVE" ? "Recuperación aprobada: la existencia regresó al inventario." : "Solicitud rechazada.");
        setReviewing(null);
        await load();
      } else {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        showError(payload.message ?? "No se pudo revisar la solicitud.");
      }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  function submitReview(event: FormEvent<HTMLFormElement>, action: "APPROVE" | "REJECT") {
    event.preventDefault();
    if (!reviewing) return;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    void reviewRestore(reviewing.id, action, note);
  }

  // Un evento de descarte guarda el movementId en su valor nuevo: desde ahí se
  // solicita la recuperación (queda pendiente de aprobación del administrador).
  function discardMovementId(row: AuditRow | null): string | null {
    if (!row || row.action !== "INVENTORY_ITEM_DISCARDED") return null;
    const value = row.new_value as { movementId?: unknown } | null;
    return value?.movementId ? String(value.movementId) : null;
  }

  async function requestRestore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const movementId = discardMovementId(selected);
    if (!movementId) return;
    const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
    if (reason.length < 3) { showError("Describe por qué debe recuperarse este descarte."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/inventory/restore-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movementId, reason }),
      });
      if (response.ok) {
        showToast("Solicitud de recuperación enviada. Un administrador debe aprobarla.");
        setSelected(null);
        setTab("restores");
        await load();
      } else {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        showError(payload.message ?? "No se pudo crear la solicitud.");
      }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setBusy(false); }
  }

  const pendingRestores = restores.filter((row) => row.status === "PENDING");

  if (state === "loading") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="TRAZABILIDAD INMUTABLE" title="Bitácora" description="Acciones reales del laboratorio: responsable, módulo, cambio, motivo y momento exacto." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={6} cols={5} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="TRAZABILIDAD INMUTABLE" title="Bitácora" description="Acciones reales del laboratorio: responsable, módulo, cambio, motivo y momento exacto." />
        <ErrorState description="No se pudo cargar la bitácora. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="TRAZABILIDAD INMUTABLE" title="Bitácora" description="Acciones reales del laboratorio: responsable, módulo, cambio, motivo y momento exacto.">
        <button className="secondary-button" onClick={() => void load()}><RefreshCw size={15} /> Actualizar</button>
        <button className="primary-button" onClick={() => void exportExcel()} disabled={exporting || rows.length === 0}>
          <FileDown size={15} /> {exporting ? "Generando…" : "Exportar a Excel"}
        </button>
      </PageIntro>
      <StatGrid items={[
        { label: "Eventos registrados", value: String(rows.length), hint: "Registro solo anexado", icon: ShieldCheck },
        { label: "Módulos con actividad", value: String(modules.length), hint: modules.slice(0, 3).join(" · ") || "Sin actividad", icon: ClipboardCheck },
        { label: "Recuperaciones pendientes", value: String(pendingRestores.length), hint: canReview ? "Requieren tu aprobación" : "En revisión", icon: Undo2 },
      ]} />
      <InlineNotice title="Registro protegido">La bitácora no puede editarse ni borrarse. Cada fila indica el módulo donde ocurrió el cambio, el valor anterior, el nuevo y el motivo.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "log", label: "Bitácora" }, { key: "restores", label: `Recuperaciones${pendingRestores.length ? ` (${pendingRestores.length})` : ""}` }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "log" ? (
            <section>
              <div className="section-heading">
                <div><h2>Acciones registradas</h2><p>Haz clic en una fila para ver el detalle del cambio.</p></div>
              </div>
              <div className="filter-chip-row" role="group" aria-label="Filtrar por módulo">
                <button type="button" className={`filter-chip${moduleFilter === "ALL" ? " filter-chip-active" : ""}`} onClick={() => setModuleFilter("ALL")}>Todos</button>
                {modules.map((moduleName) => (
                  <button key={moduleName} type="button" className={`filter-chip${moduleFilter === moduleName ? " filter-chip-active" : ""}`} onClick={() => setModuleFilter(moduleName)}>{moduleName}</button>
                ))}
              </div>
              <SimpleTable
                columns={[{ key: "when", label: "Momento" }, { key: "actor", label: "Usuario" }, { key: "module", label: "Módulo" }, { key: "action", label: "Acción" }, { key: "reason", label: "Motivo" }]}
                rows={tableRows}
                onRowClick={(row) => { const found = rows.find((r) => r.id === row.id); if (found) setSelected(found); }}
                searchPlaceholder="Buscar por usuario, acción o motivo…"
                emptyTitle="Sin eventos registrados"
                emptyMessage="Las acciones del laboratorio aparecerán aquí conforme se registren."
              />
            </section>
          ) : null}
          {tab === "restores" ? (
            <section>
              <div className="section-heading">
                <div><h2>Recuperación de descartes</h2><p>{canReview ? "Aprueba o rechaza las solicitudes: aprobar regresa la cantidad descartada al inventario." : "Estado de tus solicitudes de recuperación de descartes."}</p></div>
              </div>
              {restoresPending ? <InlineNotice title="Función por activar">Las recuperaciones estarán disponibles al aplicar la actualización de base de datos (migración 0017).</InlineNotice> : null}
              <SimpleTable
                columns={[{ key: "item", label: "Artículo" }, { key: "quantity", label: "Cantidad" }, { key: "requested", label: "Solicitada por" }, { key: "reason", label: "Motivo" }, { key: "status", label: "Estado" }, { key: "when", label: "Fecha" }]}
                rows={restores.map((row) => ({
                  id: row.id,
                  item: `${row.sku} · ${row.item_name}`,
                  quantity: `${row.quantity} ${row.unit ?? ""}`.trim(),
                  requested: row.requested_by_name ?? "—",
                  reason: row.reason,
                  status: RESTORE_STATUS_LABEL[row.status] ?? row.status,
                  when: formatDateTime(row.created_at),
                }))}
                onRowClick={(row) => { const found = restores.find((r) => r.id === row.id); if (found) setReviewing(found); }}
                emptyTitle="Sin solicitudes"
                emptyMessage="Cuando alguien solicite recuperar un descarte hecho por error, aparecerá aquí."
              />
            </section>
          ) : null}
        </div>
      </article>

      <ActionModal open={Boolean(selected)} title={selected?.action_label ?? "Evento"} description={`${selected?.module ?? ""} · ${selected ? formatDateTime(selected.created_at) : ""}`} onClose={() => setSelected(null)}>
        {selected ? (
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Usuario</small><strong>{selected.actor_name}</strong></div>
              <div><small>Correo</small><strong>{selected.actor_email ?? "—"}</strong></div>
              <div><small>Módulo</small><strong>{selected.module}</strong></div>
              <div><small>Registro</small><strong>{selected.entity_id ?? "—"}</strong></div>
              {selected.reason ? <div className="field-span-two"><small>Motivo</small><strong>{selected.reason}</strong></div> : null}
              <div className="field-span-two"><small>Valor anterior</small><strong>{shortJson(selected.previous_value)}</strong></div>
              <div className="field-span-two"><small>Valor nuevo</small><strong>{shortJson(selected.new_value)}</strong></div>
              {selected.ip_address ? <div><small>Origen (IP)</small><strong>{selected.ip_address}</strong></div> : null}
            </div>
            {discardMovementId(selected) ? (
              <form onSubmit={(event) => void requestRestore(event)}>
                <p className="form-section-title">¿Descarte por error?</p>
                <label><span>Motivo de la recuperación</span><textarea name="reason" required minLength={3} rows={2} placeholder="Explica por qué debe regresar al inventario…" /></label>
                <footer className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cerrar</button>
                  <button type="submit" className="primary-button" disabled={busy}><Undo2 size={15} /> {busy ? "Enviando…" : "Solicitar recuperación"}</button>
                </footer>
              </form>
            ) : (
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setSelected(null)}>Cerrar</button></footer>
            )}
          </div>
        ) : null}
      </ActionModal>

      <ActionModal open={Boolean(reviewing)} title={reviewing ? `${reviewing.sku} · ${reviewing.item_name}` : "Solicitud"} description="Detalle de la solicitud de recuperación de descarte." onClose={() => setReviewing(null)}>
        {reviewing ? (
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Cantidad a recuperar</small><strong>{reviewing.quantity} {reviewing.unit}</strong></div>
              <div><small>Estado</small><strong>{RESTORE_STATUS_LABEL[reviewing.status] ?? reviewing.status}</strong></div>
              <div><small>Solicitada por</small><strong>{reviewing.requested_by_name ?? "—"}</strong></div>
              <div><small>Descartado el</small><strong>{formatDateTime(reviewing.discarded_at)}</strong></div>
              <div className="field-span-two"><small>Motivo de la solicitud</small><strong>{reviewing.reason}</strong></div>
              {reviewing.discard_note ? <div className="field-span-two"><small>Nota del descarte original</small><strong>{reviewing.discard_note}</strong></div> : null}
              {reviewing.review_note ? <div className="field-span-two"><small>Nota de revisión</small><strong>{reviewing.review_note}</strong></div> : null}
              {reviewing.reviewed_by_name ? <div><small>Revisada por</small><strong>{reviewing.reviewed_by_name}</strong></div> : null}
            </div>
            {canReview && reviewing.status === "PENDING" ? (
              <form onSubmit={(event) => submitReview(event, "APPROVE")}>
                <label><span>Nota de revisión (opcional)</span><textarea name="note" rows={2} placeholder="Comentario para la bitácora…" /></label>
                <footer className="modal-actions">
                  <button type="button" className="secondary-button" disabled={busy} onClick={(event) => {
                    const form = (event.currentTarget as HTMLButtonElement).closest("form");
                    const note = String(new FormData(form!).get("note") ?? "").trim();
                    void reviewRestore(reviewing.id, "REJECT", note);
                  }}>Rechazar</button>
                  <button type="submit" className="primary-button" disabled={busy}><CheckCircle2 size={15} /> {busy ? "Aplicando…" : "Aprobar y regresar al inventario"}</button>
                </footer>
              </form>
            ) : (
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setReviewing(null)}><Archive size={15} /> Cerrar</button></footer>
            )}
          </div>
        ) : null}
      </ActionModal>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}
