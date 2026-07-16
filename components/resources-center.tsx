"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Boxes, FileCheck2, PackageCheck, Plus, ScanBarcode, ShieldCheck, Trash2, Wrench } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { QrLabelManager, QrScanTester } from "@/components/qr-label-manager";
import { defaultInventoryCategories } from "@/lib/lab-profile";
import { frequencyLabel } from "@/lib/equipment-frequency";
import { CustomFieldInputs, collectCustomValues, useCustomFieldDefs } from "@/components/custom-fields";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type ModalKey = "item" | "item-edit" | "movement" | "location" | "equipment" | "plan" | "certificate" | "event" | "equipment-edit" | null;

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
  area?: string | null; custom_values?: Record<string, unknown>;
};

// ─── Hook simple de carga ────────────────────────────────────────────────────

type LoadState = "loading" | "error" | "ready";

// Lee ?filter= de la URL (enviado desde el dashboard clicable).
function readResourceQuery(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search);
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
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
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
  async function editItem(id: string, payload: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(`/api/inventory/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      showToast("Artículo actualizado sin modificar la existencia.");
      setEditingItem(null); await load(); return true;
    } catch { showError("No se pudo guardar el artículo."); return false; }
  }

  useEffect(() => {
    const query = readResourceQuery();
    if (!query) return;
    if (query.get("tab") && ["lots", "movements", "locations", "qr"].includes(query.get("tab")!)) setTab(query.get("tab")!);
    if (query.get("stock") === "low" || query.get("filter") === "low-stock") setLowStockOnly(true);
    const itemId = query.get("itemId");
    if (itemId) void openDetail(itemId);
  }, []);

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
        id: String(r.id ?? ""),
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
      <InventoryDetailModal open={detailLoading || Boolean(detail)} loading={detailLoading} item={detail} defs={inventoryDefs} onClose={() => setDetail(null)} onDiscard={discardItem} onArchive={archiveItem} onEdit={(item) => { setEditingItem(item); setDetail(null); setModal("item-edit"); }} />
      <InventoryItemModal open={modal === "item"} categories={categories} onClose={() => setModal(null)} onSave={addItem} />
      <InventoryEditModal open={modal === "item-edit"} item={editingItem} onClose={() => { setModal(null); setEditingItem(null); }} onSave={editItem} />
      <InventoryMovementModal open={modal === "movement"} items={items} locations={locations} onClose={() => setModal(null)} onSave={addMovement} />
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
  const [equipmentDetail, setEquipmentDetail] = useState<Record<string, unknown> | null>(null);
  const [equipmentDetailLoading, setEquipmentDetailLoading] = useState(false);
  const [planDetail, setPlanDetail] = useState<Record<string, unknown> | null>(null);
  const [certificateDetail, setCertificateDetail] = useState<Record<string, unknown> | null>(null);
  const [operationalOnly, setOperationalOnly] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  async function openEquipmentDetail(id: string) {
    setEquipmentDetailLoading(true);
    setEquipmentDetail(null);
    try {
      const response = await fetch(`/api/equipment/${id}`);
      if (!response.ok) { showError(await responseMessage(response)); return; }
      const payload = await response.json() as { data?: Record<string, unknown> };
      setEquipmentDetail(payload.data ?? null);
    } catch { showError("No se pudo cargar la ficha del equipo."); }
    finally { setEquipmentDetailLoading(false); }
  }

  async function openPlanDetail(id: string) {
    try { const response = await fetch(`/api/equipment/plans/${id}`); if (!response.ok) { showError(await responseMessage(response)); return; } const payload = await response.json() as { data?: Record<string, unknown> }; setPlanDetail(payload.data ?? null); } catch { showError("No se pudo abrir el plan."); }
  }
  async function openCertificateDetail(id: string) {
    try { const response = await fetch(`/api/equipment/certificates/${id}`); if (!response.ok) { showError(await responseMessage(response)); return; } const payload = await response.json() as { data?: Record<string, unknown> }; setCertificateDetail(payload.data ?? null); } catch { showError("No se pudo abrir el certificado."); }
  }

  useEffect(() => {
    const query = readResourceQuery();
    if (!query) return;
    const requestedTab = query.get("tab");
    if (requestedTab === "equipment") setTab("master");
    else if (requestedTab && ["master", "plans", "certificates", "qr"].includes(requestedTab)) setTab(requestedTab);
    if (query.get("status") === "OPERATIONAL" || query.get("filter") === "operational") setOperationalOnly(true);
    const equipmentId = query.get("equipmentId");
    if (equipmentId) void openEquipmentDetail(equipmentId);
    const planId = query.get("planId");
    if (planId) { setTab("plans"); void openPlanDetail(planId); }
  }, []);

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
        id: String(r.id ?? ""),
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
          id: String(r.id ?? ""),
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
  async function changeEquipmentState(id: string, action: "ARCHIVE" | "RETIRE" | "OUT_OF_SERVICE"): Promise<void> {
    try { const response = await fetch(`/api/equipment/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: action === "ARCHIVE" ? "Archivo administrativo" : action === "RETIRE" ? "Retiro del equipo" : "Equipo marcado fuera de servicio" }) }); if (!response.ok) { showError(await responseMessage(response)); return; } setEquipmentDetail(null); showToast(action === "ARCHIVE" ? "Equipo archivado." : action === "RETIRE" ? "Equipo retirado." : "Equipo fuera de servicio."); await load(); } catch { showError("No se pudo actualizar el estado del equipo."); }
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
      const file = payload.file;
      const metadata = { ...payload };
      delete metadata.file;
      const response = await fetch("/api/equipment/certificates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata) });
      if (!response.ok) { showError(await responseMessage(response)); return false; }
      const created = await response.json() as { data?: { id?: string } };
      if (file instanceof File && created.data?.id) {
        const form = new FormData(); form.set("file", file);
        const upload = await fetch(`/api/equipment/certificates/${created.data.id}/file`, { method: "PUT", body: form });
        if (!upload.ok) { showError(`El certificado se registró, pero el archivo no se adjuntó: ${await responseMessage(upload)}`); await load(); return false; }
      }
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
        <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos" description="Consulta el estado, ubicación, responsable, calibraciones y mantenimientos de cada equipo." />
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
      <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos" description="Consulta el estado, ubicación, responsable, calibraciones y mantenimientos de cada equipo.">
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
        <Tabs items={[{ key: "master", label: "Equipos" }, { key: "plans", label: "Planes" }, { key: "certificates", label: "Certificados", tutorialId: "equipment-tab-certificates" }, { key: "qr", label: "QR" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "master" ? (
            <ResourceSection title="Equipos" copy="Haz clic en un equipo para ver detalle y editar. Las próximas fechas provienen de sus planes." action="Registrar evento" onAction={() => setModal("event")} disabled={equipment.length === 0}>
              {operationalOnly ? (
                <div className="filter-active-chip">Mostrando solo <strong>operativos</strong><button type="button" onClick={() => setOperationalOnly(false)} aria-label="Quitar filtro">✕</button></div>
              ) : null}
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "name", label: "Equipo" }, { key: "area", label: "Ubicación" }, { key: "status", label: "Estado" }, { key: "calibration", label: "Próx. calibración" }, { key: "maintenance", label: "Próx. mantenimiento" }, { key: "qualification", label: "Próx. calificación" }, { key: "responsible", label: "Responsable" }]}
                rows={equipmentRows}
                onRowClick={(row) => { if (row.id) void openEquipmentDetail(String(row.id)); }}
                emptyTitle="Sin equipos todavía"
                emptyMessage="Registra un equipo para gestionar sus planes, certificados y QR."
              />
            </ResourceSection>
          ) : null}
          {tab === "plans" ? <ResourceSection title="Planes periódicos" copy="Define frecuencia por calendario o por uso, anticipación de alertas y si el incumplimiento bloquea el uso." action="Nuevo plan" onAction={() => setModal("plan")} disabled={equipment.length === 0}><SimpleTable columns={[{ key: "code", label: "Equipo" }, { key: "equipment", label: "Nombre" }, { key: "plan", label: "Plan" }, { key: "frequency", label: "Frecuencia" }, { key: "next", label: "Próximo" }, { key: "blocking", label: "Bloquea uso" }, { key: "status", label: "Estado" }]} rows={plans} onRowClick={(row) => { if (row.id) void openPlanDetail(String(row.id)); }} emptyTitle="Sin planes" emptyMessage="Crea un plan de calibración, mantenimiento o verificación para un equipo." /></ResourceSection> : null}
          {tab === "certificates" ? <ResourceSection title="Certificados y evidencia" copy="Adjunta PDF, fotografías, proveedor, alcance, incertidumbre y fecha de vigencia." action="Adjuntar certificado" actionTutorialId="equipment-certificates" onAction={() => setModal("certificate")} disabled={equipment.length === 0}><SimpleTable columns={[{ key: "code", label: "Número" }, { key: "equipment", label: "Equipo" }, { key: "type", label: "Tipo" }, { key: "provider", label: "Proveedor" }, { key: "issued", label: "Emitido" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]} rows={certificates} onRowClick={(row) => { if (row.id) void openCertificateDetail(String(row.id)); }} emptyTitle="Sin certificados" emptyMessage="Adjunta el primer certificado o evidencia de un equipo." /></ResourceSection> : null}
          {tab === "qr" ? <QrLabelManager entityType="EQUIPMENT" /> : null}
        </div>
      </article>
      <EquipmentDetailModal open={equipmentDetailLoading || Boolean(equipmentDetail)} loading={equipmentDetailLoading} equipment={equipmentDetail} onClose={() => setEquipmentDetail(null)} onEdit={(value) => { setEditing(value as unknown as EquipmentRaw); setEquipmentDetail(null); setModal("equipment-edit"); }} onState={changeEquipmentState} />
      <PlanDetailModal plan={planDetail} onClose={() => setPlanDetail(null)} onChanged={async () => { setPlanDetail(null); await load(); }} />
      <CertificateDetailModal certificate={certificateDetail} onClose={() => setCertificateDetail(null)} onChanged={async () => { setCertificateDetail(null); await load(); }} />
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

function InventoryDetailModal({ open, loading, item, defs, onClose, onDiscard, onArchive, onEdit }: Readonly<{
  open: boolean; loading: boolean; item: Record<string, unknown> | null;
  defs: ReturnType<typeof useCustomFieldDefs>;
  onClose: () => void; onDiscard: (id: string, body: Record<string, unknown>) => Promise<boolean>; onArchive: (id: string) => void; onEdit: (item: Record<string, unknown>) => void;
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
              {String(item.status) !== "ARCHIVED" ? <button type="button" className="secondary-button" onClick={() => onEdit(item)}>Editar</button> : null}
              {String(item.status) !== "ARCHIVED" ? <button type="button" className="secondary-button" onClick={() => onArchive(id)}><Archive size={15} /> Archivar</button> : null}
              {String(item.status) !== "ARCHIVED" ? <button type="button" className="primary-button" onClick={() => setDiscarding((c) => !c)}><Trash2 size={15} /> Descartar</button> : null}
            </footer>
          </>
        )}
      </div>
    </ActionModal>
  );
}

