"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Boxes, FileCheck2, PackageCheck, Plus, ScanBarcode, ShieldCheck, Wrench } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { QrLabelManager, QrScanTester } from "@/components/qr-label-manager";
import { equipmentPlans as seedEquipmentPlans, inventoryMovements as seedMovements, locationRows as seedLocations } from "@/lib/compliance-data";
import { equipmentRows as seedEquipment, inventoryRows as seedInventory } from "@/lib/demo-data";
import { defaultInventoryCategories } from "@/lib/lab-profile";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type ModalKey = "item" | "movement" | "location" | "equipment" | "plan" | "certificate" | "event" | null;

type InventoryItem = TableRow & {
  id: string;
  sku: string;
  name: string;
  quantity: string;
  minimum: string;
  status: string;
  category?: string;
  lot?: string;
  location?: string;
  expires?: string;
  vendor?: string;
  internalFormula?: string;
  receivedAt?: string;
  safetySheetUrl?: string;
};
type EquipmentItem = TableRow & {
  id: string;
  code: string;
  name: string;
  status: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  maintenance?: string;
};

const inventoryIds: Record<string, string> = {
  "REA-HEM-029": "00000000-0000-0000-0000-000000000562",
  "REA-QUI-118": "00000000-0000-0000-0000-000000000563",
  "CON-GEN-011": "00000000-0000-0000-0000-000000000564",
  "REA-MOL-074": "00000000-0000-0000-0000-000000000565",
};
const equipmentIds: Record<string, string> = {
  "EQ-HEM-004": "00000000-0000-0000-0000-000000000573",
  "EQ-QUI-002": "00000000-0000-0000-0000-000000000572",
  "EQ-MOL-008": "00000000-0000-0000-0000-000000000574",
  "EQ-URI-003": "00000000-0000-0000-0000-000000000575",
};

function numberFromQuantity(value: string) {
  return Number(value.replace(",", ".").match(/[\d.]+/)?.[0] ?? 0);
}
function unitFromQuantity(value: string) {
  return value.replace(/[\d.,\s]/g, "").trim() || value.split(" ").slice(1).join(" ") || "unidades";
}
function movementTypeFor(type: string) {
  if (type === "Entrada") return "RECEIPT";
  if (type === "Ajuste positivo" || type === "Ajuste negativo") return "ADJUSTMENT";
  if (type === "Descarte") return "DISPOSAL";
  return "CONSUMPTION";
}
function planTypeFor(type: string) {
  if (type === "Verificación") return "VERIFICATION";
  if (type === "Calibración") return "CALIBRATION";
  if (type === "Mantenimiento preventivo") return "MAINTENANCE";
  if (type === "Calificación") return "QUALIFICATION";
  return "CLEANING";
}
function certificateTypeFor(type: string) {
  if (type === "Calibración") return "CALIBRATION";
  if (type === "Calificación") return "QUALIFICATION";
  if (type === "Mantenimiento") return "MAINTENANCE";
  return "REPAIR";
}
function eventTypeFor(type: string) {
  if (type === "Verificación") return "VERIFICATION";
  if (type === "Mantenimiento") return "MAINTENANCE";
  if (type === "Calibración") return "CALIBRATION";
  if (type === "Reparación") return "REPAIR";
  return "CLEANING";
}
function dateToIso(value: unknown) {
  const date = String(value || "");
  return date ? `${date}T00:00:00.000Z` : undefined;
}
async function responseMessage(response: Response) {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || `Solicitud rechazada (${response.status}).`;
  } catch {
    return `Solicitud rechazada (${response.status}).`;
  }
}

type CategoryOption = { code: string; name: string; prefix: string };

