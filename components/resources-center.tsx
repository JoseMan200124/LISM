"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Boxes, FileCheck2, PackageCheck, Plus, ScanBarcode, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { QrLabelManager, QrScanTester } from "@/components/qr-label-manager";
import { defaultInventoryCategories } from "@/lib/lab-profile";
import { frequencyLabel } from "@/lib/equipment-frequency";
import { CustomFieldInputs, collectCustomValues, useCustomFieldDefs } from "@/components/custom-fields";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type ModalKey = "item" | "movement" | "location" | "equipment" | "plan" | "certificate" | "event" | "equipment-edit" | null;

type CategoryOption = { code: string; name: string; prefix: string };

// ─── Helpers de presentación ────────────────────────────────────────────────

function fmtDate(value: unknown): string {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return String(value); }
}
function fmtDateTime(value: unknown): string {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return String(value); }
}
function dateToIso(value: unknown): string | undefined {
  const date = String(value || "");
  return date ? `${date}T00:00:00.000Z` : undefined;
}
async function responseMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || `Solicitud rechazada (${response.status}).`;
  } catch {
    return `Solicitud rechazada (${response.status}).`;
  }
}

const INVENTORY_STATUS_LABEL: Record<string, string> = { REORDER: "Reponer", WATCH: "Vigilar", AVAILABLE: "Disponible" };
const EQUIPMENT_STATUS_LABEL: Record<string, string> = { OPERATIONAL: "Operativo", MAINTENANCE_DUE: "Mantenimiento próximo", OUT_OF_SERVICE: "Fuera de servicio", RETIRED: "Inactivo" };
const MOVEMENT_TYPE_LABEL: Record<string, string> = { RECEIPT: "Entrada", CONSUMPTION: "Consumo", ADJUSTMENT: "Ajuste", DISPOSAL: "Descarte", TRANSFER: "Transferencia", RETURN: "Devolución" };
const PLAN_TYPE_LABEL: Record<string, string> = { VERIFICATION: "Verificación", CALIBRATION: "Calibración", MAINTENANCE: "Mantenimiento", QUALIFICATION: "Calificación", CLEANING: "Limpieza" };
const CERT_TYPE_LABEL: Record<string, string> = { CALIBRATION: "Calibración", QUALIFICATION: "Calificación", MAINTENANCE: "Mantenimiento", REPAIR: "Reparación" };

function planTypeFor(label: string): string {
  const entry = Object.entries(PLAN_TYPE_LABEL).find(([, value]) => value === label);
  return entry?.[0] ?? "VERIFICATION";
}
function certificateTypeFor(label: string): string {
  const entry = Object.entries(CERT_TYPE_LABEL).find(([, value]) => value === label);
  return entry?.[0] ?? "CALIBRATION";
}
function eventTypeFor(label: string): string {
  const map: Record<string, string> = { "Verificación": "VERIFICATION", "Mantenimiento": "MAINTENANCE", "Calibración": "CALIBRATION", "Reparación": "REPAIR", "Limpieza": "CLEANING" };
  return map[label] ?? "VERIFICATION";
}

// ─── Tipos de fila crudos (para clic en fila) ───────────────────────────────

type EquipmentRaw = {
  id: string; code: string; name: string; manufacturer?: string; model?: string; serial_number?: string;
  location?: string; storage_location_id?: string | null; status: string; notes?: string | null;
  responsible_user_id?: string | null; responsible?: string;
  next_calibration_at?: string | null; plan_next_maintenance_at?: string | null;
  next_maintenance_at?: string | null; next_qualification_at?: string | null;
};

// ─── Hook simple de carga ────────────────────────────────────────────────────

type LoadState = "loading" | "error" | "ready";

// Lee ?filter= de la URL (enviado desde el dashboard clicable).
function readFilterQuery(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("filter");
}

// ─── Inventario ──────────────────────────────────────────────────────────────

