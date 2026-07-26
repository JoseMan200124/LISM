"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BadgeCheck, ClipboardList, FileWarning, Flame, LockKeyhole, PackagePlus, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, SimpleTable, type TableRow } from "@/components/lims-ui";
import { GhsPictogramPicker, GhsPictogramRow } from "@/components/ghs-pictogram";
import { DocumentUploader } from "@/components/compliance/document-uploader";
import { formatDate, formatDateTime } from "@/lib/dates";
import { hasPermission } from "@/lib/authorization";
import { normalizePictograms, type GhsCode } from "@/lib/ghs";
import {
  COUNT_SCOPES,
  COUNT_SCOPE_LABEL,
  COUNT_STATUS_LABEL,
  DISPOSAL_METHODS,
  DISPOSAL_METHOD_LABEL,
  DISPOSAL_REASONS,
  DISPOSAL_REASON_LABEL,
  PERMIT_STATE_LABEL,
  PERMIT_TYPES,
  PERMIT_TYPE_LABEL,
  REAGENT_CATEGORIES,
  REAGENT_CATEGORY_HINT,
  REAGENT_CATEGORY_LABEL,
  REGULATORS,
  countDifference,
  permitState,
  requiresJustification,
  type ReagentCategory,
} from "@/lib/compliance-reagents";
import type { UserSession } from "@/lib/session";

// Cumplimiento de reactivos controlados: catálogo, licencias, entradas
// documentadas, inventarios físicos y disposición final. Todo lo que pide una
// inspección, en el mismo módulo donde ya vive el registro de consumo.

async function apiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

function useList<T>(url: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) { setError(await apiMessage(response, "No se pudo cargar la información.")); return; }
      const payload = await response.json() as { data?: T[] };
      setItems(payload.data ?? []);
      setError(null);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { void reload(); }, [reload]);
  return { items, loading, error, reload };
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

type CatalogRow = {
  id: string; code: string; name: string; cas_number: string | null; concentration: string | null;
  default_vendor: string | null; category: string; hazard_pictograms: unknown;
  requires_permit: boolean; requires_preapproval: boolean; container_count: number;
  total_quantity: number | string; document_count: number; sds_url: string | null;
  regulatory_requirements?: string | null; regulators?: unknown; hazard_statements?: string | null;
};