export function InventoryCenter() {
  const [tab, setTab] = useState("lots");
  const [modal, setModal] = useState<ModalKey>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [items, setItems] = useState<InventoryItem[]>(() => seedInventory.map((item) => ({ ...item, id: inventoryIds[item.sku] ?? crypto.randomUUID() })));
  const [movements, setMovements] = useState<TableRow[]>(seedMovements);
  const [locations, setLocations] = useState<TableRow[]>(seedLocations);
  const [categories, setCategories] = useState<CategoryOption[]>(() => [...defaultInventoryCategories]);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const { message, showToast, clearToast } = useToast();
  const reorderCount = items.filter((item) => item.status === "Reponer").length;
  const watchCount = items.filter((item) => item.status === "Vigilar").length;

  useEffect(() => {
    void fetch("/api/inventory/categories")
      .then((r) => r.json() as Promise<{ data?: Array<{ code: string; name: string; prefix: string }> }>)
      .then((payload) => { if (payload.data?.length) setCategories(payload.data); })
      .catch(() => { /* mantiene categorías default */ });
  }, []);

  const filteredItems = useMemo(() => {
    if (activeCategory === "ALL") return items;
    const cat = categories.find((c) => c.code === activeCategory);
    if (!cat) return items;
    return items.filter((item) => {
      const sku = String(item.sku ?? "").toUpperCase();
      const category = String(item.category ?? "").toLowerCase();
      return sku.startsWith(cat.prefix.toUpperCase()) || category.includes(cat.name.toLowerCase().slice(0, 6));
    });
  }, [items, activeCategory, categories]);

  async function addItem(record: InventoryItem) {
    try {
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: record.sku,
          name: record.name,
          categoryName: record.category,
          storageLocationName: record.location,
          lotNumber: record.lot,
          quantity: numberFromQuantity(record.quantity),
          reorderPoint: numberFromQuantity(record.minimum),
          unit: unitFromQuantity(record.quantity),
          expiresAt: record.expires === "—" ? null : record.expires,
          receivedAt: record.receivedAt || null,
          vendor: record.vendor,
          internalFormula: record.internalFormula,
          safetySheetUrl: record.safetySheetUrl,
          requiresUsageLog: true,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { data?: { id?: string } };
      setItems((current) => [{ ...record, id: payload.data?.id || record.id }, ...current]);
      showToast(`Artículo ${record.sku} creado con su etiqueta QR segura.`);
    } catch (reason) {
      setItems((current) => [record, ...current]);
      showToast(reason instanceof Error ? `${reason.message} El registro quedó visible solamente en esta sesión.` : "El registro quedó visible solamente en esta sesión.");
    }
  }
  async function addMovement(record: TableRow & { itemId: string; quantityDelta: number }) {
    try {
      const type = String(record.type);
      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventoryItemId: record.itemId,
          movementType: movementTypeFor(type),
          quantity: Math.abs(record.quantityDelta),
          direction: record.quantityDelta >= 0 ? "IN" : "OUT",
          reasonCode: "REGISTRO_UI",
          note: String(record.reason),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      showToast("Movimiento guardado y existencia recalculada.");
    } catch (reason) {
      showToast(reason instanceof Error ? `${reason.message} El cambio se reflejó solamente en esta sesión.` : "El cambio se reflejó solamente en esta sesión.");
    }
    setMovements((current) => [{ code: `MOV-${new Date().getTime().toString().slice(-8)}`, item: record.item, lot: record.lot, type: record.type, quantity: record.quantity, reason: record.reason, performedBy: "José Admin", when: "Ahora" }, ...current]);
    setItems((current) => current.map((item) => {
      if (item.id !== record.itemId) return item;
      const next = Math.max(0, numberFromQuantity(item.quantity) + record.quantityDelta);
      const minimum = numberFromQuantity(item.minimum);
      return { ...item, quantity: `${next} ${unitFromQuantity(item.quantity)}`, status: next <= minimum ? "Reponer" : item.status === "Reponer" ? "Disponible" : item.status };
    }));
  }
  async function addLocation(record: TableRow) {
    try {
      const response = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: record.code, name: record.hierarchy, locationType: record.type }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      showToast("Ubicación guardada correctamente.");
    } catch (reason) {
      showToast(reason instanceof Error ? `${reason.message} La ubicación quedó visible solamente en esta sesión.` : "La ubicación quedó visible solamente en esta sesión.");
    }
    setLocations((current) => [record, ...current]);
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="RECURSOS Y TRAZABILIDAD" title="Inventario por lote" description="Controla reactivos, materiales, consumibles, ubicaciones, movimientos y etiquetas QR.">
        <button className="secondary-button" onClick={() => setScannerOpen(true)}><ScanBarcode size={15} /> Escanear QR</button>
        <button className="primary-button" onClick={() => setModal("item")}><Plus size={15} /> Nuevo artículo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Lotes activos", value: String(items.length), hint: `${locations.length} ubicaciones`, icon: Boxes },
        { label: "Por reponer", value: String(reorderCount), hint: reorderCount ? "Requiere atención" : "Sin alertas", icon: PackageCheck },
        { label: "Próximos a vencer", value: String(watchCount), hint: "Sugerencia FEFO activa", icon: ShieldCheck },
      ]} />
      <InlineNotice title="Stock calculado por movimientos">Las existencias no se editan manualmente. Cada entrada, salida, ajuste, transferencia o descarte genera una bitácora con responsable y motivo.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "lots", label: "Lotes" }, { key: "movements", label: "Movimientos" }, { key: "locations", label: "Ubicaciones" }, { key: "qr", label: "QR y etiquetas" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "lots" ? (
            <section>
              <div className="section-heading">
                <div><h2>Existencias por lote</h2><p>Cada lote conserva proveedor, vencimiento, ubicación, ficha de seguridad y trazabilidad de uso.</p></div>
                <button className="secondary-button" onClick={() => setModal("movement")}><Plus size={15} /> Registrar consumo</button>
              </div>
              <div className="filter-chip-row" role="group" aria-label="Filtrar por categoría">
                <button
                  type="button"
                  className={`filter-chip${activeCategory === "ALL" ? " filter-chip-active" : ""}`}
                  onClick={() => setActiveCategory("ALL")}
                >
                  Todos
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.code}
                    type="button"
                    className={`filter-chip${activeCategory === cat.code ? " filter-chip-active" : ""}`}
                    onClick={() => setActiveCategory(cat.code)}
                  >
                    {cat.prefix}
                    <span className="filter-chip-label">{cat.name}</span>
                  </button>
                ))}
              </div>
              <SimpleTable
                columns={[{ key: "sku", label: "Código" }, { key: "name", label: "Artículo" }, { key: "category", label: "Categoría" }, { key: "lot", label: "Lote" }, { key: "location", label: "Ubicación" }, { key: "quantity", label: "Existencia" }, { key: "minimum", label: "Mínimo" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]}
                rows={filteredItems}
                searchPlaceholder="Buscar reactivo, lote o ubicación…"
              />
            </section>
          ) : null}
          {tab === "movements" ? <ResourceSection title="Bitácora de movimientos" copy="El sistema propone FEFO y exige justificación cuando se utiliza un lote distinto al recomendado." action="Nuevo movimiento" onAction={() => setModal("movement")}><SimpleTable columns={[{ key: "code", label: "Movimiento" }, { key: "item", label: "Artículo" }, { key: "lot", label: "Lote" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "reason", label: "Motivo" }, { key: "performedBy", label: "Responsable" }, { key: "when", label: "Momento" }]} rows={movements} /></ResourceSection> : null}
          {tab === "locations" ? <ResourceSection title="Ubicaciones jerárquicas" copy="Organiza sedes, laboratorios, armarios, refrigeradores, estantes y cajas para encontrar cada recurso." action="Nueva ubicación" onAction={() => setModal("location")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "hierarchy", label: "Ruta" }, { key: "type", label: "Tipo" }, { key: "responsible", label: "Responsable" }, { key: "status", label: "Estado" }]} rows={locations} /></ResourceSection> : null}
          {tab === "qr" ? <QrLabelManager entityType="INVENTORY_ITEM" /> : null}
        </div>
      </article>
      <InventoryItemModal open={modal === "item"} categories={categories} onClose={() => setModal(null)} onSave={addItem} />
      <InventoryMovementModal open={modal === "movement"} items={items} onClose={() => setModal(null)} onSave={addMovement} />
      <LocationModal open={modal === "location"} onClose={() => setModal(null)} onSave={addLocation} />
      <QrScanTester open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