function EquipmentDetailModal({ open, loading, equipment, onClose, onEdit, onState }: Readonly<{ open: boolean; loading: boolean; equipment: Record<string, unknown> | null; onClose: () => void; onEdit: (equipment: Record<string, unknown>) => void; onState: (id: string, action: "ARCHIVE" | "RETIRE" | "OUT_OF_SERVICE") => void | Promise<void> }>) {
  if (!open) return null;
  const plans = (equipment?.plans ?? []) as Array<Record<string, unknown>>;
  const certificates = (equipment?.certificates ?? []) as Array<Record<string, unknown>>;
  const events = (equipment?.events ?? []) as Array<Record<string, unknown>>;
  const customValues = (equipment?.custom_values ?? {}) as Record<string, unknown>;
  return (
    <ActionModal open title={equipment ? `${equipment.code} · ${equipment.name}` : "Equipo"} description="Ficha del equipo, sus planes, certificados, eventos e historial." onClose={onClose} wide>
      <div className="modal-form">
        {loading || !equipment ? <p aria-live="polite">Cargando ficha…</p> : <>
          <div className="details-grid">
            <div><small>Código</small><strong>{String(equipment.code ?? "—")}</strong></div><div><small>Estado</small><strong>{EQUIPMENT_STATUS_LABEL[String(equipment.status)] ?? String(equipment.status ?? "—")}</strong></div>
            <div><small>Marca</small><strong>{String(equipment.manufacturer ?? "—")}</strong></div><div><small>Modelo</small><strong>{String(equipment.model ?? "—")}</strong></div>
            <div><small>Serie</small><strong>{String(equipment.serial_number ?? "—")}</strong></div><div><small>Área / ubicación</small><strong>{String(equipment.area ?? equipment.location ?? "—")}</strong></div>
            <div><small>Responsable</small><strong>{String(equipment.responsible ?? "—")}</strong></div><div><small>Última calibración</small><strong>{fmtDate(equipment.last_calibration_at)}</strong></div>
            <div><small>Próximo mantenimiento</small><strong>{fmtDate(equipment.next_maintenance_at)}</strong></div><div><small>Observaciones</small><strong>{String(equipment.notes ?? "—")}</strong></div>
          </div>
          {Object.keys(customValues).length > 0 ? <><p className="form-section-title">Campos personalizados</p><div className="details-grid">{Object.entries(customValues).map(([key, value]) => <div key={key}><small>{key.replaceAll("_", " ")}</small><strong>{String(value ?? "—")}</strong></div>)}</div></> : null}
          <p className="form-section-title">Planes</p>{plans.length ? <div className="definition-list">{plans.map((plan) => <article className="definition-row" key={String(plan.id)}><div><strong>{PLAN_TYPE_LABEL[String(plan.plan_type)] ?? String(plan.name)}</strong><p>{frequencyLabel(plan.frequency_value, plan.frequency_unit)}</p></div><small>{String(plan.frequency_unit) === "USE" ? "Al utilizar" : fmtDate(plan.next_due_at)}</small><em>{String(plan.status)}</em></article>)}</div> : <p className="modal-note">Sin planes registrados.</p>}
          <p className="form-section-title">Certificados</p>{certificates.length ? <div className="definition-list">{certificates.map((certificate) => <article className="definition-row" key={String(certificate.id)}><div><strong>{String(certificate.certificate_number ?? "Sin número")}</strong><p>{CERT_TYPE_LABEL[String(certificate.certificate_type)] ?? String(certificate.certificate_type)}</p></div><small>{fmtDate(certificate.expires_at)}</small><em>Registrado</em></article>)}</div> : <p className="modal-note">Sin certificados registrados.</p>}
          <p className="form-section-title">Eventos e historial</p>{events.length ? <div className="definition-list">{events.map((event) => <article className="definition-row" key={String(event.id)}><div><strong>{String(event.event_type)}</strong><p>{String(event.details ?? "")}</p></div><small>{fmtDateTime(event.completed_at ?? event.scheduled_for)}</small><em>Evento</em></article>)}</div> : <p className="modal-note">Sin eventos registrados.</p>}
          <footer className="modal-actions"><button type="button" className="secondary-button" onClick={() => void onState(String(equipment.id), "OUT_OF_SERVICE")}>Fuera de servicio</button><button type="button" className="secondary-button" onClick={() => void onState(String(equipment.id), "ARCHIVE")}>Archivar</button><button type="button" className="secondary-button" onClick={() => void onState(String(equipment.id), "RETIRE")}>Retirar</button><button type="button" className="primary-button" onClick={() => onEdit(equipment)}>Editar equipo</button></footer>
        </>}
      </div>
    </ActionModal>
  );
}

