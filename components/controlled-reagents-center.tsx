"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Clock, Download, Lock, PackageSearch, Send, ShieldCheck } from "lucide-react";
import { ActionModal, Toast, downloadCsv, useToast } from "@/components/action-kit";
import { formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";
import {
  AUTHORIZATION_STATE_MESSAGE,
  CONTROLLED_REQUEST_STATUS_LABEL,
  CONTROL_KIND_LABEL,
  DEFAULT_CONTROLLED_POLICY,
  authorizationState,
  authorizedQuantity,
  type AuthorizationState,
  type ControlledUsagePolicy,
} from "@/lib/controlled-reagents";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import { GhsPictogramRow } from "@/components/ghs-pictogram";
import { normalizePictograms } from "@/lib/ghs";
import { SafetyButton, type SafetyItem } from "@/components/reagent-safety";
import {
  DisposalsTab,
  PermitsTab,
  PhysicalCountsTab,
  ReagentCatalogTab,
  ReceiptsTab,
} from "@/components/compliance/reagent-compliance";
import { ReagentReports } from "@/components/compliance/reagent-reports";

/** Pestañas del módulo: consumo controlado y todo el expediente regulatorio. */
type ControlledTab = "registry" | "authorizations" | "catalog" | "receipts" | "permits" | "counts" | "disposals" | "reports";

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Entrada", CONSUMPTION: "Consumo", ADJUSTMENT: "Ajuste", DISPOSAL: "Descarte", TRANSFER: "Transferencia", RETURN: "Devolución",
};

type ControlledRow = {
  id: string; sku: string; name: string; item_type: string; control_kind: string | null;
  quantity: number | string; unit: string; category: string; location: string; status: string;
  last_consumption_at: string | null; total_consumed: number | string; consumption_count: number | string;
  pending_requests?: number | string;
  hazard_pictograms?: unknown; hazard_statements?: string | null; safety_procedures?: unknown;
  safety_sheet_url?: string | null; storage_conditions?: string | null;
};

type ControlledMovement = {
  id: string; movement_type: string; quantity_delta: number | string;
  previous_quantity: number | string | null; resulting_quantity: number | string | null;
  reason_code: string | null; note: string | null; usage_area: string | null; usage_purpose: string | null;
  used_by_person: string | null; authorized_by: string | null; performed_at: string; performed_by: string | null;
  authorization_code?: string | null;
};

type UsageRequest = {
  id: string; request_code: string; inventory_item_id: string; status: string;
  quantity: number | string; unit: string; approved_quantity: number | string | null;
  used_by_person: string; usage_area: string; usage_purpose: string;
  planned_for: string | null; notes: string | null;
  expires_at: string | null; review_note: string | null; reviewed_at: string | null;
  consumed_at: string | null; consumed_quantity: number | string | null; created_at: string;
  requested_by: string; requested_by_name: string | null; reviewed_by_name: string | null;
  sku?: string; item_name?: string; control_kind?: string | null; item_quantity?: number | string; item_unit?: string;
};

type ControlledDetail = ControlledRow & { movements: ControlledMovement[]; requests?: UsageRequest[] };

function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "Controlado";
  return CONTROL_KIND_LABEL[kind as keyof typeof CONTROL_KIND_LABEL] ?? "Controlado";
}

// Etiqueta visible del estado: una autorización aprobada pero vencida se
// muestra como "Vencida", no como "Autorizada".
function requestStateLabel(request: UsageRequest): string {
  const state = authorizationState(request);
  if (state === "EXPIRED") return "Vencida";
  return CONTROLLED_REQUEST_STATUS_LABEL[request.status as keyof typeof CONTROLLED_REQUEST_STATUS_LABEL] ?? request.status;
}

function requestQuantityLabel(request: UsageRequest): string {
  const approved = authorizedQuantity(request);
  const requested = Number(request.quantity);
  const unit = request.unit ?? "";
  if (approved !== requested) return `${approved} ${unit} (de ${requested} solicitados)`.trim();
  return `${requested} ${unit}`.trim();
}