export function ReagentCatalogTab({ session }: Readonly<{ session?: UserSession }>) {
  const { items, loading, error, reload } = useList<CatalogRow>("/api/compliance/catalog");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<CatalogRow | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();
  const canManage = session ? hasPermission(session, "inventory.manage") : false;

  const rows: TableRow[] = items.map((entry) => ({
    id: entry.id,
    code: entry.code,
    name: entry.name,
    cas: entry.cas_number ?? "—",
    category: REAGENT_CATEGORY_LABEL[entry.category as ReagentCategory] ?? entry.category,
    hazards: normalizePictograms(entry.hazard_pictograms).join(","),
    vendor: entry.default_vendor ?? "—",
    containers: String(entry.container_count ?? 0),
    stock: String(entry.total_quantity ?? 0),
    permit: entry.requires_permit ? "Requiere licencia" : "—",
    documents: String(entry.document_count ?? 0),
  }));

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div>
          <h4>Catálogo de reactivos</h4>
          <p>La sustancia y sus requisitos: CAS, clasificación, pictogramas, SDS y qué exige la autoridad.</p>
        </div>
        {canManage ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nuevo reactivo</button> : null}
      </div>

      <SimpleTable
        columns={[
          { key: "code", label: "Código" }, { key: "name", label: "Reactivo" }, { key: "cas", label: "CAS" },
          { key: "category", label: "Clasificación" }, { key: "hazards", label: "Peligros" },
          { key: "vendor", label: "Proveedor" }, { key: "containers", label: "Envases" },
          { key: "stock", label: "Existencia" }, { key: "permit", label: "Licencia" }, { key: "documents", label: "Docs." },
        ]}
        rows={loading ? [] : rows}
        onRowClick={(row) => setDetail(items.find((entry) => entry.id === row.id) ?? null)}
        searchPlaceholder="Buscar por nombre, CAS o proveedor…"
        emptyTitle={loading ? "Cargando…" : "Catálogo vacío"}
        emptyMessage="Registra los reactivos que maneja el laboratorio con su número CAS y su clasificación."
      />

      {createOpen ? (
        <CatalogFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (code) => { setCreateOpen(false); showToast(`Reactivo ${code} añadido al catálogo.`); await reload(); }}
          onError={showError}
        />
      ) : null}

      {detail ? (
        <ActionModal
          open wide eyebrow="CATÁLOGO"
          title={`${detail.code} · ${detail.name}`}
          description="Ficha regulatoria del reactivo."
          onClose={() => setDetail(null)}
        >
          <div className="modal-form">
            <div className="details-grid">
              <div><small>CAS</small><strong>{detail.cas_number ?? "—"}</strong></div>
              <div><small>Clasificación</small><strong>{REAGENT_CATEGORY_LABEL[detail.category as ReagentCategory] ?? detail.category}</strong></div>
              <div><small>Concentración</small><strong>{detail.concentration ?? "—"}</strong></div>
              <div><small>Proveedor habitual</small><strong>{detail.default_vendor ?? "—"}</strong></div>
              <div><small>Envases activos</small><strong>{detail.container_count ?? 0}</strong></div>
              <div><small>Existencia total</small><strong>{String(detail.total_quantity ?? 0)}</strong></div>
              <div><small>Requiere licencia</small><strong>{detail.requires_permit ? "Sí" : "No"}</strong></div>
              <div><small>Autorización previa de uso</small><strong>{detail.requires_preapproval ? "Sí" : "No"}</strong></div>
            </div>
            <p className="modal-note">{REAGENT_CATEGORY_HINT[detail.category as ReagentCategory]}</p>
            {normalizePictograms(detail.hazard_pictograms).length ? (
              <GhsPictogramRow codes={normalizePictograms(detail.hazard_pictograms)} size={38} showNames />
            ) : null}
            {detail.regulatory_requirements ? (
              <div className="definition-row"><div><strong>Requisitos regulatorios</strong><p className="research-preserve">{detail.regulatory_requirements}</p></div></div>
            ) : null}
            <DocumentUploader entityType="reagent_catalog" entityId={detail.id} label="Ficha de datos de seguridad y certificados" canUpload={canManage} />
            <footer className="modal-actions"><button className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button></footer>
          </div>
        </ActionModal>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function CatalogFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [pictograms, setPictograms] = useState<GhsCode[]>([]);
  const [regulators, setRegulators] = useState<string[]>([]);
  const [category, setCategory] = useState<ReagentCategory>("CONTROLLED");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/compliance/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          synonyms: String(data.get("synonyms") ?? "").trim() || undefined,
          casNumber: String(data.get("casNumber") ?? "").trim() || undefined,
          unNumber: String(data.get("unNumber") ?? "").trim() || undefined,
          formula: String(data.get("formula") ?? "").trim() || undefined,
          concentration: String(data.get("concentration") ?? "").trim() || undefined,
          presentation: String(data.get("presentation") ?? "").trim() || undefined,
          defaultVendor: String(data.get("defaultVendor") ?? "").trim() || undefined,
          category,
          hazardPictograms: pictograms,
          hazardStatements: String(data.get("hazardStatements") ?? "").trim() || undefined,
          regulatoryRequirements: String(data.get("regulatoryRequirements") ?? "").trim() || undefined,
          regulators,
          requiresPermit: data.get("requiresPermit") === "on",
          requiresPreapproval: data.get("requiresPreapproval") === "on",
          storageConditions: String(data.get("storageConditions") ?? "").trim() || undefined,
          sdsUrl: String(data.get("sdsUrl") ?? "").trim() || undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo guardar el reactivo.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="CATÁLOGO" title="Nuevo reactivo del catálogo" description="Los frascos que se reciban heredarán de aquí su clasificación y sus pictogramas." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Nombre *</span><input name="name" required minLength={2} maxLength={200} /></label>
          <label><span>Número CAS</span><input name="casNumber" placeholder="7647-01-0" /></label>
          <label><span>Número UN</span><input name="unNumber" placeholder="UN1789" /></label>
          <label><span>Fórmula</span><input name="formula" /></label>
          <label><span>Concentración</span><input name="concentration" placeholder="37 %" /></label>
          <label><span>Presentación</span><input name="presentation" placeholder="Frasco ámbar 1 L" /></label>
          <label><span>Proveedor habitual</span><input name="defaultVendor" /></label>
          <label className="field-span-two"><span>Sinónimos</span><input name="synonyms" placeholder="Ácido muriático, cloruro de hidrógeno" /></label>

          <span className="form-section-title field-span-two"><ShieldCheck size={14} /> Clasificación regulatoria</span>
          <label className="field-span-two"><span>Categoría *</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as ReagentCategory)} required>
              {REAGENT_CATEGORIES.map((option) => <option key={option} value={option}>{REAGENT_CATEGORY_LABEL[option]}</option>)}
            </select>
            <small className="field-hint">{REAGENT_CATEGORY_HINT[category]}</small>
          </label>
          <div className="field-span-two">
            <span className="weekday-picker-label">Autoridades que lo regulan</span>
            <div className="checkbox-grid">
              {REGULATORS.map((regulator) => (
                <label className="check-line" key={regulator}>
                  <input
                    type="checkbox"
                    checked={regulators.includes(regulator)}
                    onChange={(event) => setRegulators((current) => event.target.checked ? [...current, regulator] : current.filter((entry) => entry !== regulator))}
                  />
                  <span>{regulator}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field-span-two"><span>Requisitos regulatorios</span><textarea name="regulatoryRequirements" rows={3} placeholder="Licencia vigente del Ministerio de Gobernación, reporte trimestral de consumo, resguardo bajo llave…" /></label>
          <label className="check-line"><input name="requiresPermit" type="checkbox" defaultChecked /><span>Requiere licencia o permiso para comprarlo</span></label>
          <label className="check-line"><input name="requiresPreapproval" type="checkbox" defaultChecked /><span>Exige autorización previa de uso</span></label>

          <span className="form-section-title field-span-two">Peligrosidad</span>
          <div className="field-span-two">
            <span className="weekday-picker-label">Pictogramas SGA</span>
            <GhsPictogramPicker value={pictograms} onChange={setPictograms} />
          </div>
          <label className="field-span-two"><span>Frases H y P</span><textarea name="hazardStatements" rows={2} /></label>
          <label className="field-span-two"><span>Condiciones de almacenamiento</span><textarea name="storageConditions" rows={2} /></label>
          <label className="field-span-two"><span>Enlace a la SDS</span><input name="sdsUrl" type="url" placeholder="https://…" /></label>
          <label className="field-span-two"><span>Notas</span><textarea name="notes" rows={2} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar reactivo"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

// ─── Licencias y permisos ───────────────────────────────────────────────────

type PermitRow = {
  id: string; permit_type: string; authority: string; permit_number: string; holder: string | null;
  scope: string | null; issued_on: string | null; expires_on: string | null; status: string;
  responsible_name: string | null; document_count: number; reagent_count: number; notes: string | null;
};

export function PermitsTab({ session }: Readonly<{ session?: UserSession }>) {
  const { items, loading, error, reload } = useList<PermitRow>("/api/compliance/permits");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PermitRow | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();
  const canManage = session ? hasPermission(session, "compliance.manage") : false;

  const rows: TableRow[] = items.map((permit) => {
    const state = permitState(permit);
    return {
      id: permit.id,
      type: PERMIT_TYPE_LABEL[permit.permit_type as keyof typeof PERMIT_TYPE_LABEL] ?? permit.permit_type,
      number: permit.permit_number,
      authority: permit.authority,
      holder: permit.holder ?? "—",
      issued: formatDate(permit.issued_on),
      expires: formatDate(permit.expires_on),
      documents: String(permit.document_count ?? 0),
      status: PERMIT_STATE_LABEL[state],
    };
  });

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;

  const expiring = items.filter((permit) => permitState(permit) === "EXPIRING" || permitState(permit) === "EXPIRED");

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div>
          <h4>Licencias, permisos y autorizaciones</h4>
          <p>Documentos ante la autoridad, con su vigencia y el archivo escaneado. El vencimiento avisa con 60 días.</p>
        </div>
        {canManage ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Registrar documento</button> : null}
      </div>

      {expiring.length ? (
        <p className="controlled-alert"><FileWarning size={14} /> {expiring.length} documento(s) vencido(s) o por vencer. Renuévalos antes de seguir comprando o usando reactivos controlados.</p>
      ) : null}

      <SimpleTable
        columns={[
          { key: "type", label: "Tipo" }, { key: "number", label: "Número" }, { key: "authority", label: "Autoridad" },
          { key: "holder", label: "Titular" }, { key: "issued", label: "Emisión" }, { key: "expires", label: "Vence" },
          { key: "documents", label: "Docs." }, { key: "status", label: "Estado" },
        ]}
        rows={loading ? [] : rows}
        onRowClick={(row) => setDetail(items.find((permit) => permit.id === row.id) ?? null)}
        searchPlaceholder="Buscar por número, autoridad o titular…"
        emptyTitle={loading ? "Cargando…" : "Sin documentos registrados"}
        emptyMessage="Registra la licencia del Ministerio de Gobernación, los permisos sanitarios y las autorizaciones vigentes."
      />

      {createOpen ? (
        <PermitFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (number) => { setCreateOpen(false); showToast(`Documento ${number} registrado.`); await reload(); }}
          onError={showError}
        />
      ) : null}

      {detail ? (
        <ActionModal
          open wide eyebrow="CUMPLIMIENTO"
          title={`${PERMIT_TYPE_LABEL[detail.permit_type as keyof typeof PERMIT_TYPE_LABEL] ?? detail.permit_type} ${detail.permit_number}`}
          description={detail.authority}
          onClose={() => setDetail(null)}
        >
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Estado</small><strong>{PERMIT_STATE_LABEL[permitState(detail)]}</strong></div>
              <div><small>Titular</small><strong>{detail.holder ?? "—"}</strong></div>
              <div><small>Emisión</small><strong>{formatDate(detail.issued_on)}</strong></div>
              <div><small>Vencimiento</small><strong>{formatDate(detail.expires_on)}</strong></div>
              <div><small>Responsable</small><strong>{detail.responsible_name ?? "—"}</strong></div>
              <div><small>Reactivos amparados</small><strong>{detail.reagent_count ?? 0}</strong></div>
            </div>
            {detail.scope ? <div className="definition-row"><div><strong>Alcance</strong><p className="research-preserve">{detail.scope}</p></div></div> : null}
            {detail.notes ? <div className="definition-row"><div><strong>Notas</strong><p className="research-preserve">{detail.notes}</p></div></div> : null}

            {canManage ? (
              <form
                className="form-grid form-grid-two"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const response = await fetch("/api/compliance/permits", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id: detail.id,
                      status: String(data.get("status") ?? "ACTIVE"),
                      expiresOn: String(data.get("expiresOn") ?? "") || null,
                    }),
                  });
                  if (!response.ok) { showError(await apiMessage(response, "No se pudo actualizar.")); return; }
                  showToast("Documento actualizado.");
                  setDetail(null);
                  await reload();
                }}
              >
                <label><span>Estado</span>
                  <select name="status" defaultValue={detail.status}>
                    <option value="ACTIVE">Vigente</option>
                    <option value="SUSPENDED">Suspendido</option>
                    <option value="REVOKED">Revocado</option>
                  </select>
                </label>
                <label><span>Nueva fecha de vencimiento</span><input name="expiresOn" type="date" defaultValue={detail.expires_on ? String(detail.expires_on).slice(0, 10) : ""} /></label>
                <div className="modal-actions field-span-two"><button type="submit" className="secondary-button"><BadgeCheck size={15} /> Guardar cambios</button></div>
              </form>
            ) : null}

            <DocumentUploader entityType="regulatory_permit" entityId={detail.id} label="Documento escaneado" hint="Arrastra el PDF de la licencia o permiso" canUpload={canManage} />
            <footer className="modal-actions"><button className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button></footer>
          </div>
        </ActionModal>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function PermitFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (number: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/compliance/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          permitType: String(data.get("permitType") ?? "LICENSE"),
          authority: String(data.get("authority") ?? "").trim(),
          permitNumber: String(data.get("permitNumber") ?? "").trim(),
          holder: String(data.get("holder") ?? "").trim() || undefined,
          scope: String(data.get("scope") ?? "").trim() || undefined,
          issuedOn: String(data.get("issuedOn") ?? "") || null,
          expiresOn: String(data.get("expiresOn") ?? "") || null,
          notes: String(data.get("notes") ?? "").trim() || undefined,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo registrar el documento.")); return; }
      const payload = await response.json() as { data?: { permit_number?: string } };
      await onSaved(String(payload.data?.permit_number ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="CUMPLIMIENTO" title="Registrar licencia o permiso" description="Después podrás adjuntar el documento escaneado desde su ficha." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label><span>Tipo *</span>
            <select name="permitType" defaultValue="LICENSE" required>
              {PERMIT_TYPES.map((type) => <option key={type} value={type}>{PERMIT_TYPE_LABEL[type]}</option>)}
            </select>
          </label>
          <label><span>Número *</span><input name="permitNumber" required maxLength={120} /></label>
          <label className="field-span-two"><span>Autoridad que lo emite *</span>
            <input name="authority" required list="authority-options" placeholder="Ministerio de Gobernación" />
            <datalist id="authority-options">{REGULATORS.map((regulator) => <option key={regulator} value={regulator} />)}</datalist>
          </label>
          <label><span>Titular</span><input name="holder" placeholder="Nombre de la institución" /></label>
          <label><span>Emisión</span><input name="issuedOn" type="date" /></label>
          <label><span>Vencimiento</span><input name="expiresOn" type="date" /></label>
          <label className="field-span-two"><span>Alcance</span><textarea name="scope" rows={2} placeholder="Qué reactivos y qué actividades ampara" /></label>
          <label className="field-span-two"><span>Notas</span><textarea name="notes" rows={2} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Registrar"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

// ─── Entradas ───────────────────────────────────────────────────────────────

type ReceiptRow = {
  id: string; receipt_code: string; vendor: string | null; invoice_number: string | null;
  purchase_order_number: string | null; license_number: string | null; permit_number: string | null;
  lot_number: string | null; received_quantity: number | string; unit: string;
  received_on: string; expires_on: string | null; sku: string | null; item_name: string | null;
  catalog_name: string | null; category: string | null; received_by_name: string | null; document_count: number;
};

export function ReceiptsTab({ session }: Readonly<{ session?: UserSession }>) {
  const { items, loading, error, reload } = useList<ReceiptRow>("/api/compliance/receipts");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ReceiptRow | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();
  const canManage = session ? hasPermission(session, "inventory.manage") : false;

  const rows: TableRow[] = items.map((receipt) => ({
    id: receipt.id,
    code: receipt.receipt_code,
    item: `${receipt.sku ?? ""} ${receipt.item_name ?? receipt.catalog_name ?? ""}`.trim() || "—",
    vendor: receipt.vendor ?? "—",
    invoice: receipt.invoice_number ?? "—",
    order: receipt.purchase_order_number ?? "—",
    license: [receipt.license_number, receipt.permit_number].filter(Boolean).join(" / ") || "—",
    quantity: `${receipt.received_quantity} ${receipt.unit}`,
    received: formatDate(receipt.received_on),
    receivedBy: receipt.received_by_name ?? "—",
    documents: String(receipt.document_count ?? 0),
  }));

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div>
          <h4>Entradas y compras</h4>
          <p>Cada entrada con su proveedor, factura, orden de compra, licencia y responsable que recibió.</p>
        </div>
        {canManage ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><PackagePlus size={15} /> Registrar entrada</button> : null}
      </div>

      <SimpleTable
        columns={[
          { key: "code", label: "Folio" }, { key: "item", label: "Reactivo" }, { key: "vendor", label: "Proveedor" },
          { key: "invoice", label: "Factura" }, { key: "order", label: "Orden de compra" },
          { key: "license", label: "Licencia / permiso" }, { key: "quantity", label: "Cantidad" },
          { key: "received", label: "Recibido" }, { key: "receivedBy", label: "Recibió" }, { key: "documents", label: "Docs." },
        ]}
        rows={loading ? [] : rows}
        onRowClick={(row) => setDetail(items.find((receipt) => receipt.id === row.id) ?? null)}
        searchPlaceholder="Buscar por folio, proveedor o factura…"
        emptyTitle={loading ? "Cargando…" : "Sin entradas registradas"}
        emptyMessage="Registra la recepción de material para dejar constancia de la factura y el permiso que la amparan."
      />

      {createOpen ? (
        <ReceiptFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (code) => { setCreateOpen(false); showToast(`Entrada ${code} registrada y existencia actualizada.`); await reload(); }}
          onError={showError}
        />
      ) : null}

      {detail ? (
        <ActionModal open wide eyebrow="ENTRADA" title={`${detail.receipt_code}`} description="Documentación de la recepción." onClose={() => setDetail(null)}>
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Reactivo</small><strong>{detail.item_name ?? detail.catalog_name ?? "—"}</strong></div>
              <div><small>Proveedor</small><strong>{detail.vendor ?? "—"}</strong></div>
              <div><small>Factura</small><strong>{detail.invoice_number ?? "—"}</strong></div>
              <div><small>Orden de compra</small><strong>{detail.purchase_order_number ?? "—"}</strong></div>
              <div><small>Licencia</small><strong>{detail.license_number ?? "—"}</strong></div>
              <div><small>Permiso</small><strong>{detail.permit_number ?? "—"}</strong></div>
              <div><small>Lote</small><strong>{detail.lot_number ?? "—"}</strong></div>
              <div><small>Cantidad</small><strong>{detail.received_quantity} {detail.unit}</strong></div>
              <div><small>Fecha</small><strong>{formatDate(detail.received_on)}</strong></div>
              <div><small>Vence</small><strong>{formatDate(detail.expires_on)}</strong></div>
              <div><small>Recibió</small><strong>{detail.received_by_name ?? "—"}</strong></div>
            </div>
            <DocumentUploader entityType="inventory_receipt" entityId={detail.id} label="Factura y documentos de la entrada" hint="Arrastra la factura escaneada" canUpload={canManage} />
            <footer className="modal-actions"><button className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button></footer>
          </div>
        </ActionModal>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ReceiptFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [inventory, setInventory] = useState<Array<{ id: string; sku: string; name: string; unit: string }>>([]);
  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/compliance/catalog").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/inventory").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/compliance/permits").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([catalogPayload, inventoryPayload, permitPayload]) => {
      if (!active) return;
      setCatalog((catalogPayload as { data?: CatalogRow[] }).data ?? []);
      setInventory(((inventoryPayload as { data?: Array<Record<string, unknown>> }).data ?? []).map((row) => ({
        id: String(row.id ?? ""), sku: String(row.sku ?? ""), name: String(row.name ?? ""), unit: String(row.unit ?? "unidades"),
      })).filter((row) => row.id));
      setPermits((permitPayload as { data?: PermitRow[] }).data ?? []);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        catalogId: String(data.get("catalogId") ?? "") || undefined,
        vendor: String(data.get("vendor") ?? "").trim(),
        invoiceNumber: String(data.get("invoiceNumber") ?? "").trim(),
        purchaseOrderNumber: String(data.get("purchaseOrderNumber") ?? "").trim() || undefined,
        licenseNumber: String(data.get("licenseNumber") ?? "").trim() || undefined,
        permitNumber: String(data.get("permitNumber") ?? "").trim() || undefined,
        permitId: String(data.get("permitId") ?? "") || undefined,
        lotNumber: String(data.get("lotNumber") ?? "").trim() || undefined,
        receivedQuantity: Number(data.get("receivedQuantity") ?? 0),
        unit: String(data.get("unit") ?? "").trim() || undefined,
        unitPrice: String(data.get("unitPrice") ?? "") ? Number(data.get("unitPrice")) : undefined,
        receivedOn: String(data.get("receivedOn") ?? ""),
        expiresOn: String(data.get("expiresOn") ?? "") || null,
        receivedByName: String(data.get("receivedByName") ?? "").trim() || undefined,
        notes: String(data.get("notes") ?? "").trim() || undefined,
      };
      if (mode === "existing") {
        body.inventoryItemId = String(data.get("inventoryItemId") ?? "");
      } else {
        body.newItem = {
          sku: String(data.get("sku") ?? "").trim(),
          name: String(data.get("name") ?? "").trim(),
          categoryName: String(data.get("categoryName") ?? "Reactivos químicos").trim(),
          unit: String(data.get("unit") ?? "unidades").trim() || "unidades",
          storageLocationName: String(data.get("location") ?? "").trim() || undefined,
          reorderPoint: Number(data.get("reorderPoint") ?? 0),
        };
      }
      const response = await fetch("/api/compliance/receipts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo registrar la entrada.")); return; }
      const payload = await response.json() as { data?: { receipt_code?: string } };
      await onSaved(String(payload.data?.receipt_code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="ENTRADA" title="Registrar entrada" description="La existencia se actualiza con un movimiento de entrada; el papeleo queda ligado al folio." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <div className="field-span-two controlled-question">
            <span className="controlled-question-label">¿A dónde entra el material? *</span>
            <div className="radio-row">
              <label className="radio-option"><input type="radio" name="mode" checked={mode === "existing"} onChange={() => setMode("existing")} /><span>A un lote existente</span></label>
              <label className="radio-option"><input type="radio" name="mode" checked={mode === "new"} onChange={() => setMode("new")} /><span>Envase nuevo</span></label>
            </div>
          </div>

          <label className="field-span-two"><span>Reactivo del catálogo</span>
            <select name="catalogId" defaultValue="">
              <option value="">Sin catálogo</option>
              {catalog.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.code} · {entry.name}{entry.cas_number ? ` (CAS ${entry.cas_number})` : ""} — {REAGENT_CATEGORY_LABEL[entry.category as ReagentCategory]}
                </option>
              ))}
            </select>
          </label>

          {mode === "existing" ? (
            <label className="field-span-two"><span>Lote que recibe la entrada *</span>
              <select name="inventoryItemId" required defaultValue="">
                <option value="" disabled>Selecciona el envase…</option>
                {inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}
              </select>
            </label>
          ) : (
            <>
              <label><span>Código interno *</span><input name="sku" required placeholder="RQ-0042" /></label>
              <label><span>Nombre *</span><input name="name" required /></label>
              <label><span>Categoría</span><input name="categoryName" defaultValue="Reactivos químicos" /></label>
              <label><span>Ubicación</span><input name="location" placeholder="Bodega de controlados" /></label>
              <label><span>Stock mínimo</span><input name="reorderPoint" type="number" min="0" step="0.001" defaultValue="0" /></label>
            </>
          )}

          <span className="form-section-title field-span-two"><ClipboardList size={14} /> Documentación de la compra</span>
          <label><span>Proveedor *</span><input name="vendor" required /></label>
          <label><span>Número de factura *</span><input name="invoiceNumber" required /></label>
          <label><span>Orden de compra</span><input name="purchaseOrderNumber" /></label>
          <label><span>Número de licencia</span><input name="licenseNumber" /></label>
          <label><span>Número de permiso</span><input name="permitNumber" /></label>
          <label><span>Permiso registrado</span>
            <select name="permitId" defaultValue="">
              <option value="">Sin vincular</option>
              {permits.map((permit) => (
                <option key={permit.id} value={permit.id}>
                  {PERMIT_TYPE_LABEL[permit.permit_type as keyof typeof PERMIT_TYPE_LABEL] ?? permit.permit_type} {permit.permit_number} · {PERMIT_STATE_LABEL[permitState(permit)]}
                </option>
              ))}
            </select>
          </label>

          <span className="form-section-title field-span-two">Material recibido</span>
          <label><span>Lote</span><input name="lotNumber" /></label>
          <label><span>Cantidad recibida *</span><input name="receivedQuantity" type="number" min="0.001" step="0.001" required /></label>
          <label><span>Unidad</span><input name="unit" placeholder="mL, g, unidades" /></label>
          <label><span>Precio unitario</span><input name="unitPrice" type="number" min="0" step="0.01" /></label>
          <label><span>Fecha de recepción *</span><input name="receivedOn" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label><span>Vencimiento</span><input name="expiresOn" type="date" /></label>
          <label className="field-span-two"><span>Responsable que recibió</span><input name="receivedByName" placeholder="Nombre de quien recibe el material" /></label>
          <label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} /></label>
          <p className="modal-note field-span-two">
            En reactivos controlados o de doble uso, la licencia, el permiso y el responsable que recibió son obligatorios.
            El documento escaneado se adjunta después desde la ficha de la entrada.
          </p>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Registrando…" : "Registrar entrada"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