function PlanDetailModal({ plan, onClose, onChanged }: Readonly<{ plan: Record<string, unknown> | null; onClose: () => void; onChanged: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  if (!plan) return null;
  async function action(actionName: "UPDATE" | "PAUSE" | "REACTIVATE" | "ARCHIVE" | "DUPLICATE", body: Record<string, unknown> = {}) {
    setBusy(true);
    try { const response = await fetch(`/api/equipment/plans/${plan!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, ...body }) }); if (response.ok) await onChanged(); }
    finally { setBusy(false); }
  }
  return <ActionModal open title={String(plan.name ?? "Plan de equipo")} description={`${String(plan.equipment_code ?? "")} · ${String(plan.equipment_name ?? "")}`} onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void action("UPDATE", { name: String(data.get("name")), frequencyUnit: String(data.get("frequencyUnit")), frequencyValue: String(data.get("frequencyUnit")) === "USE" ? null : Number(data.get("frequencyValue") || 1), nextDueAt: String(data.get("frequencyUnit")) === "USE" ? null : dateToIso(data.get("nextDueAt")), blocksUseWhenOverdue: data.get("blocking") === "on" }); }}>
      <div className="form-grid form-grid-two"><label className="field-span-two"><span>Nombre</span><input name="name" required defaultValue={String(plan.name ?? "")} /></label><label><span>Frecuencia</span><select name="frequencyUnit" defaultValue={String(plan.frequency_unit ?? "MONTH")}><option value="USE">Cada uso</option><option value="DAY">Diaria</option><option value="WEEK">Semanal</option><option value="MONTH">Mensual</option><option value="YEAR">Anual</option></select></label><label><span>Cada cuántos</span><input name="frequencyValue" type="number" min="1" defaultValue={Number(plan.frequency_value ?? 1)} /></label><label><span>Próxima fecha</span><input name="nextDueAt" type="date" defaultValue={plan.next_due_at ? new Date(String(plan.next_due_at)).toISOString().slice(0, 10) : ""} /></label><label className="checkbox-line"><input name="blocking" type="checkbox" defaultChecked={Boolean(plan.blocks_use_when_overdue)} /><span>Bloquear al vencer</span></label></div>
      <footer className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void action(String(plan.status) === "ACTIVE" ? "PAUSE" : "REACTIVATE")}>{String(plan.status) === "ACTIVE" ? "Pausar" : "Reactivar"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void action("DUPLICATE")}>Duplicar</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void action("ARCHIVE")}>Archivar</button><button type="submit" className="primary-button" disabled={busy}>Guardar cambios</button></footer>
    </form>
  </ActionModal>;
}

function CertificateDetailModal({ certificate, onClose, onChanged }: Readonly<{ certificate: Record<string, unknown> | null; onClose: () => void; onChanged: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  if (!certificate) return null;
  async function update(body: Record<string, unknown>) { setBusy(true); try { const response = await fetch(`/api/equipment/certificates/${certificate!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (response.ok) await onChanged(); } finally { setBusy(false); } }
  async function replace(file: File | null) { if (!file) return; setBusy(true); try { const form = new FormData(); form.set("file", file); const response = await fetch(`/api/equipment/certificates/${certificate!.id}/file`, { method: "PUT", body: form }); if (response.ok) await onChanged(); } finally { setBusy(false); } }
  return <ActionModal open title={`Certificado ${String(certificate.certificate_number ?? "")}`} description={`${String(certificate.equipment_code ?? "")} · ${String(certificate.equipment_name ?? "")}`} onClose={onClose}>
    <form className="modal-form" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void update({ certificateNumber: String(data.get("number")), providerName: String(data.get("provider")), issuedAt: String(data.get("issued")), expiresAt: String(data.get("expires")) || null, scopeText: String(data.get("scope")) || null }); }}>
      <div className="form-grid form-grid-two"><label><span>Número</span><input name="number" required defaultValue={String(certificate.certificate_number ?? "")} /></label><label><span>Proveedor</span><input name="provider" required defaultValue={String(certificate.provider_name ?? "")} /></label><label><span>Emisión</span><input name="issued" type="date" required defaultValue={String(certificate.issued_at ?? "").slice(0, 10)} /></label><label><span>Vencimiento</span><input name="expires" type="date" defaultValue={String(certificate.expires_at ?? "").slice(0, 10)} /></label><label className="field-span-two"><span>Alcance</span><textarea name="scope" rows={2} defaultValue={String(certificate.scope_text ?? "")} /></label><label className="field-span-two"><span>Reemplazar PDF o imagen</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(event) => void replace(event.target.files?.[0] ?? null)} /></label></div>
      <footer className="modal-actions">{certificate.attachment_id ? <a className="secondary-button" href={`/api/equipment/certificates/${certificate.id}/file`} target="_blank" rel="noreferrer">Abrir archivo</a> : null}<button type="button" className="secondary-button" disabled={busy} onClick={() => void update({ action: "ARCHIVE" })}>Archivar</button><button type="submit" className="primary-button" disabled={busy}>Guardar metadatos</button></footer>
    </form>
  </ActionModal>;
}