export function EquipmentCenter() {
  const [tab, setTab] = useState("master");
  const [modal, setModal] = useState<ModalKey>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [equipment, setEquipment] = useState<EquipmentItem[]>(() => seedEquipment.map((item) => ({ ...item, id: equipmentIds[item.code] ?? crypto.randomUUID() })));
  const [plans, setPlans] = useState<TableRow[]>(seedEquipmentPlans);
  const [certificates, setCertificates] = useState<TableRow[]>([
    { code: "CERT-2026-071", equipment: "Balanza analítica", type: "Calibración", provider: "Metrología GT", issued: "10/01/2026", expires: "10/01/2027", status: "Vigente" },
    { code: "CERT-2026-052", equipment: "Incubadora microbiológica", type: "Calificación", provider: "Servicios Lab", issued: "22/12/2025", expires: "22/12/2026", status: "Vigente" },
  ]);
  const { message, showToast, clearToast } = useToast();

  async function addEquipment(record: EquipmentItem) {
    try {
      const response = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: record.code,
          name: record.name,
          manufacturer: record.manufacturer,
          model: record.model,
          serialNumber: record.serialNumber,
          locationName: record.location,
          nextMaintenanceAt: record.maintenance === "Sin programar" ? null : record.maintenance,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = await response.json() as { data?: { id?: string } };
      setEquipment((current) => [{ ...record, id: payload.data?.id || record.id }, ...current]);
      showToast(`Equipo ${record.code} registrado con su etiqueta QR segura.`);
    } catch (reason) {
      setEquipment((current) => [record, ...current]);
      showToast(reason instanceof Error ? `${reason.message} El registro quedó visible solamente en esta sesión.` : "El registro quedó visible solamente en esta sesión.");
    }
  }
  async function addPlan(record: TableRow) {
    try {
      const frequencyMatch = String(record.frequency).match(/(\d+)/);
      const response = await fetch("/api/equipment/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: record.equipmentId,
          planType: planTypeFor(String(record.plan)),
          name: String(record.plan),
          frequencyValue: frequencyMatch ? Number(frequencyMatch[1]) : undefined,
          frequencyUnit: String(record.frequency).toLowerCase().includes("mes") ? "MONTH" : String(record.frequency).toLowerCase().includes("semana") ? "WEEK" : String(record.frequency).toLowerCase().includes("día") ? "DAY" : undefined,
          nextDueAt: dateToIso(record.next === "Al utilizar" ? "" : record.next),
          blocksUseWhenOverdue: record.blocking === "Sí",
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      showToast("Plan periódico guardado.");
    } catch (reason) {
      showToast(reason instanceof Error ? `${reason.message} El plan quedó visible solamente en esta sesión.` : "El plan quedó visible solamente en esta sesión.");
    }
    setPlans((current) => [record, ...current]);
  }
  async function addCertificate(record: TableRow) {
    try {
      const response = await fetch("/api/equipment/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: record.equipmentId,
          certificateType: certificateTypeFor(String(record.type)),
          certificateNumber: record.code,
          providerName: record.provider,
          issuedAt: record.issued,
          expiresAt: record.expires,
          originalFilename: record.originalFilename,
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      showToast("Certificado registrado en el historial. El archivo queda listo para el adaptador de object storage.");
    } catch (reason) {
      showToast(reason instanceof Error ? `${reason.message} El certificado quedó visible solamente en esta sesión.` : "El certificado quedó visible solamente en esta sesión.");
    }
    setCertificates((current) => [record, ...current]);
  }
  async function addEvent(record: TableRow) {
    try {
      const response = await fetch("/api/equipment/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipmentId: record.equipmentId, eventType: eventTypeFor(String(record.eventType)), details: record.details, originalFilename: record.originalFilename }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      showToast("Evento de equipo registrado en la bitácora.");
    } catch (reason) {
      showToast(reason instanceof Error ? `${reason.message} El evento quedó registrado solamente en esta sesión.` : "El evento quedó registrado solamente en esta sesión.");
    }
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos, planes y certificados" description="Programa verificaciones, calibraciones y mantenimientos con bloqueos configurables.">
        <button className="secondary-button" onClick={() => setScannerOpen(true)}><ScanBarcode size={15} /> Escanear equipo</button>
        <button className="primary-button" onClick={() => setModal("equipment")}><Plus size={15} /> Nuevo equipo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Equipos registrados", value: String(equipment.length), hint: `${equipment.filter((item) => item.status === "Operativo").length} operativos`, icon: Wrench },
        { label: "Planes próximos", value: String(plans.filter((plan) => plan.status !== "Vigente").length), hint: "Incluye vencidos", icon: ShieldCheck },
        { label: "Certificados vigentes", value: `${certificates.length}`, hint: "Archivos versionados", icon: FileCheck2 },
      ]} />
      <InlineNotice title="Bloqueo preventivo configurable">Un equipo puede quedar inhabilitado para nuevos análisis cuando su calibración, verificación o mantenimiento crítico esté vencido.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "master", label: "Registro maestro" }, { key: "plans", label: "Planes" }, { key: "certificates", label: "Certificados" }, { key: "qr", label: "QR" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "master" ? <ResourceSection title="Registro maestro de equipos" copy="Consulta estado, área, calibración y próximo mantenimiento." action="Registrar evento" onAction={() => setModal("event")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "name", label: "Equipo" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }, { key: "calibration", label: "Última calibración" }, { key: "maintenance", label: "Próximo mantenimiento" }, { key: "utilization", label: "Uso" }]} rows={equipment} /></ResourceSection> : null}
          {tab === "plans" ? <ResourceSection title="Planes periódicos" copy="Define frecuencia, anticipación de alertas y si el incumplimiento bloquea el uso." action="Nuevo plan" onAction={() => setModal("plan")}><SimpleTable columns={[{ key: "code", label: "Equipo" }, { key: "equipment", label: "Nombre" }, { key: "plan", label: "Plan" }, { key: "frequency", label: "Frecuencia" }, { key: "next", label: "Próximo" }, { key: "blocking", label: "Bloquea uso" }, { key: "status", label: "Estado" }]} rows={plans} /></ResourceSection> : null}
          {tab === "certificates" ? <ResourceSection title="Certificados y evidencia" copy="Adjunta PDF, fotografías, proveedor, alcance, incertidumbre y fecha de vigencia." action="Adjuntar certificado" onAction={() => setModal("certificate")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "equipment", label: "Equipo" }, { key: "type", label: "Tipo" }, { key: "provider", label: "Proveedor" }, { key: "issued", label: "Emitido" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]} rows={certificates} /></ResourceSection> : null}
          {tab === "qr" ? <QrLabelManager entityType="EQUIPMENT" /> : null}
        </div>
      </article>
      <EquipmentModal open={modal === "equipment"} onClose={() => setModal(null)} onSave={addEquipment} />
      <EquipmentPlanModal open={modal === "plan"} equipment={equipment} onClose={() => setModal(null)} onSave={addPlan} />
      <CertificateModal open={modal === "certificate"} equipment={equipment} onClose={() => setModal(null)} onSave={addCertificate} />
      <EquipmentEventModal open={modal === "event"} equipment={equipment} onClose={() => setModal(null)} onSave={addEvent} />
      <QrScanTester open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function ResourceSection({ title, copy, action, onAction, children }: Readonly<{ title: string; copy: string; action: string; onAction: () => void; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button" onClick={onAction}><Plus size={15} /> {action}</button></div>{children}</section>;
}

function InventoryItemModal({ open, categories, onClose, onSave }: Readonly<{ open: boolean; categories: CategoryOption[]; onClose: () => void; onSave: (record: InventoryItem) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget); const quantity = String(data.get("quantity")); const minimum = String(data.get("minimum"));
    void onSave({ id: crypto.randomUUID(), sku: String(data.get("sku")), name: String(data.get("name")), category: String(data.get("category")), lot: String(data.get("lot")), location: String(data.get("location")), quantity: `${quantity} ${data.get("unit")}`, minimum: `${minimum} ${data.get("unit")}`, expires: String(data.get("expires") || "—"), receivedAt: String(data.get("receivedAt") || ""), vendor: String(data.get("vendor") || ""), internalFormula: String(data.get("formula") || ""), safetySheetUrl: String(data.get("safetySheetUrl") || ""), status: Number(quantity) <= Number(minimum) ? "Reponer" : "Disponible" }); event.currentTarget.reset(); onClose();
  }
  return <ActionModal open={open} title="Registrar artículo o lote" description="El código interno identifica el recurso y su etiqueta QR." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><span className="form-section-title field-span-two">Identificación</span><label><span>Código interno</span><input name="sku" required placeholder="RQ-0001" /></label><label><span>Nombre</span><input name="name" required placeholder="Reactivo o material" /></label><label><span>Categoría</span><select name="category">{categories.map((cat) => <option key={cat.code} value={cat.name}>{cat.prefix} · {cat.name}</option>)}</select></label><label><span>Lote</span><input name="lot" required /></label><span className="form-section-title field-span-two">Origen y ubicación</span><label><span>Proveedor</span><input name="vendor" placeholder="Proveedor opcional" /></label><label><span>Fórmula</span><input name="formula" placeholder="HCl 0.1 N" /></label><label><span>Ubicación</span><input name="location" required placeholder="Armario C1" /></label><label><span>Fecha de ingreso</span><input name="receivedAt" type="date" /></label><label><span>Fecha de vencimiento</span><input name="expires" type="date" /></label><span className="form-section-title field-span-two">Existencias</span><label><span>Existencia inicial</span><input name="quantity" required type="number" min="0" step="0.001" /></label><label><span>Stock mínimo</span><input name="minimum" required type="number" min="0" step="0.001" /></label><label><span>Unidad</span><input name="unit" required defaultValue="unidades" /></label><span className="form-section-title field-span-two">Seguridad</span><label className="field-span-two"><span>URL de ficha de seguridad</span><input name="safetySheetUrl" type="url" placeholder="https://.../ficha-seguridad.pdf" /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function InventoryMovementModal({ open, items, onClose, onSave }: Readonly<{ open: boolean; items: InventoryItem[]; onClose: () => void; onSave: (record: TableRow & { itemId: string; quantityDelta: number }) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const item = items.find((value) => value.id === data.get("itemId")); if (!item) return; const quantity = Number(data.get("quantity")); const type = String(data.get("type")); const delta = type === "Entrada" || type === "Ajuste positivo" ? quantity : -quantity; void onSave({ itemId: item.id, item: item.name, lot: String(item.lot), type, quantity: `${quantity} ${unitFromQuantity(item.quantity)}`, reason: String(data.get("reason")), quantityDelta: delta }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Registrar movimiento" description="Cada uso de un reactivo queda trazado con motivo y responsable." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Artículo</span><select name="itemId" required>{items.map((item) => <option key={item.id} value={item.id}>{item.sku} · {item.name}</option>)}</select></label><label><span>Tipo</span><select name="type"><option>Consumo</option><option>Entrada</option><option>Salida</option><option>Ajuste positivo</option><option>Ajuste negativo</option><option>Descarte</option></select></label><label><span>Cantidad</span><input name="quantity" type="number" min="0.001" step="0.001" required /></label><label><span>Motivo o práctica relacionada</span><textarea name="reason" required rows={3} /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function LocationModal({ open, onClose, onSave }: Readonly<{ open: boolean; onClose: () => void; onSave: (record: TableRow) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); void onSave({ code: String(data.get("code")), hierarchy: String(data.get("hierarchy")), type: String(data.get("type")), responsible: String(data.get("responsible")), status: "Activa" }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Nueva ubicación" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Código</span><input name="code" required placeholder="ARM-C2" /></label><label><span>Ruta jerárquica</span><input name="hierarchy" required placeholder="Sede central → Laboratorio → Armario C2" /></label><label><span>Tipo</span><input name="type" required placeholder="Armario" /></label><label><span>Responsable</span><input name="responsible" required /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function EquipmentModal({ open, onClose, onSave }: Readonly<{ open: boolean; onClose: () => void; onSave: (record: EquipmentItem) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); void onSave({ id: crypto.randomUUID(), code: String(data.get("code")), name: String(data.get("name")), area: String(data.get("area")), status: "Operativo", calibration: "Sin registro", maintenance: String(data.get("maintenance") || "Sin programar"), utilization: "0%", manufacturer: String(data.get("brand") || ""), model: String(data.get("model") || ""), serialNumber: String(data.get("serial") || ""), location: String(data.get("location") || "") }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Registrar equipo" description="El equipo quedará disponible para planes, certificados y etiqueta QR." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><span className="form-section-title field-span-two">Identificación</span><label><span>Código</span><input name="code" required placeholder="EQ-MIC-010" /></label><label><span>Nombre</span><input name="name" required /></label><label><span>Marca</span><input name="brand" /></label><label><span>Modelo</span><input name="model" /></label><label><span>Serie</span><input name="serial" /></label><span className="form-section-title field-span-two">Ubicación y mantenimiento</span><label><span>Área</span><input name="area" required /></label><label><span>Ubicación</span><input name="location" required /></label><label><span>Próximo mantenimiento</span><input name="maintenance" type="date" /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function EquipmentPlanModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentItem[]; onClose: () => void; onSave: (record: TableRow) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const item = equipment.find((value) => value.id === data.get("equipmentId")); if (!item) return; void onSave({ equipmentId: item.id, code: item.code, equipment: item.name, plan: String(data.get("plan")), frequency: String(data.get("frequency")), next: String(data.get("next") || "Al utilizar"), blocking: data.get("blocking") ? "Sí" : "No", status: "Vigente" }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Nuevo plan periódico" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Equipo</span><select name="equipmentId">{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Tipo de plan</span><select name="plan"><option>Verificación</option><option>Calibración</option><option>Mantenimiento preventivo</option><option>Calificación</option><option>Limpieza</option></select></label><label><span>Frecuencia</span><input name="frequency" required placeholder="Cada 6 meses" /></label><label><span>Próxima fecha</span><input name="next" type="date" /></label><label className="checkbox-line"><input name="blocking" type="checkbox" /><span>Bloquear uso cuando esté vencido</span></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function CertificateModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentItem[]; onClose: () => void; onSave: (record: TableRow) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const item = equipment.find((value) => value.id === data.get("equipmentId")); if (!item) return; const file = data.get("file"); void onSave({ equipmentId: item.id, code: String(data.get("code")), equipment: item.name, type: String(data.get("type")), provider: String(data.get("provider")), issued: String(data.get("issued")), expires: String(data.get("expires")), originalFilename: file instanceof File ? file.name : "", status: "Vigente" }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Adjuntar certificado" description="Registra la evidencia y deja el archivo preparado para el adaptador de object storage." onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid form-grid-two"><label><span>Equipo</span><select name="equipmentId">{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Número</span><input name="code" required /></label><label><span>Tipo</span><select name="type"><option>Calibración</option><option>Calificación</option><option>Mantenimiento</option><option>Reparación</option></select></label><label><span>Proveedor</span><input name="provider" required /></label><label><span>Emisión</span><input name="issued" type="date" required /></label><label><span>Vencimiento</span><input name="expires" type="date" required /></label><label className="field-span-two"><span>PDF o fotografía</span><input name="file" type="file" required accept="application/pdf,image/*" /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function EquipmentEventModal({ open, equipment, onClose, onSave }: Readonly<{ open: boolean; equipment: EquipmentItem[]; onClose: () => void; onSave: (record: TableRow) => void | Promise<void> }>) {
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const file = data.get("file"); void onSave({ equipmentId: String(data.get("equipmentId")), eventType: String(data.get("eventType")), details: String(data.get("details")), originalFilename: file instanceof File ? file.name : "" }); event.currentTarget.reset(); onClose(); }
  return <ActionModal open={open} title="Registrar evento de equipo" onClose={onClose}><form className="modal-form" onSubmit={submit}><div className="form-grid"><label><span>Equipo</span><select name="equipmentId">{equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label><label><span>Evento</span><select name="eventType"><option>Verificación</option><option>Mantenimiento</option><option>Calibración</option><option>Reparación</option><option>Limpieza</option></select></label><label><span>Detalle</span><textarea name="details" rows={4} required /></label><label><span>Evidencia</span><input name="file" type="file" accept="application/pdf,image/*" /></label></div><ModalFooter onClose={onClose} /></form></ActionModal>;
}

function ModalFooter({ onClose }: Readonly<{ onClose: () => void }>) { return <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button">Guardar</button></footer>; }