// ─── Inventario físico ──────────────────────────────────────────────────────

type CountRow = {
  id: string; code: string; title: string; scope: string; status: string;
  started_at: string; closed_at: string | null; approved_at: string | null;
  started_by_name: string | null; approved_by_name: string | null;
  item_count: number; counted_count: number; difference_count: number;
};

type CountLine = {
  id: string; inventory_item_id: string; system_quantity: number | string; counted_quantity: number | string | null;
  unit: string; difference: number | string | null; justification: string | null;
  sku: string; name: string; lot_number: string | null; location: string; counted_by_name: string | null;
};

export function PhysicalCountsTab({ session }: Readonly<{ session?: UserSession }>) {
  const { items, loading, error, reload } = useList<CountRow>("/api/compliance/counts");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();
  const canCount = session ? hasPermission(session, "inventory.manage") : false;

  const rows: TableRow[] = items.map((count) => ({
    id: count.id,
    code: count.code,
    title: count.title,
    scope: COUNT_SCOPE_LABEL[count.scope] ?? count.scope,
    progress: `${count.counted_count}/${count.item_count}`,
    differences: String(count.difference_count ?? 0),
    started: formatDate(count.started_at),
    approved: count.approved_at ? formatDate(count.approved_at) : "—",
    status: COUNT_STATUS_LABEL[count.status] ?? count.status,
  }));

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div>
          <h4>Inventarios físicos</h4>
          <p>Conteo contra lo que dice el sistema, con justificación de cada diferencia y aprobación firmada de los ajustes.</p>
        </div>
        {canCount ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Iniciar conteo</button> : null}
      </div>

      <SimpleTable
        columns={[
          { key: "code", label: "Folio" }, { key: "title", label: "Conteo" }, { key: "scope", label: "Alcance" },
          { key: "progress", label: "Avance" }, { key: "differences", label: "Diferencias" },
          { key: "started", label: "Inicio" }, { key: "approved", label: "Aprobado" }, { key: "status", label: "Estado" },
        ]}
        rows={loading ? [] : rows}
        onRowClick={(row) => setDetailId(String(row.id))}
        searchPlaceholder="Buscar conteo…"
        emptyTitle={loading ? "Cargando…" : "Sin inventarios físicos"}
        emptyMessage="Inicia un conteo para verificar que la existencia del sistema corresponde con la repisa."
      />

      {createOpen ? (
        <ActionModal open eyebrow="INVENTARIO FÍSICO" title="Iniciar conteo" description="Se congela la existencia del sistema al abrir el conteo." onClose={() => setCreateOpen(false)}>
          <form
            className="modal-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const response = await fetch("/api/compliance/counts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: String(data.get("title") ?? "").trim(),
                  scope: String(data.get("scope") ?? "CONTROLLED"),
                  categoryName: String(data.get("categoryName") ?? "").trim() || undefined,
                  notes: String(data.get("notes") ?? "").trim() || undefined,
                }),
              });
              if (!response.ok) { showError(await apiMessage(response, "No se pudo iniciar el conteo.")); return; }
              const payload = await response.json() as { data?: { code?: string; id?: string; item_count?: number } };
              setCreateOpen(false);
              showToast(`Conteo ${payload.data?.code} iniciado con ${payload.data?.item_count ?? 0} envases.`);
              await reload();
              if (payload.data?.id) setDetailId(payload.data.id);
            }}
          >
            <div className="form-grid">
              <label><span>Título *</span><input name="title" required minLength={3} placeholder="Inventario físico de controlados · julio 2026" /></label>
              <label><span>Alcance</span>
                <select name="scope" defaultValue="CONTROLLED">
                  {COUNT_SCOPES.map((scope) => <option key={scope} value={scope}>{COUNT_SCOPE_LABEL[scope]}</option>)}
                </select>
              </label>
              <label><span>Categoría <small>(si el alcance es por categoría)</small></span><input name="categoryName" /></label>
              <label><span>Notas</span><textarea name="notes" rows={2} /></label>
            </div>
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancelar</button>
              <button type="submit" className="primary-button">Iniciar conteo</button>
            </footer>
          </form>
        </ActionModal>
      ) : null}

      {detailId ? (
        <CountDetailModal
          countId={detailId}
          session={session}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          onToast={showToast}
          onError={showError}
        />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function CountDetailModal({ countId, session, onClose, onChanged, onToast, onError }: Readonly<{
  countId: string; session?: UserSession; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<(CountRow & { items: CountLine[]; notes: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);

  const canCount = session ? hasPermission(session, "inventory.manage") : false;
  const canApprove = session ? hasPermission(session, "compliance.manage") : false;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/compliance/counts/${countId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el conteo.")); return; }
      const payload = await response.json() as { data?: CountRow & { items: CountLine[]; notes: string | null } };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [countId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/compliance/counts/${countId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo completar la acción.")); return; }
      onToast(successMessage);
      await load();
      await onChanged();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionModal
      open wide eyebrow="INVENTARIO FÍSICO"
      title={detail ? `${detail.code} · ${detail.title}` : "Conteo"}
      description="Registra lo contado, justifica las diferencias y aprueba los ajustes."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando conteo…</p> : (
          <>
            <div className="details-grid">
              <div><small>Estado</small><strong>{COUNT_STATUS_LABEL[detail.status] ?? detail.status}</strong></div>
              <div><small>Alcance</small><strong>{COUNT_SCOPE_LABEL[detail.scope] ?? detail.scope}</strong></div>
              <div><small>Inició</small><strong>{detail.started_by_name ?? "—"}</strong></div>
              <div><small>Fecha</small><strong>{formatDateTime(detail.started_at)}</strong></div>
              <div><small>Envases</small><strong>{detail.items.length}</strong></div>
              <div><small>Aprobado por</small><strong>{detail.approved_by_name ?? "—"}</strong></div>
            </div>

            <div className="count-lines">
              {detail.items.map((line) => {
                const counted = line.counted_quantity === null ? "" : String(line.counted_quantity);
                const difference = line.difference === null || line.difference === undefined ? null : Number(line.difference);
                return (
                  <form
                    key={line.id}
                    className={`count-line${difference && difference !== 0 ? " count-line-difference" : ""}`}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void act({
                        action: "COUNT",
                        itemId: line.id,
                        countedQuantity: Number(data.get("countedQuantity")),
                        justification: String(data.get("justification") ?? "").trim() || undefined,
                      }, `${line.sku}: conteo registrado.`);
                    }}
                  >
                    <div className="count-line-info">
                      <strong>{line.sku} · {line.name}</strong>
                      <small>{line.lot_number ? `Lote ${line.lot_number} · ` : ""}{line.location} · sistema: {String(line.system_quantity)} {line.unit}</small>
                    </div>
                    <input
                      name="countedQuantity"
                      type="number"
                      step="0.001"
                      min="0"
                      defaultValue={counted}
                      placeholder="Contado"
                      disabled={detail.status !== "IN_PROGRESS" || !canCount}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        const diff = countDifference(Number(line.system_quantity), Number.isFinite(value) ? value : null);
                        const field = event.currentTarget.form?.elements.namedItem("justification") as HTMLInputElement | null;
                        if (field) field.required = requiresJustification(diff);
                      }}
                    />
                    <input
                      name="justification"
                      defaultValue={line.justification ?? ""}
                      placeholder="Justificación de la diferencia"
                      disabled={detail.status !== "IN_PROGRESS" || !canCount}
                    />
                    <span className="count-line-diff">
                      {difference === null ? "—" : difference === 0 ? "Sin diferencia" : `${difference > 0 ? "+" : ""}${difference} ${line.unit}`}
                    </span>
                    {detail.status === "IN_PROGRESS" && canCount ? (
                      <button type="submit" className="text-button" disabled={busy}>Guardar</button>
                    ) : null}
                  </form>
                );
              })}
            </div>

            {approving ? (
              <form
                className="signature-inline"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void act({
                    action: "APPROVE",
                    signaturePassword: String(data.get("signaturePassword") ?? ""),
                    note: String(data.get("note") ?? "").trim() || undefined,
                  }, "Ajustes aprobados y aplicados al inventario.").then(() => setApproving(false));
                }}
              >
                <p className="form-section-title">Aprobar los ajustes</p>
                <p className="form-help">Cada diferencia se corregirá con un movimiento de ajuste que queda en el kardex con su justificación.</p>
                <label><span>Nota</span><input name="note" /></label>
                <label>
                  <span>Tu contraseña</span>
                  <div className="input-with-icon">
                    <LockKeyhole size={16} />
                    <input name="signaturePassword" type="password" minLength={8} required autoComplete="current-password" />
                  </div>
                </label>
                <div className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => setApproving(false)}>Cancelar</button>
                  <button type="submit" className="primary-button" disabled={busy}>Firmar y aprobar</button>
                </div>
              </form>
            ) : null}

            <DocumentUploader entityType="physical_count" entityId={countId} label="Hoja de conteo y evidencias" canUpload={canCount} />

            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
              {detail.status === "IN_PROGRESS" && canCount ? (
                <button type="button" className="secondary-button" disabled={busy} onClick={() => void act({ action: "CLOSE" }, "Conteo cerrado, pendiente de aprobación.")}>
                  Cerrar conteo
                </button>
              ) : null}
              {detail.status === "CLOSED" && canApprove && !approving ? (
                <button type="button" className="primary-button" onClick={() => setApproving(true)}><ShieldCheck size={15} /> Aprobar ajustes</button>
              ) : null}
            </footer>
          </>
        )}
      </div>
    </ActionModal>
  );
}