export function ControlledReagentsCenter({ session }: Readonly<{ session?: UserSession }>) {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [tab, setTab] = useState<ControlledTab>("registry");
  const [pendingMigration, setPendingMigration] = useState(false);
  const [rows, setRows] = useState<ControlledRow[]>([]);
  const [requests, setRequests] = useState<UsageRequest[]>([]);
  const [canAuthorize, setCanAuthorize] = useState(false);
  const [canRequest, setCanRequest] = useState(false);
  const [policy, setPolicy] = useState<ControlledUsagePolicy>(DEFAULT_CONTROLLED_POLICY);
  const [detail, setDetail] = useState<ControlledDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newRequestOpen, setNewRequestOpen] = useState(false);
  const [activeRequest, setActiveRequest] = useState<UsageRequest | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const canManagePolicy = Boolean(session && hasPermission(session, "configuration.manage"));

  const loadRequests = useCallback(async () => {
    try {
      const response = await fetch("/api/inventory/controlled/requests");
      if (!response.ok) return;
      const payload = await response.json() as {
        data?: UsageRequest[]; canAuthorize?: boolean; canRequest?: boolean;
        policy?: ControlledUsagePolicy | null; mode?: string;
      };
      setRequests(payload.data ?? []);
      setCanAuthorize(Boolean(payload.canAuthorize));
      setCanRequest(Boolean(payload.canRequest));
      setPolicy(payload.policy ?? DEFAULT_CONTROLLED_POLICY);
      if (payload.mode === "pending-migration") setPendingMigration(true);
    } catch {
      // El registro sigue siendo utilizable aunque falle la carga de solicitudes.
    }
  }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/inventory/controlled");
      if (!response.ok) { setState("error"); return; }
      const payload = await response.json() as { data?: ControlledRow[]; mode?: string };
      if (payload.mode === "pending-migration") setPendingMigration(true);
      setRows(payload.data ?? []);
      setState("ready");
    } catch {
      setState("error");
      return;
    }
    await loadRequests();
  }, [loadRequests]);

  useEffect(() => { void load(); }, [load]);

  // Enlace profundo desde las notificaciones: ?tab=authorizations&requestId=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    // Las notificaciones enlazan a la pestaña concreta (?tab=permits, …).
    const valid: ControlledTab[] = ["registry", "authorizations", "catalog", "receipts", "permits", "counts", "disposals", "reports"];
    if (requested && valid.includes(requested as ControlledTab)) setTab(requested as ControlledTab);
    const requestId = params.get("requestId");
    if (!requestId) return;
    const found = requests.find((request) => request.id === requestId);
    if (found) { setTab("authorizations"); setActiveRequest(found); }
  }, [requests]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/inventory/controlled?itemId=${encodeURIComponent(id)}`);
      if (response.ok) {
        const payload = await response.json() as { data?: ControlledDetail };
        setDetail(payload.data ?? null);
      } else {
        showError("No se pudo cargar el historial del reactivo controlado.");
      }
    } catch {
      showError("No se pudo cargar el historial del reactivo controlado.");
    } finally {
      setDetailLoading(false);
    }
  }

  const registryRows = useMemo<TableRow[]>(() => rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    kind: kindLabel(row.control_kind),
    hazards: normalizePictograms(row.hazard_pictograms).join(","),
    category: row.category,
    quantity: `${row.quantity ?? 0} ${row.unit ?? ""}`.trim(),
    pending: Number(row.pending_requests ?? 0) > 0 ? `${row.pending_requests} por autorizar` : "—",
    consumptions: String(row.consumption_count ?? 0),
    last: row.last_consumption_at ? formatDateTime(row.last_consumption_at) : "—",
    status: row.status === "ARCHIVED" ? "Archivado" : "Activo",
  })), [rows]);

  const requestRows = useMemo<TableRow[]>(() => requests.map((request) => ({
    id: request.id,
    code: request.request_code,
    name: `${request.sku ? `${request.sku} · ` : ""}${request.item_name ?? ""}`.trim() || "—",
    quantity: requestQuantityLabel(request),
    person: request.used_by_person,
    area: request.usage_area,
    requester: request.requested_by_name ?? "—",
    status: requestStateLabel(request),
    created: formatDateTime(request.created_at),
  })), [requests]);

  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const usableRequests = requests.filter((request) => authorizationState(request) === "USABLE");
  const totalConsumptions = rows.reduce((sum, row) => sum + Number(row.consumption_count ?? 0), 0);

  function exportRequests() {
    downloadCsv(
      "autorizaciones-reactivos-controlados.csv",
      requests.map((request) => ({
        folio: request.request_code,
        reactivo: `${request.sku ?? ""} ${request.item_name ?? ""}`.trim(),
        estado: requestStateLabel(request),
        solicitado: `${request.quantity} ${request.unit ?? ""}`.trim(),
        autorizado: request.approved_quantity !== null && request.approved_quantity !== undefined ? `${request.approved_quantity} ${request.unit ?? ""}`.trim() : "",
        usara: request.used_by_person,
        area_proyecto: request.usage_area,
        finalidad: request.usage_purpose,
        solicita: request.requested_by_name ?? "",
        solicitada_el: formatDateTime(request.created_at),
        autoriza: request.reviewed_by_name ?? "",
        resuelta_el: request.reviewed_at ? formatDateTime(request.reviewed_at) : "",
        vigencia: request.expires_at ? formatDateTime(request.expires_at) : "",
        consumida_el: request.consumed_at ? formatDateTime(request.consumed_at) : "",
        consumido: request.consumed_quantity !== null && request.consumed_quantity !== undefined ? String(request.consumed_quantity) : "",
        observaciones: request.notes ?? "",
        nota_responsable: request.review_note ?? "",
      })),
      [
        { key: "folio", label: "Folio" },
        { key: "reactivo", label: "Reactivo" },
        { key: "estado", label: "Estado" },
        { key: "solicitado", label: "Solicitado" },
        { key: "autorizado", label: "Autorizado" },
        { key: "usara", label: "Quién lo usa" },
        { key: "area_proyecto", label: "Área / proyecto" },
        { key: "finalidad", label: "Finalidad" },
        { key: "solicita", label: "Solicita" },
        { key: "solicitada_el", label: "Solicitada el" },
        { key: "autoriza", label: "Autoriza" },
        { key: "resuelta_el", label: "Resuelta el" },
        { key: "vigencia", label: "Vigente hasta" },
        { key: "consumida_el", label: "Consumida el" },
        { key: "consumido", label: "Cantidad consumida" },
        { key: "observaciones", label: "Observaciones" },
        { key: "nota_responsable", label: "Nota del responsable" },
      ],
    );
  }

  const intro = (
    <PageIntro
      eyebrow="CONTROL REGULATORIO"
      title="Registro de reactivos controlados"
      description="Reactivos de doble uso o precursores: solicita el uso, recibe la autorización del responsable y registra el consumo sin papeles, con trazabilidad completa para controles internos y revisiones del ministerio o entidad reguladora."
    />
  );

  if (state === "loading") {
    return <div className="page-stack">{intro}<SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={9} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }
  if (state === "error") {
    return <div className="page-stack">{intro}<ErrorState description="No se pudo cargar el registro de reactivos controlados. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }

  return (
    <div className="page-stack">
      {intro}
      <StatGrid items={[
        { label: "Por autorizar", value: String(pendingRequests.length), hint: canAuthorize ? "Esperan tu autorización" : "Solicitudes en revisión", icon: Clock },
        { label: "Autorizaciones vigentes", value: String(usableRequests.length), hint: "Listas para consumir", icon: ClipboardCheck },
        { label: "Consumos registrados", value: String(totalConsumptions), hint: "Con trazabilidad completa", icon: PackageSearch },
      ]} />

      <div className="section-heading">
        <Tabs
          items={[
            { key: "registry", label: "Registro de reactivos" },
            { key: "authorizations", label: pendingRequests.length > 0 ? `Autorizaciones (${pendingRequests.length})` : "Autorizaciones" },
            { key: "catalog", label: "Catálogo" },
            { key: "receipts", label: "Entradas" },
            { key: "permits", label: "Licencias" },
            { key: "counts", label: "Inventario físico" },
            { key: "disposals", label: "Destrucción" },
            { key: "reports", label: "Reportes" },
          ]}
          active={tab}
          onChange={(key) => setTab(key as ControlledTab)}
        />
        {canRequest && rows.length > 0 ? (
          <button type="button" className="primary-button" onClick={() => setNewRequestOpen(true)}>
            <Send size={15} /> Solicitar uso
          </button>
        ) : null}
      </div>

      {pendingMigration ? (
        <InlineNotice title="Actualización de base de datos pendiente">
          La autorización digital de reactivos de doble uso o precursores estará disponible en cuanto se aplique la actualización de base de datos (migración 0020).
        </InlineNotice>
      ) : null}

      {tab === "catalog" ? <ReagentCatalogTab session={session} /> : null}
      {tab === "receipts" ? <ReceiptsTab session={session} /> : null}
      {tab === "permits" ? <PermitsTab session={session} /> : null}
      {tab === "counts" ? <PhysicalCountsTab session={session} /> : null}
      {tab === "disposals" ? <DisposalsTab session={session} /> : null}
      {tab === "reports" ? <ReagentReports session={session} /> : null}

      {tab === "registry" ? (
        <>
          <InlineNotice title="Trazabilidad obligatoria">
            Todo consumo de un reactivo de doble uso o precursor queda registrado con qué se usó, cuánto, cuándo, quién lo usó y para qué.{" "}
            {policy.requirePreapproval
              ? "El consumo requiere la autorización previa del responsable, que se pide y se otorga desde este módulo: ya no hace falta llenar una hoja ni llevarla físicamente."
              : "La autorización previa está desactivada en este laboratorio: el consumo solo exige el registro de trazabilidad."}
          </InlineNotice>
          <article className="panel configuration-panel">
            <div className="configuration-body">
              <section>
                <div className="section-heading">
                  <div><h2>Reactivos marcados como controlados</h2><p>Haz clic en un reactivo para ver su historial completo de movimientos, consumos y autorizaciones.</p></div>
                </div>
                <SimpleTable
                  columns={[
                    { key: "sku", label: "Código" },
                    { key: "name", label: "Reactivo" },
                    { key: "kind", label: "Control" },
                    { key: "hazards", label: "Peligros" },
                    { key: "category", label: "Categoría" },
                    { key: "quantity", label: "Existencia" },
                    { key: "pending", label: "Solicitudes" },
                    { key: "consumptions", label: "Consumos" },
                    { key: "last", label: "Último consumo" },
                    { key: "status", label: "Estado" },
                  ]}
                  rows={registryRows}
                  onRowClick={(row) => { if (row.id) void openDetail(String(row.id)); }}
                  searchPlaceholder="Buscar reactivo controlado…"
                  emptyTitle="Sin reactivos controlados"
                  emptyMessage="Marca un reactivo como de doble uso o precursor al registrarlo o editarlo en Inventario para que aparezca aquí."
                />
              </section>
            </div>
          </article>
        </>
      ) : (
        <>
          <InlineNotice title="Autorización sin papeles">
            {canAuthorize
              ? "Cada solicitud llega aquí y a tus notificaciones. Al autorizarla, la persona puede registrar el consumo en un clic durante la vigencia que definas; el sistema conserva el folio, la hora y tu nombre como responsable."
              : "Envía tu solicitud y el responsable la recibe al instante. Cuando la autorice te llega la notificación y podrás registrar el consumo en un clic, sin llenar nada más."}
          </InlineNotice>
          {canManagePolicy ? <PolicyPanel policy={policy} onSaved={(next) => { setPolicy(next); showToast("Política de reactivos controlados actualizada."); }} onError={showError} /> : null}
          <article className="panel configuration-panel">
            <div className="configuration-body">
              <section>
                <div className="section-heading">
                  <div>
                    <h2>{canAuthorize ? "Solicitudes de uso del laboratorio" : "Mis solicitudes de uso"}</h2>
                    <p>Haz clic en una solicitud para ver el comprobante completo y actuar sobre ella.</p>
                  </div>
                  {requests.length > 0 ? <button type="button" className="secondary-button" onClick={exportRequests}><Download size={15} /> Exportar CSV</button> : null}
                </div>
                <SimpleTable
                  columns={[
                    { key: "code", label: "Folio" },
                    { key: "name", label: "Reactivo" },
                    { key: "quantity", label: "Cantidad" },
                    { key: "person", label: "Quién lo usa" },
                    { key: "area", label: "Área / proyecto" },
                    { key: "requester", label: "Solicita" },
                    { key: "status", label: "Estado" },
                    { key: "created", label: "Solicitada" },
                  ]}
                  rows={requestRows}
                  onRowClick={(row) => {
                    const found = requests.find((request) => request.id === String(row.id));
                    if (found) setActiveRequest(found);
                  }}
                  searchPlaceholder="Buscar por folio, reactivo o persona…"
                  emptyTitle="Sin solicitudes de uso"
                  emptyMessage={canRequest ? "Usa “Solicitar uso” para pedir la autorización de un reactivo controlado." : "Todavía no hay solicitudes de autorización registradas."}
                />
              </section>
            </div>
          </article>
        </>
      )}

      {newRequestOpen ? (
        <NewRequestModal
          items={rows.filter((row) => row.status !== "ARCHIVED")}
          onClose={() => setNewRequestOpen(false)}
          onDone={async (code) => {
            setNewRequestOpen(false);
            showToast(`Solicitud ${code} enviada al responsable del laboratorio.`);
            setTab("authorizations");
            await load();
          }}
          onError={showError}
        />
      ) : null}

      {activeRequest ? (
        <RequestModal
          request={activeRequest}
          canAuthorize={canAuthorize}
          isMine={Boolean(session && activeRequest.requested_by === session.userId)}
          defaultValidityHours={policy.validityHours}
          onClose={() => setActiveRequest(null)}
          onDone={async (text) => {
            setActiveRequest(null);
            showToast(text);
            await load();
          }}
          onError={showError}
        />
      ) : null}

      <ControlledDetailModal open={detailLoading || Boolean(detail)} loading={detailLoading} detail={detail} onClose={() => setDetail(null)} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// Política del laboratorio: exigir autorización previa y vigencia por defecto.
function PolicyPanel({ policy, onSaved, onError }: Readonly<{ policy: ControlledUsagePolicy; onSaved: (next: ControlledUsagePolicy) => void; onError: (message: string) => void }>) {
  const [requirePreapproval, setRequirePreapproval] = useState(policy.requirePreapproval);
  const [validityHours, setValidityHours] = useState(String(policy.validityHours));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRequirePreapproval(policy.requirePreapproval);
    setValidityHours(String(policy.validityHours));
  }, [policy]);

  const dirty = requirePreapproval !== policy.requirePreapproval || Number(validityHours) !== policy.validityHours;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/inventory/controlled/policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirePreapproval, validityHours: Number(validityHours) }),
      });
      const payload = await response.json() as { data?: ControlledUsagePolicy; message?: string };
      if (!response.ok) { onError(payload.message ?? "No se pudo guardar la política."); return; }
      onSaved(payload.data ?? { requirePreapproval, validityHours: Number(validityHours) });
    } catch {
      onError("No se pudo guardar la política. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="panel configuration-panel">
      <div className="configuration-body">
        <section>
          <div className="section-heading">
            <div><h2>Política de uso</h2><p>Define si el consumo de reactivos controlados exige la autorización del responsable y cuánto dura esa autorización.</p></div>
          </div>
          <div className="form-grid form-grid-two">
            <label className="checkbox-line field-span-two">
              <input type="checkbox" checked={requirePreapproval} onChange={(event) => setRequirePreapproval(event.target.checked)} />
              <span>Exigir autorización previa del responsable antes de consumir</span>
            </label>
            <label>
              <span>Vigencia de la autorización (horas)</span>
              <input type="number" min={1} max={720} step={1} value={validityHours} onChange={(event) => setValidityHours(event.target.value)} />
            </label>
            <p className="modal-note field-span-two">
              Quien puede crear y editar inventario (jefe de laboratorio o administrador) nunca queda bloqueado: su consumo se registra como autorizado en el acto por él mismo.
            </p>
          </div>
          <footer className="modal-actions">
            <button type="button" className="primary-button" disabled={!dirty || saving} onClick={() => void save()}>
              {saving ? "Guardando…" : "Guardar política"}
            </button>
          </footer>
        </section>
      </div>
    </article>
  );
}

// Formulario de solicitud: la versión digital de la hoja que antes se llenaba a
// mano y se llevaba al responsable.
function NewRequestModal({ items, onClose, onDone, onError }: Readonly<{
  items: ControlledRow[];
  onClose: () => void;
  onDone: (code: string) => void | Promise<void>;
  onError: (message: string) => void;
}>) {
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const selected = items.find((item) => item.id === itemId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const plannedRaw = String(data.get("plannedFor") ?? "").trim();
      const response = await fetch("/api/inventory/controlled/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: itemId,
          quantity: Number(data.get("quantity")),
          unit: selected?.unit,
          usedByPerson: String(data.get("usedByPerson") ?? "").trim(),
          usageArea: String(data.get("usageArea") ?? "").trim(),
          usagePurpose: String(data.get("usagePurpose") ?? "").trim(),
          plannedFor: plannedRaw ? new Date(plannedRaw).toISOString() : undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
          signaturePassword: String(data.get("signaturePassword") ?? ""),
        }),
      });
      const payload = await response.json() as { data?: { request_code?: string }; message?: string };
      if (!response.ok) { onError(payload.message ?? "No se pudo enviar la solicitud."); return; }
      await onDone(String(payload.data?.request_code ?? ""));
    } catch {
      onError("No se pudo enviar la solicitud. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal
      open
      title="Solicitar uso de reactivo controlado"
      description="Se envía al responsable del laboratorio para su autorización. Al aprobarla podrás registrar el consumo en un clic."
      onClose={onClose}
      wide
    >
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two">
            <span>Reactivo controlado *</span>
            <select name="inventoryItemId" required value={itemId} onChange={(event) => setItemId(event.target.value)}>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name} ({item.quantity} {item.unit} disponibles)
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Cantidad a usar * {selected ? <small>({selected.unit})</small> : null}</span>
            <input name="quantity" type="number" min="0.001" step="0.001" required max={selected ? Number(selected.quantity) : undefined} />
          </label>
          <label>
            <span>Fecha y hora prevista <small>(opcional)</small></span>
            <input name="plannedFor" type="datetime-local" />
          </label>
          <label>
            <span>Usuario/persona que lo utilizará *</span>
            <input name="usedByPerson" required placeholder="Nombre de quien lo usará" />
          </label>
          <label>
            <span>Área, laboratorio o proyecto *</span>
            <input name="usageArea" required placeholder="Ej. Laboratorio de Química / Proyecto síntesis" />
          </label>
          <label className="field-span-two">
            <span>Motivo o finalidad de uso *</span>
            <textarea name="usagePurpose" required rows={2} placeholder="Para qué se utilizará el reactivo" />
          </label>
          <label className="field-span-two">
            <span>Observaciones <small>(opcional)</small></span>
            <textarea name="notes" rows={2} />
          </label>
          {selected?.control_kind ? (
            <p className="modal-note field-span-two controlled-note">
              <Lock size={13} /> {kindLabel(selected.control_kind)}: la autorización y el consumo quedan en la bitácora con folio, hora y responsable.
            </p>
          ) : null}
          <label className="field-span-two">
            <span>Tu contraseña <small>(firma electrónica de la solicitud)</small></span>
            <input name="signaturePassword" type="password" autoComplete="current-password" minLength={8} required />
          </label>
          <p className="modal-note field-span-two">
            Al firmar quedas registrado como solicitante con fecha, hora y huella del contenido. Sustituye a tu firma en la hoja de papel.
          </p>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving || !itemId}>
            {saving ? "Enviando…" : "Firmar y enviar solicitud"}
          </button>
        </footer>
      </form>
    </ActionModal>
  );
}

// Comprobante de la autorización y acciones según estado y permisos.
function RequestModal({ request, canAuthorize, isMine, defaultValidityHours, onClose, onDone, onError }: Readonly<{
  request: UsageRequest;
  canAuthorize: boolean;
  isMine: boolean;
  defaultValidityHours: number;
  onClose: () => void;
  onDone: (message: string) => void | Promise<void>;
  onError: (message: string) => void;
}>) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "approve" | "reject" | "consume">("view");
  const state: AuthorizationState = authorizationState(request);
  const approved = authorizedQuantity(request);
  const unit = request.unit ?? "";

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/inventory/controlled/requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) { onError(payload.message ?? "No se pudo completar la acción."); return; }
      await onDone(successMessage);
    } catch {
      onError("No se pudo completar la acción. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  async function consume(quantity: number, note: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: request.inventory_item_id,
          movementType: "CONSUMPTION",
          quantity,
          unit: request.unit,
          reasonCode: `USO AUTORIZADO ${request.request_code}`,
          note,
          usageRequestId: request.id,
        }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) { onError(payload.message ?? "No se pudo registrar el consumo."); return; }
      await onDone(`Consumo registrado y descontado del inventario (folio ${request.request_code}).`);
    } catch {
      onError("No se pudo registrar el consumo. Intenta nuevamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionModal
      open
      title={`Autorización ${request.request_code}`}
      description={`${request.sku ? `${request.sku} · ` : ""}${request.item_name ?? "Reactivo controlado"}`}
      onClose={onClose}
      wide
    >
      <div className="modal-form">
        <div className="details-grid">
          <div><small>Estado</small><strong>{requestStateLabel(request)}</strong></div>
          <div><small>Cantidad</small><strong>{requestQuantityLabel(request)}</strong></div>
          <div><small>Quién lo usa</small><strong>{request.used_by_person}</strong></div>
          <div><small>Área / proyecto</small><strong>{request.usage_area}</strong></div>
          <div><small>Solicita</small><strong>{request.requested_by_name ?? "—"}</strong></div>
          <div><small>Solicitada el</small><strong>{formatDateTime(request.created_at)}</strong></div>
          {request.planned_for ? <div><small>Uso previsto</small><strong>{formatDateTime(request.planned_for)}</strong></div> : null}
          {request.reviewed_by_name ? <div><small>Autoriza</small><strong>{request.reviewed_by_name}</strong></div> : null}
          {request.reviewed_at ? <div><small>Resuelta el</small><strong>{formatDateTime(request.reviewed_at)}</strong></div> : null}
          {request.expires_at ? <div><small>Vigente hasta</small><strong>{formatDateTime(request.expires_at)}</strong></div> : null}
          {request.consumed_at ? <div><small>Consumida el</small><strong>{formatDateTime(request.consumed_at)}</strong></div> : null}
          {request.consumed_quantity !== null && request.consumed_quantity !== undefined ? <div><small>Cantidad consumida</small><strong>{String(request.consumed_quantity)} {unit}</strong></div> : null}
        </div>
        <div className="definition-list" style={{ marginTop: 12 }}>
          <article className="definition-row">
            <div><strong>Finalidad de uso</strong><p>{request.usage_purpose}</p></div>
          </article>
          {request.notes ? <article className="definition-row"><div><strong>Observaciones del solicitante</strong><p>{request.notes}</p></div></article> : null}
          {request.review_note ? <article className="definition-row"><div><strong>Nota del responsable</strong><p>{request.review_note}</p></div></article> : null}
        </div>

        {state !== "USABLE" && state !== "PENDING" ? (
          <p className="modal-note">{AUTHORIZATION_STATE_MESSAGE[state]}</p>
        ) : null}

        {mode === "approve" ? (
          <form
            className="form-grid form-grid-two"
            style={{ marginTop: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void act(
                {
                  action: "APPROVE",
                  approvedQuantity: Number(data.get("approvedQuantity")),
                  validityHours: Number(data.get("validityHours")),
                  note: String(data.get("note") ?? "").trim(),
                  signaturePassword: String(data.get("signaturePassword") ?? ""),
                },
                `Uso autorizado (folio ${request.request_code}). La persona ya puede registrar el consumo.`,
              );
            }}
          >
            <label><span>Cantidad autorizada * <small>({unit})</small></span><input name="approvedQuantity" type="number" min="0.001" step="0.001" max={Number(request.quantity)} required defaultValue={Number(request.quantity)} /></label>
            <label><span>Vigencia (horas) *</span><input name="validityHours" type="number" min={1} max={720} required defaultValue={defaultValidityHours} /></label>
            <label className="field-span-two"><span>Nota o condiciones <small>(opcional)</small></span><textarea name="note" rows={2} /></label>
            <label className="field-span-two">
              <span>Tu contraseña <small>(firma electrónica de la autorización)</small></span>
              <input name="signaturePassword" type="password" autoComplete="current-password" minLength={8} required />
            </label>
            <p className="modal-note field-span-two">Tu firma queda ligada a la cantidad autorizada y a su vigencia.</p>
            <footer className="modal-actions field-span-two">
              <button type="button" className="secondary-button" onClick={() => setMode("view")}>Volver</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Autorizando…" : "Firmar y autorizar"}</button>
            </footer>
          </form>
        ) : null}

        {mode === "reject" ? (
          <form
            className="form-grid"
            style={{ marginTop: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void act({ action: "REJECT", note: String(data.get("note") ?? "").trim() }, `Solicitud ${request.request_code} rechazada.`);
            }}
          >
            <label><span>Motivo del rechazo *</span><textarea name="note" rows={2} required minLength={3} placeholder="Queda en la trazabilidad y se notifica al solicitante" /></label>
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setMode("view")}>Volver</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Rechazando…" : "Confirmar rechazo"}</button>
            </footer>
          </form>
        ) : null}

        {mode === "consume" ? (
          <form
            className="form-grid form-grid-two"
            style={{ marginTop: 12 }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void consume(Number(data.get("quantity")), String(data.get("note") ?? "").trim());
            }}
          >
            <p className="modal-note field-span-two">
              La trazabilidad ya está capturada en esta autorización: no necesitas volver a escribirla. Solo confirma la cantidad realmente consumida.
            </p>
            <label><span>Cantidad consumida * <small>({unit})</small></span><input name="quantity" type="number" min="0.001" step="0.001" max={approved} required defaultValue={approved} /></label>
            <label><span>Observaciones <small>(opcional)</small></span><input name="note" /></label>
            <footer className="modal-actions field-span-two">
              <button type="button" className="secondary-button" onClick={() => setMode("view")}>Volver</button>
              <button type="submit" className="primary-button" disabled={busy}>{busy ? "Registrando…" : "Registrar consumo"}</button>
            </footer>
          </form>
        ) : null}

        {mode === "view" ? (
          <footer className="modal-actions">
            <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
            {(isMine || canAuthorize) && (request.status === "PENDING" || (request.status === "APPROVED" && !request.consumed_at)) ? (
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void act({ action: "CANCEL", note: "" }, `Solicitud ${request.request_code} cancelada.`)}>
                Cancelar solicitud
              </button>
            ) : null}
            {canAuthorize && request.status === "PENDING" ? (
              <>
                <button type="button" className="secondary-button" onClick={() => setMode("reject")}>Rechazar</button>
                <button type="button" className="primary-button" onClick={() => setMode("approve")}><ShieldCheck size={15} /> Autorizar</button>
              </>
            ) : null}
            {state === "USABLE" && (isMine || canAuthorize) ? (
              <button type="button" className="primary-button" onClick={() => setMode("consume")}>
                <CheckCircle2 size={15} /> Registrar consumo
              </button>
            ) : null}
          </footer>
        ) : null}
      </div>
    </ActionModal>
  );
}

function ControlledDetailModal({ open, loading, detail, onClose }: Readonly<{ open: boolean; loading: boolean; detail: ControlledDetail | null; onClose: () => void }>) {
  if (!open) return null;
  const movements = detail?.movements ?? [];
  const requests = detail?.requests ?? [];
  const consumptions = movements.filter((m) => Number(m.quantity_delta) < 0);

  function exportLog() {
    if (!detail) return;
    downloadCsv(
      `reactivo-controlado-${detail.sku}.csv`,
      movements.map((m) => ({
        fecha: formatDateTime(m.performed_at),
        tipo: MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type,
        cantidad: String(m.quantity_delta),
        saldo_antes: m.previous_quantity ?? "",
        saldo_despues: m.resulting_quantity ?? "",
        uso_persona: m.used_by_person ?? "",
        area_proyecto: m.usage_area ?? "",
        finalidad: m.usage_purpose ?? "",
        autoriza: m.authorized_by ?? "",
        folio: m.authorization_code ?? "",
        registro: m.performed_by ?? "",
        observaciones: m.note ?? "",
      })),
      [
        { key: "fecha", label: "Fecha y hora" },
        { key: "tipo", label: "Tipo" },
        { key: "cantidad", label: "Cantidad" },
        { key: "saldo_antes", label: "Saldo antes" },
        { key: "saldo_despues", label: "Saldo después" },
        { key: "uso_persona", label: "Usó" },
        { key: "area_proyecto", label: "Área / proyecto" },
        { key: "finalidad", label: "Finalidad" },
        { key: "autoriza", label: "Autoriza" },
        { key: "folio", label: "Folio de autorización" },
        { key: "registro", label: "Registró" },
        { key: "observaciones", label: "Observaciones" },
      ],
    );
  }

  return (
    <ActionModal
      open={open}
      title={detail ? `${detail.sku} · ${detail.name}` : "Reactivo controlado"}
      description="Historial completo de movimientos, consumos y autorizaciones con trazabilidad regulatoria."
      onClose={onClose}
      wide
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando historial…</p> : (
          <>
            <div className="details-grid">
              <div><small>Tipo de control</small><strong className="controlled-badge"><Lock size={13} /> {kindLabel(detail.control_kind)}</strong></div>
              <div><small>Existencia actual</small><strong>{String(detail.quantity ?? 0)} {detail.unit}</strong></div>
              <div><small>Categoría</small><strong>{detail.category}</strong></div>
              <div><small>Ubicación</small><strong>{detail.location}</strong></div>
              <div><small>Estado</small><strong>{detail.status === "ARCHIVED" ? "Archivado" : "Activo"}</strong></div>
              <div><small>Consumos registrados</small><strong>{consumptions.length}</strong></div>
            </div>

            {/* Un reactivo controlado suele ser también peligroso: la ficha de
                seguridad queda a un clic desde su propio historial. */}
            <div className="safety-summary">
              <div>
                <span className="field-label">Peligrosidad</span>
                {normalizePictograms(detail.hazard_pictograms).length
                  ? <GhsPictogramRow codes={normalizePictograms(detail.hazard_pictograms)} size={38} showNames />
                  : <p className="modal-note">Sin pictogramas declarados.</p>}
              </div>
              <SafetyButton item={detail as SafetyItem} />
            </div>

            {requests.length > 0 ? (
              <>
                <div className="section-heading" style={{ marginTop: 14 }}>
                  <div><p className="form-section-title" style={{ margin: 0 }}>Autorizaciones de uso</p></div>
                </div>
                <div className="definition-list">
                  {requests.map((request) => (
                    <article key={request.id} className="definition-row">
                      <div>
                        <strong>{request.request_code} · {requestStateLabel(request)}</strong>
                        <p className="usage-trace">
                          {[
                            `Usa: ${request.used_by_person}`,
                            `Área/proyecto: ${request.usage_area}`,
                            request.reviewed_by_name && `Autoriza: ${request.reviewed_by_name}`,
                          ].filter(Boolean).join(" · ")}
                        </p>
                        <p>{request.usage_purpose}</p>
                      </div>
                      <small>{requestQuantityLabel(request)}</small>
                      <em>{formatDateTime(request.created_at)}<br />{request.requested_by_name ?? ""}</em>
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            <div className="section-heading" style={{ marginTop: 14 }}>
              <div><p className="form-section-title" style={{ margin: 0 }}>Historial de movimientos y consumos</p></div>
              {movements.length > 0 ? <button type="button" className="secondary-button" onClick={exportLog}><Download size={15} /> Exportar CSV</button> : null}
            </div>
            {movements.length === 0 ? (
              <p className="modal-note">Este reactivo aún no tiene movimientos registrados.</p>
            ) : (
              <div className="definition-list">
                {movements.map((m) => {
                  const isConsumption = Number(m.quantity_delta) < 0;
                  return (
                    <article key={m.id} className={`definition-row${isConsumption ? " controlled-consumption-row" : ""}`}>
                      <div>
                        <strong>{MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}{m.authorization_code ? ` · ${m.authorization_code}` : ""}</strong>
                        {isConsumption && (m.used_by_person || m.usage_area || m.usage_purpose) ? (
                          <p className="usage-trace">
                            {[
                              m.used_by_person && `Usó: ${m.used_by_person}`,
                              m.usage_area && `Área/proyecto: ${m.usage_area}`,
                              m.usage_purpose && `Finalidad: ${m.usage_purpose}`,
                              m.authorized_by && `Autoriza: ${m.authorized_by}`,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {m.note ? <p>{m.note}</p> : null}
                      </div>
                      <small>
                        {String(m.quantity_delta)}
                        <br />
                        {String(m.previous_quantity ?? "?")} → {String(m.resulting_quantity ?? "?")}
                      </small>
                      <em>{formatDateTime(m.performed_at)}<br />{m.performed_by ?? ""}</em>
                    </article>
                  );
                })}
              </div>
            )}
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
            </footer>
          </>
        )}
      </div>
    </ActionModal>
  );
}