function InventoryEditModal({ open, item, onClose, onSave }: Readonly<{ open: boolean; item: Record<string, unknown> | null; onClose: () => void; onSave: (id: string, payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const defs = useCustomFieldDefs("inventory");
  if (!open || !item) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    const ok = await onSave(String(item!.id), {
      name: String(data.get("name") ?? "").trim(), itemType: String(data.get("itemType")), vendor: String(data.get("vendor") ?? "").trim(),
      concentration: String(data.get("concentration") ?? "").trim(), presentation: String(data.get("presentation") ?? "").trim(),
      reorderPoint: Number(data.get("minimum") ?? 0), expiresAt: String(data.get("expires") ?? "") || null,
      storageConditions: String(data.get("storageConditions") ?? "").trim(), trackStock: data.get("trackStock") === "on",
      alertLowStock: data.get("alertLowStock") === "on", alertExpiry: data.get("alertExpiry") === "on",
      requiresUsageLog: data.get("requiresUsageLog") === "on", allowDirectDiscard: data.get("allowDirectDiscard") === "on",
      notes: String(data.get("notes") ?? "").trim(), customValues: collectCustomValues(defs, data),
    });
    setSaving(false); if (ok) onClose();
  }
  const customValues = (item.custom_values ?? {}) as Record<string, unknown>;
  return <ActionModal open title={`Editar ${String(item.sku)}`} description="Actualiza los datos y controles. La existencia solo cambia mediante movimientos." onClose={onClose} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label className="field-span-two"><span>Nombre</span><input name="name" required defaultValue={String(item.name ?? "")} /></label><label><span>Tipo</span><select name="itemType" defaultValue={String(item.item_type ?? "OTHER")}><option value="REAGENT">Reactivo</option><option value="MATERIAL">Material</option><option value="CONSUMABLE">Insumo o consumible</option><option value="CULTURE_MEDIA">Medio de cultivo</option><option value="OTHER">Otro</option></select></label><label><span>Proveedor</span><input name="vendor" defaultValue={String(item.vendor ?? "")} /></label><label><span>Concentración</span><input name="concentration" defaultValue={String(item.concentration ?? "")} /></label><label><span>Presentación</span><input name="presentation" defaultValue={String(item.presentation ?? "")} /></label><label><span>Stock mínimo</span><input name="minimum" type="number" min="0" step="0.001" defaultValue={String(item.reorder_point ?? 0)} /></label><label><span>Vencimiento</span><input name="expires" type="date" defaultValue={dateToIso(item.expires_at)?.slice(0, 10)} /></label><label className="field-span-two"><span>Condiciones de almacenamiento</span><textarea name="storageConditions" rows={2} defaultValue={String(item.storage_conditions ?? "")} /></label><label className="checkbox-line"><input name="trackStock" type="checkbox" defaultChecked={item.track_stock !== false} /><span>Controlar existencias</span></label><label className="checkbox-line"><input name="alertLowStock" type="checkbox" defaultChecked={item.alert_low_stock !== false} /><span>Alertar por stock mínimo</span></label><label className="checkbox-line"><input name="alertExpiry" type="checkbox" defaultChecked={item.alert_expiry !== false} /><span>Alertar por vencimiento</span></label><label className="checkbox-line"><input name="requiresUsageLog" type="checkbox" defaultChecked={Boolean(item.requires_usage_log)} /><span>Exigir registro de consumo</span></label><label className="checkbox-line"><input name="allowDirectDiscard" type="checkbox" defaultChecked={Boolean(item.allow_direct_discard)} /><span>Permitir descarte directo</span></label><label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} defaultValue={String(item.notes ?? "")} /></label><CustomFieldInputs defs={defs} values={customValues} /></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function InventoryItemModal({ open, categories, onClose, onSave }: Readonly<{ open: boolean; categories: CategoryOption[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const [itemType, setItemType] = useState("REAGENT");
  const customDefs = useCustomFieldDefs("inventory");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const safetySheet = String(data.get("safetySheetUrl") ?? "").trim();
    setSaving(true);
    const ok = await onSave({
      sku: String(data.get("sku") ?? "").trim(),
      name: String(data.get("name") ?? "").trim(),
      itemType,
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
      concentration: String(data.get("concentration") ?? "").trim(),
      brand: String(data.get("brand") ?? "").trim(),
      model: String(data.get("model") ?? "").trim(),
      presentation: String(data.get("presentation") ?? "").trim(),
      manufacturingMaterial: String(data.get("material") ?? "").trim(),
      isReusable: data.get("isReusable") === "on",
      storageConditions: String(data.get("storageConditions") ?? "").trim(),
      cultureMediaType: String(data.get("cultureMediaType") ?? "").trim(),
      preparationType: String(data.get("preparationType") ?? "") || undefined,
      trackStock: data.get("trackStock") === "on",
      alertLowStock: data.get("alertLowStock") === "on",
      alertExpiry: data.get("alertExpiry") === "on",
      allowDirectDiscard: data.get("allowDirectDiscard") === "on",
      notes: String(data.get("notes") ?? "").trim(),
      safetySheetUrl: safetySheet,
      requiresUsageLog: data.get("requiresUsageLog") === "on",
      customValues: collectCustomValues(customDefs, data),
    });
    setSaving(false);
    if (ok) onClose();
  }
  const reagent = itemType === "REAGENT";
  const material = itemType === "MATERIAL";
  const consumable = itemType === "CONSUMABLE";
  const culture = itemType === "CULTURE_MEDIA";
  return <ActionModal open={open} title="Registrar artículo o lote" description="El tipo define los campos y controles; la categoría sigue siendo configurable." onClose={onClose} wide><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two">
    <span className="form-section-title field-span-two">Identificación</span>
    <label><span>Tipo de artículo</span><select required value={itemType} onChange={(event) => setItemType(event.target.value)}><option value="REAGENT">Reactivo</option><option value="MATERIAL">Material</option><option value="CONSUMABLE">Insumo o consumible</option><option value="CULTURE_MEDIA">Medio de cultivo</option><option value="OTHER">Otro</option></select></label>
    <label><span>Categoría</span><input name="category" required list="inv-cats" placeholder="Clasificación del laboratorio" /><datalist id="inv-cats">{categories.map((cat) => <option key={cat.code} value={cat.name} />)}</datalist></label>
    <label><span>Código interno</span><input name="sku" required placeholder="RQ-0001" /></label><label><span>Nombre</span><input name="name" required /></label><label><span>Lote (opcional)</span><input name="lot" /></label><label><span>Proveedor</span><input name="vendor" /></label>
    {reagent ? <><label><span>Fórmula</span><input name="formula" /></label><label><span>Concentración</span><input name="concentration" /></label></> : null}
    {material ? <><label><span>Marca</span><input name="brand" /></label><label><span>Modelo o descripción</span><input name="model" /></label><label><span>Material de fabricación</span><input name="material" /></label><label className="checkbox-line"><input name="isReusable" type="checkbox" /><span>Reutilizable</span></label></> : null}
    {consumable ? <><label><span>Presentación</span><input name="presentation" /></label><label><span>Unidad de empaque</span><input name="model" /></label></> : null}
    {culture ? <><label><span>Tipo de medio</span><input name="cultureMediaType" /></label><label><span>Preparación</span><select name="preparationType"><option value="COMMERCIAL">Comercial</option><option value="PREPARED">Preparado</option></select></label><label><span>Fabricante</span><input name="brand" /></label></> : null}
    <span className="form-section-title field-span-two">Ubicación y existencias</span><label><span>Ubicación</span><input name="location" /></label><label><span>Fecha de ingreso</span><input name="receivedAt" type="date" /></label>{!material ? <label><span>Fecha de vencimiento (opcional)</span><input name="expires" type="date" /></label> : null}<label><span>Existencia inicial</span><input name="quantity" required type="number" min="0" step="0.001" /></label><label><span>Stock mínimo</span><input name="minimum" required type="number" min="0" step="0.001" /></label><label><span>Unidad</span><input name="unit" required defaultValue="unidades" /></label>
    <span className="form-section-title field-span-two">Controles</span><label className="checkbox-line"><input name="trackStock" type="checkbox" defaultChecked /><span>Controlar existencias</span></label><label className="checkbox-line"><input name="alertLowStock" type="checkbox" defaultChecked /><span>Alertar por stock mínimo</span></label><label className="checkbox-line"><input name="alertExpiry" type="checkbox" defaultChecked={!material} /><span>Alertar por vencimiento</span></label><label className="checkbox-line"><input key={itemType} name="requiresUsageLog" type="checkbox" defaultChecked={reagent || culture} /><span>Exigir registro de consumo</span></label><label className="checkbox-line"><input name="allowDirectDiscard" type="checkbox" /><span>Permitir descarte directo</span></label>
    {(reagent || culture) ? <><label className="field-span-two"><span>Condiciones de almacenamiento</span><textarea name="storageConditions" rows={2} /></label><label className="field-span-two"><span>Ficha de seguridad o técnica (URL)</span><input name="safetySheetUrl" type="url" /></label></> : null}<label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} /></label><CustomFieldInputs defs={customDefs} />
  </div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
}

function InventoryMovementModal({ open, items, locations, onClose, onSave }: Readonly<{ open: boolean; items: TableRow[]; locations: TableRow[]; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<boolean> }>) {
  const [saving, setSaving] = useState(false);
  const [movement, setMovement] = useState("CONSUMPTION");
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
    const ok = await onSave({ inventoryItemId: itemId, movementType, quantity: Math.abs(quantity), direction, reasonCode: String(data.get("reasonCode") ?? "OTHER"), note: String(data.get("reason") ?? ""), fromLocationId: String(data.get("fromLocationId") ?? "") || undefined, toLocationId: String(data.get("toLocationId") ?? "") || undefined });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title="Registrar movimiento" description="Cada cambio conserva cantidad, motivo y responsable." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Artículo</span><select name="itemId" required>{items.map((item) => <option key={String(item.id)} value={String(item.id)}>{item.sku} · {item.name}</option>)}</select></label><label><span>Tipo</span><select name="type" onChange={(event) => setMovement(event.target.value)}><option value="Consumo">Registrar uso</option><option value="Entrada">Agregar existencias</option><option value="Ajuste positivo">Corregir existencia (+)</option><option value="Ajuste negativo">Corregir existencia (−)</option><option value="Transferencia">Cambiar ubicación</option><option value="Descarte">Descartar</option></select></label><p className="modal-note">{movement === "Entrada" ? "Aumenta la cantidad disponible al recibir o reponer artículos." : movement === "Transferencia" ? "Traslada existencias de una ubicación a otra." : movement.startsWith("Ajuste") ? "Ajusta una diferencia detectada durante un conteo." : movement === "Descarte" ? "Retira existencias vencidas, dañadas o no utilizables." : "Descuenta la cantidad utilizada durante una práctica."}</p><label><span>Cantidad</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label>{movement === "Transferencia" ? <><label><span>Ubicación de origen</span><select name="fromLocationId" required><option value="">Selecciona…</option>{locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.hierarchy)}</option>)}</select></label><label><span>Ubicación de destino</span><select name="toLocationId" required><option value="">Selecciona…</option>{locations.map((location) => <option key={String(location.id)} value={String(location.id)}>{String(location.hierarchy)}</option>)}</select></label></> : null}<label><span>Motivo</span><select name="reasonCode" required><option value="COUNT_ERROR">Error de conteo</option><option value="DAMAGE">Daño</option><option value="LOSS">Pérdida</option><option value="INITIAL_CORRECTION">Corrección inicial</option><option value="RESTOCK">Reposición</option><option value="OTHER">Otro</option></select></label><label><span>Comentario y responsable</span><textarea name="reason" required rows={3} placeholder="Describe el motivo. Tu usuario quedará registrado como responsable." /></label></div><ModalFooter onClose={onClose} saving={saving} /></form></ActionModal>;
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
  const customDefs = useCustomFieldDefs("equipment");
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
      area: String(data.get("area") ?? "").trim(),
      notes: String(data.get("notes") ?? "").trim(),
      customValues: collectCustomValues(customDefs, data),
    });
    setSaving(false);
    if (ok) onClose();
  }
  return <ActionModal open={open} title={`Editar ${equipment.code}`} description="Actualiza los datos del equipo. Las próximas fechas se gestionan desde Planes." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label className="field-span-two"><span>Nombre</span><input name="name" required defaultValue={equipment.name} /></label><label><span>Marca</span><input name="brand" defaultValue={equipment.manufacturer ?? ""} /></label><label><span>Modelo</span><input name="model" defaultValue={equipment.model ?? ""} /></label><label><span>Serie</span><input name="serial" defaultValue={equipment.serial_number ?? ""} /></label><label><span>Área</span><input name="area" defaultValue={equipment.area ?? ""} /></label><label><span>Estado</span><select name="status" defaultValue={equipment.status}><option value="OPERATIONAL">Operativo</option><option value="MAINTENANCE_DUE">Mantenimiento próximo</option><option value="OUT_OF_SERVICE">Fuera de servicio</option><option value="RETIRED">Retirado</option></select></label><label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={3} defaultValue={equipment.notes ?? ""} /></label><CustomFieldInputs defs={customDefs} values={equipment.custom_values} /></div><footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></form></ActionModal>;
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
      file: file instanceof File ? file : undefined,
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