// ─── Disposición final ──────────────────────────────────────────────────────

type DisposalRow = {
  id: string; code: string; quantity: number | string; unit: string; method: string; reason: string;
  detail: string | null; disposal_provider: string | null; manifest_number: string | null;
  disposed_on: string; witnessed_by: string | null; sku: string; item_name: string;
  lot_number: string | null; authorized_by_name: string | null; document_count: number;
};

export function DisposalsTab({ session }: Readonly<{ session?: UserSession }>) {
  const { items, loading, error, reload } = useList<DisposalRow>("/api/compliance/disposals");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<DisposalRow | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();
  const canManage = session ? hasPermission(session, "inventory.manage") : false;

  const rows: TableRow[] = items.map((disposal) => ({
    id: disposal.id,
    code: disposal.code,
    item: `${disposal.sku} · ${disposal.item_name}`,
    quantity: `${disposal.quantity} ${disposal.unit}`,
    reason: DISPOSAL_REASON_LABEL[disposal.reason] ?? disposal.reason,
    method: DISPOSAL_METHOD_LABEL[disposal.method] ?? disposal.method,
    provider: disposal.disposal_provider ?? "—",
    manifest: disposal.manifest_number ?? "—",
    date: formatDate(disposal.disposed_on),
    authorized: disposal.authorized_by_name ?? "—",
    documents: String(disposal.document_count ?? 0),
  }));

  if (error) return <ErrorState description={error} onRetry={() => void reload()} />;

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div>
          <h4>Vencimientos y destrucción</h4>
          <p>Disposición final documentada: qué se destruyó, por qué, con qué método, quién lo autorizó y quién lo presenció.</p>
        </div>
        {canManage ? <button className="secondary-button" onClick={() => setCreateOpen(true)}><Flame size={15} /> Registrar destrucción</button> : null}
      </div>

      <SimpleTable
        columns={[
          { key: "code", label: "Acta" }, { key: "item", label: "Reactivo" }, { key: "quantity", label: "Cantidad" },
          { key: "reason", label: "Motivo" }, { key: "method", label: "Método" }, { key: "provider", label: "Gestor" },
          { key: "manifest", label: "Manifiesto" }, { key: "date", label: "Fecha" },
          { key: "authorized", label: "Autorizó" }, { key: "documents", label: "Docs." },
        ]}
        rows={loading ? [] : rows}
        onRowClick={(row) => setDetail(items.find((disposal) => disposal.id === row.id) ?? null)}
        searchPlaceholder="Buscar por acta, reactivo o manifiesto…"
        emptyTitle={loading ? "Cargando…" : "Sin destrucciones registradas"}
        emptyMessage="Cuando se descarte material vencido o inservible, regístralo aquí con su acta."
      />

      {createOpen ? (
        <DisposalFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (code) => { setCreateOpen(false); showToast(`Acta ${code} registrada y existencia descontada.`); await reload(); }}
          onError={showError}
        />
      ) : null}

      {detail ? (
        <ActionModal open wide eyebrow="DISPOSICIÓN FINAL" title={`Acta ${detail.code}`} description={`${detail.sku} · ${detail.item_name}`} onClose={() => setDetail(null)}>
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Cantidad</small><strong>{detail.quantity} {detail.unit}</strong></div>
              <div><small>Motivo</small><strong>{DISPOSAL_REASON_LABEL[detail.reason] ?? detail.reason}</strong></div>
              <div><small>Método</small><strong>{DISPOSAL_METHOD_LABEL[detail.method] ?? detail.method}</strong></div>
              <div><small>Gestor</small><strong>{detail.disposal_provider ?? "—"}</strong></div>
              <div><small>Manifiesto</small><strong>{detail.manifest_number ?? "—"}</strong></div>
              <div><small>Fecha</small><strong>{formatDate(detail.disposed_on)}</strong></div>
              <div><small>Autorizó</small><strong>{detail.authorized_by_name ?? "—"}</strong></div>
              <div><small>Testigo</small><strong>{detail.witnessed_by ?? "—"}</strong></div>
            </div>
            {detail.detail ? <div className="definition-row"><div><strong>Detalle</strong><p className="research-preserve">{detail.detail}</p></div></div> : null}
            <DocumentUploader entityType="reagent_disposal" entityId={detail.id} label="Acta y manifiesto de destrucción" canUpload={canManage} />
            <footer className="modal-actions"><button className="secondary-button" onClick={() => setDetail(null)}>Cerrar</button></footer>
          </div>
        </ActionModal>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function DisposalFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [inventory, setInventory] = useState<Array<{ id: string; sku: string; name: string; quantity: string; unit: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/inventory").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((payload: { data?: Array<Record<string, unknown>> }) => {
        if (!active) return;
        setInventory((payload.data ?? []).map((row) => ({
          id: String(row.id ?? ""), sku: String(row.sku ?? ""), name: String(row.name ?? ""),
          quantity: String(row.quantity ?? 0), unit: String(row.unit ?? ""),
        })).filter((row) => row.id));
      });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/compliance/disposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: String(data.get("inventoryItemId") ?? ""),
          quantity: Number(data.get("quantity") ?? 0),
          method: String(data.get("method") ?? "AUTHORIZED_MANAGER"),
          reason: String(data.get("reason") ?? "EXPIRED"),
          detail: String(data.get("detail") ?? "").trim() || undefined,
          disposalProvider: String(data.get("disposalProvider") ?? "").trim() || undefined,
          manifestNumber: String(data.get("manifestNumber") ?? "").trim() || undefined,
          disposedOn: String(data.get("disposedOn") ?? "") || undefined,
          witnessedBy: String(data.get("witnessedBy") ?? "").trim() || undefined,
          signaturePassword: String(data.get("signaturePassword") ?? ""),
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo registrar la destrucción.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="DISPOSICIÓN FINAL" title="Registrar destrucción" description="Descuenta la existencia con un movimiento de descarte y deja el acta firmada." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Envase *</span>
            <select name="inventoryItemId" required defaultValue="">
              <option value="" disabled>Selecciona el envase…</option>
              {inventory.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name} ({item.quantity} {item.unit})</option>)}
            </select>
          </label>
          <label><span>Cantidad *</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label>
          <label><span>Fecha</span><input name="disposedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label><span>Motivo *</span>
            <select name="reason" defaultValue="EXPIRED" required>
              {DISPOSAL_REASONS.map((reason) => <option key={reason} value={reason}>{DISPOSAL_REASON_LABEL[reason]}</option>)}
            </select>
          </label>
          <label><span>Método *</span>
            <select name="method" defaultValue="AUTHORIZED_MANAGER" required>
              {DISPOSAL_METHODS.map((method) => <option key={method} value={method}>{DISPOSAL_METHOD_LABEL[method]}</option>)}
            </select>
          </label>
          <label><span>Gestor autorizado</span><input name="disposalProvider" placeholder="Empresa de gestión de residuos" /></label>
          <label><span>Número de manifiesto</span><input name="manifestNumber" /></label>
          <label className="field-span-two"><span>Testigo</span><input name="witnessedBy" placeholder="Nombre de quien presenció la destrucción" /></label>
          <label className="field-span-two"><span>Detalle</span><textarea name="detail" rows={2} /></label>
          <label className="field-span-two">
            <span>Tu contraseña <small>(firma del acta)</small></span>
            <input name="signaturePassword" type="password" minLength={8} required autoComplete="current-password" />
          </label>
          <p className="modal-note field-span-two">
            <Trash2 size={13} /> La destrucción descuenta la existencia y no se puede deshacer: se corrige con un movimiento de ajuste.
          </p>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Registrando…" : "Firmar y registrar"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}
