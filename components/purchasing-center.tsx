"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarClock, ClipboardList, LockKeyhole, PenLine, Plus, Trash2, TriangleAlert, Wallet } from "lucide-react";
import type { UserSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, type TableRow } from "@/components/lims-ui";
import { PURCHASE_PRIORITY_LABEL, PURCHASE_STATUS_LABEL } from "@/lib/purchasing";
import { SignatureList, type StampedSignature } from "@/components/signature";
import { DocumentUploader } from "@/components/compliance/document-uploader";

type PurchaseRow = TableRow & {
  id?: string; request_code?: string; title?: string; supplier?: string | null;
  status?: string; priority?: string; currency?: string; needed_by?: string | null;
  item_count?: number; estimated_total?: number | string;
};

type PurchaseItem = {
  id?: string; description?: string; quantity?: number | string; unit?: string;
  estimated_unit_price?: number | string | null; notes?: string | null;
  inventory_item_name?: string | null; inventory_sku?: string | null;
};

type PurchaseDetail = {
  id: string; request_code?: string; title?: string; supplier?: string | null;
  status?: string; priority?: string; currency?: string; needed_by?: string | null;
  notes?: string | null; requested_by_name?: string | null; approved_by_name?: string | null;
  created_at?: string; items?: PurchaseItem[]; signatures?: StampedSignature[];
  // Datos regulatorios de la compra (migración 0024).
  invoice_number?: string | null; purchase_order_number?: string | null;
  license_number?: string | null; permit_number?: string | null;
  has_controlled_items?: boolean; received_at?: string | null; received_by_name?: string | null;
};

type LineDraft = { description: string; quantity: number; unit: string; estimatedUnitPrice: number | null; inventoryItemId: string | null };

type LowStockItem = { id: string; label: string; unit: string; suggestedQty: number };

type CreatePayload = {
  title: string; supplier?: string; priority?: string; currency?: string;
  neededBy?: string | null; notes?: string; status?: string; signaturePassword?: string;
  purchaseOrderNumber?: string; licenseNumber?: string; permitNumber?: string;
  items: Array<{ inventoryItemId?: string | null; description: string; quantity: number; unit: string; estimatedUnitPrice?: number | null; notes?: string }>;
};

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };
const OPEN_STATUSES = new Set(["DRAFT", "PENDING", "APPROVED", "ORDERED"]);

async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try { const payload = await response.json() as { message?: string }; return payload.message || fallback; } catch { return fallback; }
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try { return new Date(value).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" }); } catch { return String(value); }
}

function formatMoney(amount: number, currency = "GTQ"): string {
  if (!Number.isFinite(amount) || amount <= 0) return "—";
  try { return new Intl.NumberFormat("es-GT", { style: "currency", currency }).format(amount); } catch { return `${currency} ${amount.toFixed(2)}`; }
}

function statusLabel(status: string | null | undefined): string { return PURCHASE_STATUS_LABEL[String(status)] ?? String(status ?? "—"); }
function priorityLabel(priority: string | null | undefined): string { return PURCHASE_PRIORITY_LABEL[String(priority)] ?? String(priority ?? "—"); }

// Acciones de cambio de estado disponibles según el estado actual.
function nextActions(status: string): Array<{ label: string; status: string; primary?: boolean }> {
  switch (status) {
    case "DRAFT": return [{ label: "Enviar a aprobación", status: "PENDING", primary: true }, { label: "Cancelar solicitud", status: "CANCELLED" }];
    case "PENDING": return [{ label: "Aprobar", status: "APPROVED", primary: true }, { label: "Rechazar", status: "CANCELLED" }];
    case "APPROVED": return [{ label: "Marcar como pedida", status: "ORDERED", primary: true }, { label: "Cancelar", status: "CANCELLED" }];
    case "ORDERED": return [{ label: "Marcar como recibida", status: "RECEIVED", primary: true }, { label: "Cancelar", status: "CANCELLED" }];
    case "CANCELLED": return [{ label: "Reabrir como borrador", status: "DRAFT" }];
    default: return [];
  }
}