export function InventoryCenter() {
  const [tab, setTab] = useState("lots");
  const [modal, setModal] = useState<ModalKey>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [items, setItems] = useState<TableRow[]>([]);
  const [movements, setMovements] = useState<TableRow[]>([]);
  const [locations, setLocations] = useState<TableRow[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const inventoryDefs = useCustomFieldDefs("inventory");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await fetch(`/api/inventory/${id}`);
      if (res.ok) { const p = await res.json() as { data?: Record<string, unknown> }; setDetail(p.data ?? null); }
      else showError(await responseMessage(res));
    } catch { showError("No se pudo cargar el detalle del artículo."); }
    finally { setDetailLoading(false); }
  }
  async function discardItem(id: string, body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/inventory/${id}/discard`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) { showError(await responseMessage(res)); return false; }
      const p = await res.json() as { data?: { archived?: boolean } };
      showToast(p.data?.archived ? "Descarte registrado. El lote quedó agotado y archivado." : "Descarte registrado y existencia recalculada.");
      setDetail(null); await load(); return true;
    } catch { showError("No se pudo conectar con el servidor."); return false; }
  }
  async function archiveItem(id: string) {
    if (!window.confirm("¿Archivar este artículo? Dejará de aparecer en el inventario activo, pero conserva su historial.")) return;
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "ARCHIVED" }) });
      if (!res.ok) { showError(await responseMessage(res)); return; }
      showToast("Artículo archivado."); setDetail(null); await load();
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  useEffect(() => { if (readFilterQuery() === "low-stock") setLowStockOnly(true); }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [iRes, mRes, lRes, cRes] = await Promise.all([
        fetch("/api/inventory"),
        fetch("/api/inventory/movements"),
        fetch("/api/locations"),
        fetch("/api/inventory/categories"),
      ]);
      if (!iRes.ok) { setState("error"); return; }
      const iData = await iRes.json() as { data?: Array<Record<string, unknown>> };
      const mData = mRes.ok ? await mRes.json() as { data?: Array<Record<string, unknown>> } : { data: [] };
      const lData = lRes.ok ? await lRes.json() as { data?: Array<Record<string, unknown>> } : { data: [] };
      const cData = cRes.ok ? await cRes.json() as { data?: Array<{ code: string; name: string; prefix?: string }> } : { data: [] };

      setItems((iData.data ?? []).map((r) => ({
        id: String(r.id ?? ""),
        sku: String(r.sku ?? "—"),
        name: String(r.name ?? "—"),
        category: String(r.category ?? "—"),
        lot: String(r.lot_number ?? "—") || "—",
        location: String(r.location ?? "—"),
        quantity: `${r.quantity ?? 0} ${r.unit ?? ""}`.trim(),
        minimum: `${r.reorder_point ?? 0} ${r.unit ?? ""}`.trim(),
        expires: fmtDate(r.expires_at),
        status: INVENTORY_STATUS_LABEL[String(r.status)] ?? String(r.status ?? "—"),
      })));
      setMovements((mData.data ?? []).map((r) => ({
        code: String(r.id ?? "").slice(0, 8),
        item: String(r.name ?? "—"),
        lot: String(r.lot_number ?? "—") || "—",
        type: MOVEMENT_TYPE_LABEL[String(r.movement_type)] ?? String(r.movement_type ?? "—"),
        quantity: String(r.quantity_delta ?? "—"),
        performedBy: String(r.performed_by ?? "—"),
        when: fmtDateTime(r.performed_at),
      })));
      setLocations((lData.data ?? []).map((r) => ({
        code: String(r.code ?? "—"),
        hierarchy: String(r.name ?? "—"),
        type: String(r.location_type ?? "—") || "—",
        status: String(r.status) === "ACTIVE" ? "Activa" : String(r.status ?? "—"),
      })));
      const cats = (cData.data ?? []).filter((c) => c.code).map((c) => ({ code: c.code, name: c.name, prefix: c.prefix ?? c.code }));
      setCategories(cats.length ? cats : [...defaultInventoryCategories]);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const reorderCount = items.filter((item) => item.status === "Reponer").length;
  const watchCount = items.filter((item) => item.status === "Vigilar").length;

  const filteredItems = useMemo(() => {
    let result = items;
    if (lowStockOnly) result = result.filter((item) => item.status === "Reponer");
    if (activeCategory !== "ALL") {
      const cat = categories.find((c) => c.code === activeCategory);
      if (cat) {
        result = result.filter((item) => {
          const sku = String(item.sku ?? "").toUpperCase();
          const category = String(item.category ?? "").toLowerCase();
          return sku.startsWith(cat.prefix.toUpperCase()) || category.includes(cat.name.toLowerCase().slice(0, 6));
        });
      }
    }
    return result;
  }, [items, activeCategory, categories, lowStockOnly]);

  async function addItem(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Artículo creado con su etiqueta QR segura.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El artículo no se guardó. Intenta de nuevo.");
      return false;
    }
  }
  async function addMovement(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/inventory/movements", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Movimiento guardado y existencia recalculada.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El movimiento no se guardó. Intenta de nuevo.");
      return false;
    }
  }
  async function addLocation(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/locations", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Ubicación guardada correctamente.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. La ubicación no se guardó. Intenta de nuevo.");
      return false;
    }
  }

  if (state === "loading") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="RECURSOS Y TRAZABILIDAD" title="Inventario por lote" description="Controla reactivos, materiales, consumibles, ubicaciones, movimientos y etiquetas QR." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={5} cols={9} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="RECURSOS Y TRAZABILIDAD" title="Inventario por lote" description="Controla reactivos, materiales, consumibles, ubicaciones, movimientos y etiquetas QR." />
        <ErrorState description="No se pudo cargar el inventario. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="RECURSOS Y TRAZABILIDAD" title="Inventario por lote" description="Controla reactivos, materiales, consumibles, ubicaciones, movimientos y etiquetas QR.">
        <button className="secondary-button" data-tutorial="inventory-scan-qr" onClick={() => setScannerOpen(true)}><ScanBarcode size={15} /> Escanear QR</button>
        <button className="primary-button" data-tutorial="inventory-new-item" onClick={() => setModal("item")}><Plus size={15} /> Nuevo artículo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Lotes activos", value: String(items.length), hint: `${locations.length} ubicaciones`, icon: Boxes },
        { label: "Por reponer", value: String(reorderCount), hint: reorderCount ? "Requiere atención" : "Sin alertas", icon: PackageCheck },
        { label: "Próximos a vencer", value: String(watchCount), hint: watchCount ? "Revisar vencimientos" : "Sin próximos", icon: ShieldCheck },
      ]} />
      <InlineNotice title="Stock calculado por movimientos">Las existencias no se editan manualmente. Cada entrada, salida, ajuste, transferencia o descarte genera una bitácora con responsable y motivo.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "lots", label: "Lotes" }, { key: "movements", label: "Movimientos" }, { key: "locations", label: "Ubicaciones" }, { key: "qr", label: "QR y etiquetas" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "lots" ? (
            <section>
              <div className="section-heading">
                <div><h2>Existencias por lote</h2><p>Cada lote conserva proveedor, vencimiento, ubicación, ficha de seguridad y trazabilidad de uso.</p></div>
                <button className="secondary-button" onClick={() => setModal("movement")} disabled={items.length === 0}><Plus size={15} /> Registrar consumo</button>
              </div>
              {lowStockOnly ? (
                <div className="filter-active-chip">Mostrando solo <strong>bajo mínimo</strong><button type="button" onClick={() => setLowStockOnly(false)} aria-label="Quitar filtro">✕</button></div>
              ) : null}
              <div className="filter-chip-row" role="group" aria-label="Filtrar por categoría">
                <button type="button" className={`filter-chip${activeCategory === "ALL" ? " filter-chip-active" : ""}`} onClick={() => setActiveCategory("ALL")}>Todos</button>
                {categories.map((cat) => (
                  <button key={cat.code} type="button" className={`filter-chip${activeCategory === cat.code ? " filter-chip-active" : ""}`} onClick={() => setActiveCategory(cat.code)}>
                    {cat.prefix}<span className="filter-chip-label">{cat.name}</span>
                  </button>
                ))}
              </div>
              <SimpleTable
                columns={[{ key: "sku", label: "Código" }, { key: "name", label: "Artículo" }, { key: "category", label: "Categoría" }, { key: "lot", label: "Lote" }, { key: "location", label: "Ubicación" }, { key: "quantity", label: "Existencia" }, { key: "minimum", label: "Mínimo" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]}
                rows={filteredItems}
                onRowClick={(row) => { if (row.id) void openDetail(String(row.id)); }}
                searchPlaceholder="Buscar reactivo, lote o ubicación…"
                emptyTitle="Sin artículos todavía"
                emptyMessage="Crea un nuevo artículo para comenzar a controlar tu inventario."
              />
            </section>
          ) : null}
          {tab === "movements" ? <ResourceSection title="Bitácora de movimientos" copy="Cada uso, entrada, ajuste o descarte queda trazado con responsable y motivo." action="Nuevo movimiento" onAction={() => setModal("movement")} disabled={items.length === 0}><SimpleTable columns={[{ key: "code", label: "Movimiento" }, { key: "item", label: "Artículo" }, { key: "lot", label: "Lote" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "performedBy", label: "Responsable" }, { key: "when", label: "Momento" }]} rows={movements} emptyTitle="Sin movimientos" emptyMessage="Los movimientos aparecerán aquí cuando registres entradas o consumos." /></ResourceSection> : null}
          {tab === "locations" ? <ResourceSection title="Ubicaciones jerárquicas" copy="Organiza sedes, laboratorios, armarios, refrigeradores, estantes y cajas para encontrar cada recurso." action="Nueva ubicación" onAction={() => setModal("location")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "hierarchy", label: "Ruta" }, { key: "type", label: "Tipo" }, { key: "status", label: "Estado" }]} rows={locations} emptyTitle="Sin ubicaciones" emptyMessage="Crea una ubicación para asignarla a tus artículos y equipos." /></ResourceSection> : null}
          {tab === "qr" ? <QrLabelManager entityType="INVENTORY_ITEM" /> : null}
        </div>
      </article>
      <InventoryDetailModal open={detailLoading || Boolean(detail)} loading={detailLoading} item={detail} defs={inventoryDefs} onClose={() => setDetail(null)} onDiscard={discardItem} onArchive={archiveItem} />
      <InventoryItemModal open={modal === "item"} categories={categories} onClose={() => setModal(null)} onSave={addItem} />
      <InventoryMovementModal open={modal === "movement"} items={items} onClose={() => setModal(null)} onSave={addMovement} />
      <LocationModal open={modal === "location"} onClose={() => setModal(null)} onSave={addLocation} />
      <QrScanTester open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Equipos ─────────────────────────────────────────────────────────────────

export function EquipmentCenter() {
  const [tab, setTab] = useState("master");
  const [modal, setModal] = useState<ModalKey>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [state, setState] = useState<LoadState>("loading");
  const [equipment, setEquipment] = useState<EquipmentRaw[]>([]);
  const [plans, setPlans] = useState<TableRow[]>([]);
  const [certificates, setCertificates] = useState<TableRow[]>([]);
  const [editing, setEditing] = useState<EquipmentRaw | null>(null);
  const [operationalOnly, setOperationalOnly] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => { if (readFilterQuery() === "operational") setOperationalOnly(true); }, []);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const [eRes, pRes, cRes] = await Promise.all([
        fetch("/api/equipment"),
        fetch("/api/equipment/plans"),
        fetch("/api/equipment/certificates"),
      ]);
      if (!eRes.ok) { setState("error"); return; }
      const eData = await eRes.json() as { data?: EquipmentRaw[] };
      const pData = pRes.ok ? await pRes.json() as { data?: Array<Record<string, unknown>> } : { data: [] };
      const cData = cRes.ok ? await cRes.json() as { data?: Array<Record<string, unknown>> } : { data: [] };

      setEquipment((eData.data ?? []).map((r) => ({ ...r, id: String(r.id) })));
      setPlans((pData.data ?? []).map((r) => ({
        code: String(r.equipment_code ?? "—"),
        equipment: String(r.equipment_name ?? "—"),
        plan: PLAN_TYPE_LABEL[String(r.plan_type)] ?? String(r.plan_type ?? "—"),
        frequency: frequencyLabel(r.frequency_value, r.frequency_unit),
        next: String(r.frequency_unit) === "USE" ? "Al utilizar" : fmtDate(r.next_due_at),
        blocking: r.blocks_use_when_overdue ? "Sí" : "No",
        status: String(r.status) === "ACTIVE" ? "Vigente" : String(r.status ?? "—"),
      })));
      setCertificates((cData.data ?? []).map((r) => {
        const expired = r.expires_at ? new Date(String(r.expires_at)).getTime() < Date.now() : false;
        return {
          code: String(r.certificate_number ?? "—") || "—",
          equipment: String(r.equipment_name ?? "—"),
          type: CERT_TYPE_LABEL[String(r.certificate_type)] ?? String(r.certificate_type ?? "—"),
          provider: String(r.provider_name ?? "—") || "—",
          issued: fmtDate(r.issued_at),
          expires: fmtDate(r.expires_at),
          status: expired ? "Vencido" : "Vigente",
        };
      }));
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const shownEquipment = operationalOnly ? equipment.filter((e) => e.status === "OPERATIONAL") : equipment;
  const equipmentRows: TableRow[] = shownEquipment.map((e) => ({
    id: e.id,
    code: e.code,
    name: e.name,
    area: e.location ?? "—",
    status: EQUIPMENT_STATUS_LABEL[e.status] ?? e.status,
    calibration: fmtDate(e.next_calibration_at),
    maintenance: fmtDate(e.plan_next_maintenance_at ?? e.next_maintenance_at),
    qualification: fmtDate(e.next_qualification_at),
    responsible: e.responsible ?? "—",
  }));

  async function addEquipment(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/equipment", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Equipo registrado con su etiqueta QR segura.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El equipo no se guardó. Intenta de nuevo.");
      return false;
    }
  }
  async function editEquipment(id: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(`/api/equipment/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Equipo actualizado.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. Los cambios no se guardaron. Intenta de nuevo.");
      return false;
    }
  }
  async function addPlan(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/equipment/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Plan periódico guardado. La ficha del equipo se actualizó.");
      await load(); // refresca equipos: la próxima fecha del equipo sale de sus planes
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El plan no se guardó. Intenta de nuevo.");
      return false;
    }
  }
  async function addCertificate(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/equipment/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Certificado registrado en el historial.");
      await load();
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El certificado no se guardó. Intenta de nuevo.");
      return false;
    }
  }
  async function addEvent(payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch("/api/equipment/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Evento de equipo registrado en la bitácora.");
      return true;
    } catch {
      showError("No se pudo conectar con el servidor. El evento no se guardó. Intenta de nuevo.");
      return false;
    }
  }

  if (state === "loading") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos, planes y certificados" description="Programa verificaciones, calibraciones y mantenimientos con bloqueos configurables." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={5} cols={8} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }
  if (state === "error") {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos, planes y certificados" description="Programa verificaciones, calibraciones y mantenimientos con bloqueos configurables." />
        <ErrorState description="No se pudieron cargar los equipos. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos, planes y certificados" description="Programa verificaciones, calibraciones y mantenimientos con bloqueos configurables.">
        <button className="secondary-button" onClick={() => setScannerOpen(true)}><ScanBarcode size={15} /> Escanear equipo</button>
        <button className="primary-button" data-tutorial="equipment-new" onClick={() => setModal("equipment")}><Plus size={15} /> Nuevo equipo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Equipos registrados", value: String(equipment.length), hint: `${equipment.filter((e) => e.status === "OPERATIONAL").length} operativos`, icon: Wrench },
        { label: "Planes activos", value: String(plans.filter((p) => p.status === "Vigente").length), hint: "Verificación, calibración, mantenimiento", icon: ShieldCheck },
        { label: "Certificados", value: `${certificates.length}`, hint: `${certificates.filter((c) => c.status === "Vigente").length} vigentes`, icon: FileCheck2 },
      ]} />
      <InlineNotice title="Bloqueo preventivo configurable">Un equipo puede quedar inhabilitado para nuevos análisis cuando su calibración, verificación o mantenimiento crítico esté vencido.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "master", label: "Equipos" }, { key: "plans", label: "Planes" }, { key: "certificates", label: "Certificados" }, { key: "qr", label: "QR" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "master" ? (
            <ResourceSection title="Equipos" copy="Haz clic en un equipo para ver detalle y editar. Las próximas fechas provienen de sus planes." action="Registrar evento" onAction={() => setModal("event")} disabled={equipment.length === 0}>
              {operationalOnly ? (
                <div className="filter-active-chip">Mostrando solo <strong>operativos</strong><button type="button" onClick={() => setOperationalOnly(false)} aria-label="Quitar filtro">✕</button></div>
              ) : null}
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "name", label: "Equipo" }, { key: "area", label: "Ubicación" }, { key: "status", label: "Estado" }, { key: "calibration", label: "Próx. calibración" }, { key: "maintenance", label: "Próx. mantenimiento" }, { key: "qualification", label: "Próx. calificación" }, { key: "responsible", label: "Responsable" }]}
                rows={equipmentRows}
                onRowClick={(row) => { const found = equipment.find((e) => e.id === row.id); if (found) { setEditing(found); setModal("equipment-edit"); } }}
                emptyTitle="Sin equipos todavía"
                emptyMessage="Registra un equipo para gestionar sus planes, certificados y QR."
              />
            </ResourceSection>
          ) : null}
          {tab === "plans" ? <ResourceSection title="Planes periódicos" copy="Define frecuencia por calendario o por uso, anticipación de alertas y si el incumplimiento bloquea el uso." action="Nuevo plan" onAction={() => setModal("plan")} disabled={equipment.length === 0}><SimpleTable columns={[{ key: "code", label: "Equipo" }, { key: "equipment", label: "Nombre" }, { key: "plan", label: "Plan" }, { key: "frequency", label: "Frecuencia" }, { key: "next", label: "Próximo" }, { key: "blocking", label: "Bloquea uso" }, { key: "status", label: "Estado" }]} rows={plans} emptyTitle="Sin planes" emptyMessage="Crea un plan de calibración, mantenimiento o verificación para un equipo." /></ResourceSection> : null}
          {tab === "certificates" ? <ResourceSection title="Certificados y evidencia" copy="Adjunta PDF, fotografías, proveedor, alcance, incertidumbre y fecha de vigencia." action="Adjuntar certificado" actionTutorialId="equipment-certificates" onAction={() => setModal("certificate")} disabled={equipment.length === 0}><SimpleTable columns={[{ key: "code", label: "Número" }, { key: "equipment", label: "Equipo" }, { key: "type", label: "Tipo" }, { key: "provider", label: "Proveedor" }, { key: "issued", label: "Emitido" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]} rows={certificates} emptyTitle="Sin certificados" emptyMessage="Adjunta el primer certificado o evidencia de un equipo." /></ResourceSection> : null}
          {tab === "qr" ? <QrLabelManager entityType="EQUIPMENT" /> : null}
        </div>
      </article>
      <EquipmentModal open={modal === "equipment"} onClose={() => setModal(null)} onSave={addEquipment} />
      <EquipmentEditModal open={modal === "equipment-edit"} equipment={editing} onClose={() => { setModal(null); setEditing(null); }} onSave={editEquipment} />
      <EquipmentPlanModal open={modal === "plan"} equipment={equipment} onClose={() => setModal(null)} onSave={addPlan} />
      <CertificateModal open={modal === "certificate"} equipment={equipment} onClose={() => setModal(null)} onSave={addCertificate} />
      <EquipmentEventModal open={modal === "event"} equipment={equipment} onClose={() => setModal(null)} onSave={addEvent} />
      <QrScanTester open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ResourceSection({ title, copy, action, onAction, actionTutorialId, disabled, children }: Readonly<{ title: string; copy: string; action: string; onAction: () => void; actionTutorialId?: string; disabled?: boolean; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button" data-tutorial={actionTutorialId} onClick={onAction} disabled={disabled}><Plus size={15} /> {action}</button></div>{children}</section>;
}

// ─── Modales ─────────────────────────────────────────────────────────────────

function ModalFooter({ onClose, saving }: Readonly<{ onClose: () => void; saving?: boolean }>) {
  return <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer>;
}

function InventoryDetailModal({ open, loading, item, defs, onClose, onDiscard, onArchive }: Readonly<{
  open: boolean; loading: boolean; item: Record<string, unknown> | null;
  defs: ReturnType<typeof useCustomFieldDefs>;
  onClose: () => void; onDiscard: (id: string, body: Record<string, unknown>) => Promise<boolean>; onArchive: (id: string) => void;
}>) {
  const [discarding, setDiscarding] = useState(false);
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const id = item ? String(item.id) : "";
  const cv = (item?.custom_values ?? {}) as Record<string, unknown>;
  const movements = (item?.movements ?? []) as Array<Record<string, unknown>>;

  async function submitDiscard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await onDiscard(id, {
      quantity: Number(data.get("quantity") ?? 0),
      reason: String(data.get("reason") ?? "").trim(),
      note: String(data.get("note") ?? "").trim(),
    });
    setSaving(false);
    if (ok) setDiscarding(false);
  }

  return (
    <ActionModal open={open} title={item ? `${item.sku} · ${item.name}` : "Artículo"} description="Ficha del artículo: datos, campos personalizados, historial y acciones." onClose={onClose}>
      <div className="modal-form">
        {loading || !item ? <p>Cargando…</p> : (
          <>
            <div className="details-grid">
              <div><small>Categoría</small><strong>{String(item.category ?? "—")}</strong></div>
              <div><small>Existencia</small><strong>{String(item.quantity ?? 0)} {String(item.unit ?? "")}</strong></div>
              <div><small>Mínimo</small><strong>{String(item.reorder_point ?? 0)} {String(item.unit ?? "")}</strong></div>
              <div><small>Ubicación</small><strong>{String(item.location ?? "—")}</strong></div>
              <div><small>Lote</small><strong>{String(item.lot_number ?? "—") || "—"}</strong></div>
              <div><small>Proveedor</small><strong>{String(item.vendor ?? "—") || "—"}</strong></div>
              <div><small>Vence</small><strong>{fmtDate(item.expires_at)}</strong></div>
              <div><small>Estado</small><strong>{String(item.status) === "ARCHIVED" ? "Archivado" : "Activo"}</strong></div>
              {item.safety_sheet_url ? <div className="field-span-two"><small>Ficha de seguridad</small><strong><a href={String(item.safety_sheet_url)} target="_blank" rel="noreferrer">Abrir ficha</a></strong></div> : null}
            </div>
            {defs.length > 0 ? (
              <div className="details-grid" style={{ marginTop: 10 }}>
                {defs.map((d) => <div key={d.id}><small>{d.label}</small><strong>{cv[d.field_key] === undefined || cv[d.field_key] === "" ? "—" : String(cv[d.field_key])}</strong></div>)}
              </div>
            ) : null}
            <p className="form-section-title" style={{ marginTop: 14 }}>Historial de movimientos</p>
            {movements.length === 0 ? <p className="modal-note">Sin movimientos registrados.</p> : (
              <div className="definition-list">
                {movements.slice(0, 8).map((m) => (
                  <article key={String(m.id)} className="definition-row">
                    <div><strong>{MOVEMENT_TYPE_LABEL[String(m.movement_type)] ?? String(m.movement_type)}</strong><p>{String(m.note ?? "") || String(m.reason_code ?? "")}</p></div>
                    <small>{String(m.quantity_delta)} → {String(m.resulting_quantity)}</small>
                    <em>{fmtDateTime(m.performed_at)}</em>
                  </article>
                ))}
              </div>
            )}
            {discarding ? (
              <form className="inline-editor" onSubmit={submitDiscard} style={{ marginTop: 12 }}>
                <label><span>Cantidad a descartar</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label>
                <label><span>Motivo</span><input name="reason" required placeholder="Vencido, contaminado, roto…" /></label>
                <label><span>Observación</span><input name="note" placeholder="Detalle opcional" /></label>
                <button className="primary-button" type="submit" disabled={saving}>{saving ? "Registrando…" : "Confirmar descarte"}</button>
              </form>
            ) : null}
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
              {String(item.status) !== "ARCHIVED" ? <button type="button" className="secondary-button" onClick={() => onArchive(id)}><Archive size={15} /> Archivar</button> : null}
              {String(item.status) !== "ARCHIVED" ? <button type="button" className="primary-button" onClick={() => setDiscarding((c) => !c)}><Trash2 size={15} /> Descartar</button> : null}
            </footer>
          </>
        )}
      </div>
    </ActionModal>
  );
}

function InventoryItemModal({ open, categories, onClose, onSave }: Readonly<{ open: boolean; categories: CategoryOption[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const customDefs = useCustomFieldDefs("inventory");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const safetySheet = String(data.get("safetySheetUrl") ?? "").trim();
    setSaving(true);
    const ok = await onSave({
      sku: String(data.get("sku") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      categoryName: String(data.get("category") ?? "").trim() || undefined,
      storageLocationName: String(data.get("location") ?? "").trim() || undefined,
      lotNumber: String(data.get("lot") ?? "").trim(),
      quantity: Number(data.get("quantity") ?? 0),
      reorderPoint: Number(data.get("minimum") ?? 0),
      unit: String(data.get("unit") ?? "unidades").trim() || "unidades",
      expiresAt: String(data.get("expires") ?? "") || null,
      receivedAt: String(data.get("receivedAt") ?? "") || null,
      vendor: String(data.get("vendor") ?? "").trim(),
      internalFormula: String(data.get("formula") ?? "").trim(),
      safetySheetUrl: safetySheet,
      requiresUsageLog: data.get("requiresUsageLog") === "on",
      customValues: collectCustomValues(customDefs, data),
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Registrar artículo o lote" description="El código interno identifica el recurso y su etiqueta QR." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><span className="form-section-title field-span-two">Identificación</span><label><span>Código interno</span><input name="sku" required placeholder="RQ-0001" /></label><label><span>Nombre</span><input name="name" required placeholder="Reactivo o material" /></label><label><span>Categoría</span><input name="category" required list="inv-cats" placeholder="Reactivos químicos" /><datalist id="inv-cats">{categories.map((cat) => <option key={cat.code} value={cat.name} />)}</datalist></label><label><span>Lote (opcional)</span><input name="lot" placeholder="Déjalo vacío si no aplica" /></label><span className="form-section-title field-span-two">Origen y ubicación</span><label><span>Proveedor</span><input name="vendor" placeholder="Proveedor opcional" /></label><label><span>Fórmula</span><input name="formula" placeholder="HCl 0.1 N" /></label><label><span>Ubicación</span><input name="location" placeholder="Armario C1" /></label><label><span>Fecha de ingreso</span><input name="receivedAt" type="date" /></label><label><span>Fecha de vencimiento</span><input name="expires" type="date" /></label><span className="form-section-title field-span-two">Existencias</span><label><span>Existencia inicial</span><input name="quantity" required type="number" min="0" step="0.001" /></label><label><span>Stock mínimo</span><input name="minimum" required type="number" min="0" step="0.001" /></label><label><span>Unidad</span><input name="unit" required defaultValue="unidades" /></label><span className="form-section-title field-span-two">Control y seguridad</span><label className="checkbox-line field-span-two"><input name="requiresUsageLog" type="checkbox" /><span>Requiere control de consumo (recomendado para reactivos y medios de cultivo)</span></label><label className="field-span-two"><span>URL de ficha de seguridad</span><input name="safetySheetUrl" type="url" placeholder="https://.../ficha-seguridad.pdf" /></label><CustomFieldInputs defs={customDefs} /></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function InventoryMovementModal({ open, items, onClose, onSave }: Readonly<{ open: boolean; items: TableRow[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const itemId = String(data.get("itemId") ?? "");
    if (!itemId) return;
    const quantity = Number(data.get("quantity") ?? 0);
    const type = String(data.get("type"));
    const movementType = type === "Entrada" ? "RECEIPT" : type === "Ajuste positivo" || type === "Ajuste negativo" ? "ADJUSTMENT" : type === "Descarte" ? "DISPOSAL" : type === "Transferencia" ? "TRANSFER" : "CONSUMPTION";
    const direction = type === "Entrada" || type === "Ajuste positivo" ? "IN" : "OUT";
    setSaving(true);
    const ok = await onSave({ inventoryItemId: itemId, movementType, quantity: Math.abs(quantity), direction, reasonCode: "REGISTRO_UI", note: String(data.get("reason") ?? "") });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Registrar movimiento" description="Entrada = agregar existencia · Consumo = registrar uso · Ajuste = corregir · Descarte = retirar inutilizable." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Artículo</span><select name="itemId" required>{items.map((item) => <option key={String(item.id)} value={String(item.id)}>{item.sku} · {item.name}</option>)}</select></label><label><span>Tipo</span><select name="type"><option value="Consumo">Consumo (registrar uso)</option><option value="Entrada">Entrada (agregar existencia)</option><option value="Ajuste positivo">Ajuste positivo (corregir +)</option><option value="Ajuste negativo">Ajuste negativo (corregir −)</option><option value="Transferencia">Transferencia (cambiar de ubicación)</option><option value="Descarte">Descarte (retirar inutilizable)</option></select></label><label><span>Cantidad</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label><label><span>Motivo o práctica relacionada</span><textarea name="reason" required rows={3} /></label></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function LocationModal({ open, onClose, onSave }: Readonly<{ open: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await onSave({ code: String(data.get("code") ?? "").trim(), name: String(data.get("hierarchy") ?? "").trim(), locationType: String(data.get("type") ?? "").trim() });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Nueva ubicación" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Código</span><input name="code" required placeholder="ARM-C2" /></label><label><span>Ruta jerárquica</span><input name="hierarchy" required placeholder="Sede central → Laboratorio → Armario C2" /></label><label><span>Tipo</span><input name="type" required placeholder="Armario" /></label></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function EquipmentModal({ open, onClose, onSave }: Readonly<{ open: boolean; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const customDefs = useCustomFieldDefs("equipment");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await onSave({
      code: String(data.get("code") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      manufacturer: String(data.get("brand") ?? "").trim(),
      model: String(data.get("model") ?? "").trim(),
      serialNumber: String(data.get("serial") ?? "").trim(),
      locationName: String(data.get("location") ?? "").trim() || undefined,
      status: String(data.get("status") ?? "OPERATIONAL"),
      nextMaintenanceAt: String(data.get("maintenance") ?? "") || null,
      notes: String(data.get("notes") ?? "").trim(),
      customValues: collectCustomValues(customDefs, data),
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Registrar equipo" description="El equipo quedará disponible para planes, certificados y etiqueta QR." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><span className="form-section-title field-span-two">Identificación</span><label><span>Código</span><input name="code" required placeholder="EQ-MIC-010" /></label><label><span>Nombre</span><input name="name" required /></label><label><span>Marca</span><input name="brand" /></label><label><span>Modelo</span><input name="model" /></label><label><span>Serie</span><input name="serial" /></label><label><span>Estado</span><select name="status" defaultValue="OPERATIONAL"><option value="OPERATIONAL">Operativo</option><option value="MAINTENANCE_DUE">Mantenimiento próximo</option><option value="OUT_OF_SERVICE">Fuera de servicio</option><option value="RETIRED">Inactivo</option></select></label><span className="form-section-title field-span-two">Ubicación y mantenimiento</span><label><span>Ubicación</span><input name="location" placeholder="Laboratorio de microbiología" /></label><label><span>Próximo mantenimiento (opcional)</span><input name="maintenance" type="date" /></label><label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} placeholder="Detalles del equipo, responsable, condiciones…" /></label><CustomFieldInputs defs={customDefs} /></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function EquipmentEditModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentRaw | null; onClose: () => void; onSave: (id: string, payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  if (!open || !equipment) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!equipment) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await onSave(equipment.id, {
      name: String(data.get("name") ?? "").trim(),
      manufacturer: String(data.get("brand") ?? "").trim(),
      model: String(data.get("model") ?? "").trim(),
      serialNumber: String(data.get("serial") ?? "").trim(),
      status: String(data.get("status") ?? equipment.status),
      notes: String(data.get("notes") ?? "").trim(),
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title={`Editar ${equipment.code}`} description="Actualiza los datos del equipo. Las próximas fechas se gestionan desde Planes." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label className="field-span-two"><span>Nombre</span><input name="name" required defaultValue={equipment.name} /></label><label><span>Marca</span><input name="brand" defaultValue={equipment.manufacturer ?? ""} /></label><label><span>Modelo</span><input name="model" defaultValue={equipment.model ?? ""} /></label><label><span>Serie</span><input name="serial" defaultValue={equipment.serial_number ?? ""} /></label><label><span>Estado</span><select name="status" defaultValue={equipment.status}><option value="OPERATIONAL">Operativo</option><option value="MAINTENANCE_DUE">Mantenimiento próximo</option><option value="OUT_OF_SERVICE">Fuera de servicio</option><option value="RETIRED">Inactivo</option></select></label><label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={3} defaultValue={equipment.notes ?? ""} /></label></div><footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></form></ActionModal>;
}

function EquipmentPlanModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentRaw[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const [unit, setUnit] = useState("MONTH");
  const byUse = unit === "USE";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const equipmentId = String(data.get("equipmentId") ?? "");
    if (!equipmentId) return;
    setSaving(true);
    const ok = await onSave({
      equipmentId,
      planType: planTypeFor(String(data.get("plan"))),
      name: String(data.get("plan")),
      frequencyUnit: unit,
      frequencyValue: byUse ? undefined : Number(data.get("frequencyValue") ?? 1),
      nextDueAt: byUse ? undefined : dateToIso(data.get("next")),
      blocksUseWhenOverdue: data.get("blocking") === "on",
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Nuevo plan periódico" description="Frecuencia por calendario (diaria, semanal, mensual, anual) o por uso." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label className="field-span-two"><span>Equipo</span><select name="equipmentId" required>{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Tipo de plan</span><select name="plan"><option>Verificación</option><option>Calibración</option><option>Mantenimiento</option><option>Calificación</option><option>Limpieza</option></select></label><label><span>Frecuencia</span><select name="frequencyUnit" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="USE">Cada uso</option><option value="DAY">Días</option><option value="WEEK">Semanas</option><option value="MONTH">Meses</option><option value="YEAR">Años</option></select></label>{byUse ? null : <label><span>Cada cuántos/as</span><input name="frequencyValue" type="number" min="1" step="1" defaultValue="1" /></label>}{byUse ? null : <label><span>Próxima fecha</span><input name="next" type="date" /></label>}<label className="checkbox-line field-span-two"><input name="blocking" type="checkbox" /><span>Bloquear uso cuando esté vencido</span></label>{byUse ? <p className="modal-note field-span-two">Los planes por uso no requieren fecha: se muestran como “Al utilizar” y la verificación se registra al usar el equipo.</p> : null}</div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function CertificateModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentRaw[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const equipmentId = String(data.get("equipmentId") ?? "");
    if (!equipmentId) return;
    const file = data.get("file");
    setSaving(true);
    const ok = await onSave({
      equipmentId,
      certificateType: certificateTypeFor(String(data.get("type"))),
      certificateNumber: String(data.get("code") ?? "").trim(),
      providerName: String(data.get("provider") ?? "").trim(),
      issuedAt: String(data.get("issued") ?? ""),
      expiresAt: String(data.get("expires") ?? ""),
      originalFilename: file instanceof File ? file.name : "",
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Adjuntar certificado" description="Registra la evidencia y deja el archivo preparado para el adaptador de object storage." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label><span>Equipo</span><select name="equipmentId" required>{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Número</span><input name="code" required /></label><label><span>Tipo</span><select name="type"><option>Calibración</option><option>Calificación</option><option>Mantenimiento</option><option>Reparación</option></select></label><label><span>Proveedor</span><input name="provider" required /></label><label><span>Emisión</span><input name="issued" type="date" required /></label><label><span>Vencimiento</span><input name="expires" type="date" required /></label><label className="field-span-two"><span>PDF o fotografía</span><input name="file" type="file" required accept="application/pdf,image/*" /></label></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function EquipmentEventModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentRaw[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    setSaving(true);
    const ok = await onSave({ equipmentId: String(data.get("equipmentId") ?? ""), eventType: eventTypeFor(String(data.get("eventType"))), details: String(data.get("details") ?? ""), originalFilename: file instanceof File ? file.name : "" });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Registrar evento de equipo" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Equipo</span><select name="equipmentId" required>{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Evento</span><select name="eventType"><option>Verificación</option><option>Mantenimiento</option><option>Calibración</option><option>Reparación</option><option>Limpieza</option></select></label><label><span>Detalle</span><textarea name="details" rows={4} required /></label><label><span>Evidencia</span><input name="file" type="file" accept="application/pdf,image/*" /></label></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}