export function PurchasingCenter({ session }: Readonly<{ session?: UserSession }>) {
  const canManage = session ? hasPermission(session, "purchasing.manage") : false;
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PurchaseDetail | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch("/api/purchasing");
      if (response.status === 403) { setError("No tienes permiso para ver el módulo de compras."); return; }
      if (!response.ok) { setError("El servidor no pudo procesar la solicitud. Intenta de nuevo."); return; }
      const payload = await response.json() as { data?: PurchaseRow[] };
      setRows(payload.data ?? []);
    } catch { setError("No se pudo cargar la información de compras. Verifica tu conexión."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createRequest(payload: CreatePayload): Promise<boolean> {
    try {
      const response = await fetch("/api/purchasing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo crear la solicitud. Revisa los campos.")); return false; }
      setCreateOpen(false);
      showToast(payload.signaturePassword ? "Solicitud firmada y enviada a aprobación." : "Solicitud guardada como borrador.");
      await load();
      return true;
    } catch { showError("No se pudo conectar con el servidor."); return false; }
  }

  async function openDetail(id: string) {
    try {
      const response = await fetch(`/api/purchasing/${id}`);
      if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo abrir la solicitud.")); return; }
      const payload = await response.json() as { data?: PurchaseDetail };
      if (payload.data) setDetail(payload.data);
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  async function updateStatus(id: string, status: string, signaturePassword?: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/purchasing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signaturePassword ? { status, signaturePassword } : { status }),
      });
      if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo actualizar la solicitud.")); return false; }
      showToast(status === "APPROVED" ? "Solicitud autorizada y firmada." : "Estado de la solicitud actualizado.");
      setDetail(null); await load();
      return true;
    } catch { showError("No se pudo conectar con el servidor."); return false; }
  }

  const openRows = rows.filter((row) => OPEN_STATUSES.has(String(row.status)));
  const estimatedOpen = openRows.reduce((sum, row) => sum + Number(row.estimated_total ?? 0), 0);
  const openCurrency = openRows.find((row) => row.currency)?.currency ?? "GTQ";

  const tableRows: TableRow[] = rows.map((row) => ({
    id: row.id ?? "",
    code: row.request_code ?? "—",
    title: row.title ?? "—",
    supplier: row.supplier ?? "—",
    priority: priorityLabel(row.priority),
    needed: formatDate(row.needed_by),
    items: String(row.item_count ?? 0),
    total: formatMoney(Number(row.estimated_total ?? 0), String(row.currency ?? "GTQ")),
    status: statusLabel(row.status),
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="ABASTECIMIENTO" title="Compras" description="Planifica y da seguimiento a las próximas compras de reactivos, materiales y equipos del laboratorio." />
        <SkeletonKpiGrid cols={4} />
        <SkeletonTable rows={5} cols={8} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="ABASTECIMIENTO" title="Compras" description="Planifica y da seguimiento a las próximas compras de reactivos, materiales y equipos del laboratorio." />
        <ErrorState description={error} onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="ABASTECIMIENTO" title="Compras" description="Planifica y da seguimiento a las próximas compras de reactivos, materiales y equipos del laboratorio.">
        {canManage ? <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nueva solicitud</button> : null}
      </PageIntro>
      <StatGrid items={[
        { label: "Solicitudes abiertas", value: String(openRows.length), hint: "En curso", icon: ClipboardList },
        { label: "Alta o urgente", value: String(openRows.filter((row) => ["HIGH", "URGENT"].includes(String(row.priority))).length), hint: "Requieren atención", icon: TriangleAlert },
        { label: "Por aprobar", value: String(rows.filter((row) => row.status === "PENDING").length), hint: "Esperan visto bueno", icon: CalendarClock },
        { label: "Valor estimado", value: formatMoney(estimatedOpen, openCurrency), hint: "Compras abiertas", icon: Wallet },
      ]} />
      <InlineNotice title="Planificación de compras">Registra aquí lo que se necesita comprar. Al recibir el material, regístralo como entrada en Inventario para actualizar las existencias reales.</InlineNotice>
      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <section>
            <div className="section-heading">
              <div><h2>Solicitudes de compra</h2><p>Cada solicitud agrupa los artículos a comprar, su proveedor, prioridad y fecha objetivo.</p></div>
              {canManage ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nueva solicitud</button> : null}
            </div>
            <SimpleTable
              columns={[{ key: "code", label: "Código" }, { key: "title", label: "Solicitud" }, { key: "supplier", label: "Proveedor" }, { key: "priority", label: "Prioridad" }, { key: "needed", label: "Necesaria para" }, { key: "items", label: "Artículos" }, { key: "total", label: "Estimado" }, { key: "status", label: "Estado" }]}
              rows={tableRows}
              onRowClick={(row) => { if (row.id) void openDetail(String(row.id)); }}
              searchPlaceholder="Buscar solicitud o proveedor…"
              emptyTitle="Sin solicitudes de compra"
              emptyMessage={canManage ? "Crea una nueva solicitud para planificar las próximas compras." : "Aún no hay solicitudes registradas."}
            />
            {rows.length === 0 && canManage ? <div className="empty-state-actions"><button type="button" className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nueva solicitud</button></div> : null}
          </section>
        </div>
      </article>
      {createOpen ? <PurchaseModal onClose={() => setCreateOpen(false)} onSave={createRequest} /> : null}
      <PurchaseDetailModal detail={detail} canManage={canManage} onClose={() => setDetail(null)} onAction={updateStatus} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function PurchaseModal({ onClose, onSave }: Readonly<{ onClose: () => void; onSave: (payload: CreatePayload) => Promise<boolean> }>) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<LineDraft[]>([]);
  const [draftDescription, setDraftDescription] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftUnit, setDraftUnit] = useState("unidades");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftInventoryId, setDraftInventoryId] = useState<string | null>(null);
  const [lowStock, setLowStock] = useState<LowStockItem[]>([]);
  const [sign, setSign] = useState(true);
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/inventory").then((response) => (response.ok ? response.json() : { data: [] })).catch(() => ({ data: [] })).then((payload: { data?: Array<Record<string, unknown>> }) => {
      if (!active) return;
      const suggestions = (payload.data ?? [])
        .filter((item) => String(item.status) === "REORDER" && item.id)
        .map((item) => {
          const quantity = Number(item.quantity ?? 0);
          const reorder = Number(item.reorder_point ?? 0);
          const gap = reorder - quantity;
          return {
            id: String(item.id),
            label: `${String(item.sku ?? "")} · ${String(item.name ?? "")}`.trim(),
            unit: String(item.unit ?? "unidades"),
            suggestedQty: gap > 0 ? Number(gap.toFixed(3)) : 1,
          };
        });
      setLowStock(suggestions);
    });
    return () => { active = false; };
  }, []);

  const estimatedTotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * (item.estimatedUnitPrice ?? 0), 0), [items]);
  const usedInventoryIds = new Set(items.map((item) => item.inventoryItemId).filter(Boolean));

  function addDraftItem() {
    const description = draftDescription.trim();
    if (!description) { setError("Describe el artículo antes de añadirlo."); return; }
    const quantity = Number(draftQuantity);
    const price = draftPrice.trim() ? Number(draftPrice) : null;
    setItems((current) => [...current, {
      description,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: draftUnit.trim() || "unidades",
      estimatedUnitPrice: price !== null && Number.isFinite(price) && price >= 0 ? price : null,
      inventoryItemId: draftInventoryId,
    }]);
    setDraftDescription(""); setDraftQuantity("1"); setDraftUnit("unidades"); setDraftPrice(""); setDraftInventoryId(null); setError(null);
  }

  function addSuggestion(item: LowStockItem) {
    if (usedInventoryIds.has(item.id)) return;
    setItems((current) => [...current, { description: item.label, quantity: item.suggestedQty, unit: item.unit, estimatedUnitPrice: null, inventoryItemId: item.id }]);
  }

  function removeItem(index: number) { setItems((current) => current.filter((_, position) => position !== index)); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (title.length < 3) { setError("El título debe tener al menos 3 caracteres."); return; }
    if (items.length === 0) { setError("Añade al menos un artículo a la solicitud."); return; }
    // Enviar a aprobación exige la firma de quien solicita; guardar como
    // borrador no, porque todavía no compromete a nadie.
    if (sign && password.length < 8) { setError("Escribe tu contraseña para firmar la solicitud."); return; }
    setSaving(true);
    const ok = await onSave({
      title,
      supplier: String(data.get("supplier") ?? "").trim() || undefined,
      priority: String(data.get("priority") ?? "NORMAL"),
      currency: String(data.get("currency") ?? "GTQ").trim() || "GTQ",
      neededBy: String(data.get("neededBy") ?? "") || null,
      notes: String(data.get("notes") ?? "").trim() || undefined,
      status: sign ? "PENDING" : "DRAFT",
      signaturePassword: sign ? password : undefined,
      purchaseOrderNumber: String(data.get("purchaseOrderNumber") ?? "").trim() || undefined,
      licenseNumber: String(data.get("licenseNumber") ?? "").trim() || undefined,
      permitNumber: String(data.get("permitNumber") ?? "").trim() || undefined,
      items: items.map((item) => ({ inventoryItemId: item.inventoryItemId, description: item.description, quantity: item.quantity, unit: item.unit, estimatedUnitPrice: item.estimatedUnitPrice ?? undefined })),
    });
    setSaving(false);
    if (!ok) setPassword("");
  }

  return (
    <ActionModal open title="Nueva solicitud de compra" description="Agrupa los artículos a comprar con su proveedor, prioridad y fecha objetivo." onClose={onClose} wide>
      <form className="modal-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título de la solicitud</span><input name="title" required minLength={3} placeholder="Reposición de reactivos de microbiología" /></label>
          <label><span>Proveedor (opcional)</span><input name="supplier" placeholder="Merck, Kalstein…" /></label>
          <label><span>Prioridad</span>
            <select name="priority" defaultValue="NORMAL">
              <option value="LOW">Baja</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </select>
          </label>
          <label><span>Necesaria para (opcional)</span><input name="neededBy" type="date" /></label>
          <label><span>Moneda</span><input name="currency" defaultValue="GTQ" maxLength={10} /></label>
        </div>

        <span className="form-section-title">Artículos a comprar</span>
        {lowStock.length ? (
          <div className="ai-digitize-note" style={{ marginBottom: 4 }}>
            Sugerencias por stock bajo:
            <div className="line-item-add" style={{ justifyContent: "flex-start", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {lowStock.map((item) => (
                <button type="button" key={item.id} className="filter-chip" disabled={usedInventoryIds.has(item.id)} onClick={() => addSuggestion(item)}>
                  <Plus size={12} /> {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Descripción</span><input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} placeholder="Alcohol etílico 96% · Frasco 1 L" /></label>
          <label><span>Cantidad</span><input type="number" min="0.001" step="0.001" value={draftQuantity} onChange={(event) => setDraftQuantity(event.target.value)} /></label>
          <label><span>Unidad</span><input value={draftUnit} onChange={(event) => setDraftUnit(event.target.value)} /></label>
          <label><span>Precio unit. estimado (opcional)</span><input type="number" min="0" step="0.01" value={draftPrice} onChange={(event) => setDraftPrice(event.target.value)} /></label>
        </div>
        <div className="line-item-add"><button type="button" className="secondary-button" onClick={addDraftItem}><Plus size={15} /> Añadir artículo</button></div>
        {items.length === 0 ? (
          <p className="line-item-empty">Aún no has añadido artículos. Añade al menos uno para crear la solicitud.</p>
        ) : (
          <ul className="line-item-list">
            {items.map((item, index) => (
              <li key={`${item.description}-${index}`} className="line-item-row">
                <div className="line-item-info">
                  <strong>{item.description}</strong>
                  <span>{item.quantity} {item.unit}{item.estimatedUnitPrice ? ` · ${formatMoney(item.estimatedUnitPrice)} c/u` : ""}{item.inventoryItemId ? " · reposición" : ""}</span>
                </div>
                <button type="button" className="icon-button" aria-label={`Quitar ${item.description}`} onClick={() => removeItem(index)}><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
        {estimatedTotal > 0 ? <p className="ai-digitize-note" style={{ textAlign: "right", fontWeight: 600 }}>Total estimado: {formatMoney(estimatedTotal)}</p> : null}

        <label><span>Observaciones (opcional)</span><textarea name="notes" rows={2} placeholder="Detalles para quien realiza la compra…" /></label>

        <span className="form-section-title">Datos regulatorios</span>
        <div className="form-grid form-grid-two">
          <label><span>Orden de compra</span><input name="purchaseOrderNumber" placeholder="OC interna del proveedor" /></label>
          <label><span>Número de licencia</span><input name="licenseNumber" /></label>
          <label><span>Número de permiso</span><input name="permitNumber" /></label>
        </div>
        <p className="modal-note">
          Si la solicitud incluye reactivos controlados o de doble uso, la licencia y el permiso son obligatorios para enviarla a aprobación.
          La factura y el documento escaneado se registran al recibir el material, en Reactivos controlados → Entradas.
        </p>

        <span className="form-section-title">Firma electrónica</span>
        <div className="signature-inline">
          <label className="check-line">
            <input type="checkbox" checked={sign} onChange={(event) => setSign(event.target.checked)} />
            <span>Firmar y enviar a aprobación ahora</span>
          </label>
          {sign ? (
            <>
              <label>
                <span>Tu contraseña</span>
                <div className="input-with-icon">
                  <LockKeyhole size={16} />
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} />
                </div>
              </label>
              <p className="form-help">Tu firma queda ligada al contenido exacto de esta solicitud, con fecha y hora. Sustituye a la requisición firmada en papel.</p>
            </>
          ) : (
            <p className="form-help">Sin firmar se guarda como borrador: podrás revisarla y firmarla después.</p>
          )}
        </div>

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>
            {sign ? <PenLine size={15} /> : null}
            {saving ? "Guardando…" : sign ? "Firmar y enviar" : "Guardar borrador"}
          </button>
        </footer>
      </form>
    </ActionModal>
  );
}

function PurchaseDetailModal({ detail, canManage, onClose, onAction }: Readonly<{ detail: PurchaseDetail | null; canManage: boolean; onClose: () => void; onAction: (id: string, status: string, signaturePassword?: string) => Promise<boolean> }>) {
  const [busy, setBusy] = useState(false);
  const [signingFor, setSigningFor] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  if (!detail) return null;
  const currency = detail.currency ?? "GTQ";
  const items = detail.items ?? [];
  const total = items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.estimated_unit_price ?? 0), 0);
  const actions = nextActions(String(detail.status));
  const signatures = detail.signatures ?? [];

  // Autorizar exige firma; el resto de transiciones (pedida, recibida) no.
  async function run(status: string) {
    if (status === "APPROVED") { setSigningFor(status); return; }
    setBusy(true);
    try { await onAction(detail!.id, status); } finally { setBusy(false); }
  }

  async function confirmSignature() {
    if (password.length < 8) return;
    setBusy(true);
    try {
      const ok = await onAction(detail!.id, "APPROVED", password);
      if (ok) { setSigningFor(null); setPassword(""); }
    } finally { setBusy(false); }
  }

  return (
    <ActionModal open title={`${detail.request_code ?? ""} · ${detail.title ?? "Solicitud"}`} description="Detalle de la solicitud de compra y sus artículos." onClose={onClose} wide>
      <div className="modal-form">
        <div className="details-grid">
          <div><small>Proveedor</small><strong>{detail.supplier ?? "—"}</strong></div>
          <div><small>Prioridad</small><strong>{priorityLabel(detail.priority)}</strong></div>
          <div><small>Estado</small><strong>{statusLabel(detail.status)}</strong></div>
          <div><small>Necesaria para</small><strong>{formatDate(detail.needed_by)}</strong></div>
          <div><small>Solicitada por</small><strong>{detail.requested_by_name ?? "—"}</strong></div>
          <div><small>Aprobada por</small><strong>{detail.approved_by_name ?? "—"}</strong></div>
          {detail.has_controlled_items ? <div><small>Contenido</small><strong>Incluye reactivos controlados</strong></div> : null}
          {detail.purchase_order_number ? <div><small>Orden de compra</small><strong>{detail.purchase_order_number}</strong></div> : null}
          {detail.invoice_number ? <div><small>Factura</small><strong>{detail.invoice_number}</strong></div> : null}
          {detail.license_number ? <div><small>Licencia</small><strong>{detail.license_number}</strong></div> : null}
          {detail.permit_number ? <div><small>Permiso</small><strong>{detail.permit_number}</strong></div> : null}
          {detail.received_at ? <div><small>Recibida</small><strong>{formatDate(detail.received_at)}{detail.received_by_name ? ` · ${detail.received_by_name}` : ""}</strong></div> : null}
          {detail.notes ? <div className="field-span-two"><small>Observaciones</small><strong>{detail.notes}</strong></div> : null}
        </div>

        <DocumentUploader
          entityType="purchase_request"
          entityId={detail.id}
          label="Documentos de la compra"
          hint="Arrastra la cotización, la orden de compra o la factura escaneada"
          canUpload={canManage}
        />
        <p className="form-section-title" style={{ marginTop: 12 }}>Artículos ({items.length})</p>
        <ul className="line-item-list">
          {items.map((item, index) => {
            const quantity = Number(item.quantity ?? 0);
            const price = Number(item.estimated_unit_price ?? 0);
            return (
              <li key={item.id ?? index} className="line-item-row">
                <div className="line-item-info">
                  <strong>{item.description ?? "—"}</strong>
                  <span>{quantity} {item.unit ?? ""}{price > 0 ? ` · ${formatMoney(price, currency)} c/u` : ""}{item.inventory_sku ? ` · repone ${item.inventory_sku}` : ""}</span>
                </div>
                {price > 0 ? <span className="line-item-info" style={{ textAlign: "right" }}><strong>{formatMoney(quantity * price, currency)}</strong></span> : null}
              </li>
            );
          })}
        </ul>
        {total > 0 ? <p className="ai-digitize-note" style={{ textAlign: "right", fontWeight: 600 }}>Total estimado: {formatMoney(total, currency)}</p> : null}

        {signatures.length ? (
          <>
            <p className="form-section-title" style={{ marginTop: 12 }}>Firmas</p>
            <SignatureList signatures={signatures} />
          </>
        ) : null}

        {signingFor ? (
          <div className="signature-inline">
            <p className="form-section-title">Autorizar con tu firma</p>
            <p className="form-help">Vas a autorizar {detail.request_code ?? "esta solicitud"} por {formatMoney(total, currency)}. Confirma tu contraseña para firmar.</p>
            <label>
              <span>Tu contraseña</span>
              <div className="input-with-icon">
                <LockKeyhole size={16} />
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} />
              </div>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => { setSigningFor(null); setPassword(""); }}>Cancelar</button>
              <button type="button" className="primary-button" disabled={busy || password.length < 8} onClick={() => void confirmSignature()}>
                <PenLine size={15} /> {busy ? "Firmando…" : "Firmar y autorizar"}
              </button>
            </div>
          </div>
        ) : null}

        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
          {canManage && !signingFor ? actions.map((action) => (
            <button key={action.status} type="button" className={action.primary ? "primary-button" : "secondary-button"} disabled={busy} onClick={() => void run(action.status)}>{action.label}</button>
          )) : null}
        </footer>
      </div>
    </ActionModal>
  );
}
