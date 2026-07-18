"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Boxes, Pencil, Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { ActionModal, ConfirmModal, Toast, useToast } from "@/components/action-kit";
import { Tabs } from "@/components/lims-ui";
import type { CustomFieldDefinition } from "@/lib/custom-fields";

const TYPE_LABEL: Record<string, string> = { TEXT: "Texto", NUMBER: "Número", DATE: "Fecha", TEXTAREA: "Texto largo", SELECT: "Selección", BOOLEAN: "Sí / No" };
const MODULE_LABEL: Record<string, string> = { inventory: "Inventario", equipment: "Equipos" };

// ─── Plantillas por tipo de artículo (campos integrados del formulario) ──────

const ITEM_TYPES = [
  { key: "REAGENT", label: "Reactivo" },
  { key: "MATERIAL", label: "Material" },
  { key: "CONSUMABLE", label: "Insumo / consumible" },
  { key: "CULTURE_MEDIA", label: "Medio de cultivo" },
  { key: "OTHER", label: "Otro" },
] as const;

const COMMON_FIELDS: Array<{ key: string; label: string }> = [
  { key: "lot", label: "Lote" },
  { key: "vendor", label: "Proveedor" },
  { key: "location", label: "Ubicación" },
  { key: "receivedAt", label: "Fecha de ingreso" },
  { key: "expires", label: "Fecha de vencimiento" },
  { key: "safetySheet", label: "Ficha de seguridad o técnica" },
  { key: "notes", label: "Observaciones" },
];

const FIELDS_BY_TYPE: Record<string, Array<{ key: string; label: string }>> = {
  REAGENT: [...COMMON_FIELDS, { key: "formula", label: "Fórmula" }, { key: "concentration", label: "Concentración" }, { key: "storageConditions", label: "Condiciones de almacenamiento" }],
  MATERIAL: [...COMMON_FIELDS.filter((field) => field.key !== "expires"), { key: "brand", label: "Marca" }, { key: "model", label: "Modelo o descripción" }, { key: "material", label: "Material de fabricación" }],
  CONSUMABLE: [...COMMON_FIELDS, { key: "presentation", label: "Presentación" }, { key: "model", label: "Unidad de empaque" }],
  CULTURE_MEDIA: [...COMMON_FIELDS, { key: "cultureMediaType", label: "Tipo de medio" }, { key: "brand", label: "Fabricante" }, { key: "storageConditions", label: "Condiciones de almacenamiento" }],
  OTHER: COMMON_FIELDS,
};

type FieldRequirements = Record<string, Record<string, string>>;

function FieldTemplatesSection() {
  const [itemType, setItemType] = useState<string>("REAGENT");
  const [requirements, setRequirements] = useState<FieldRequirements>({});
  const [pendingMigration, setPendingMigration] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => {
    let active = true;
    void fetch("/api/configuration/field-requirements")
      .then((response) => (response.ok ? response.json() : { data: { inventory: {} } }))
      .catch(() => ({ data: { inventory: {} } }))
      .then((payload: { data?: { inventory?: FieldRequirements }; mode?: string }) => {
        if (!active) return;
        setRequirements(payload.data?.inventory ?? {});
        setPendingMigration(payload.mode === "pending-migration");
      });
    return () => { active = false; };
  }, []);

  function toggle(fieldKey: string) {
    setRequirements((current) => {
      const forType = { ...(current[itemType] ?? {}) };
      forType[fieldKey] = forType[fieldKey] === "REQUIRED" ? "OPTIONAL" : "REQUIRED";
      return { ...current, [itemType]: forType };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/configuration/field-requirements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory: requirements }),
      });
      if (response.ok) { showToast("Plantillas guardadas: los formularios de inventario ya aplican los campos obligatorios."); setDirty(false); }
      else {
        const payload = await response.json().catch(() => ({})) as { message?: string };
        showError(payload.message ?? "No se pudieron guardar las plantillas.");
      }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setSaving(false); }
  }

  const fields = FIELDS_BY_TYPE[itemType] ?? COMMON_FIELDS;

  return (
    <div style={{ marginTop: 28 }}>
      <div className="section-heading">
        <div><h2>Campos por tipo de artículo</h2><p>Decide qué campos del formulario de inventario son obligatorios para cada tipo de artículo. Lo obligatorio se exige al crear el artículo.</p></div>
        <button className="primary-button" onClick={() => void save()} disabled={saving || !dirty || pendingMigration}><Save size={15} /> {saving ? "Guardando…" : "Guardar plantillas"}</button>
      </div>
      {pendingMigration ? <p className="modal-note">Disponible al aplicar la actualización de base de datos (migración 0017).</p> : null}
      <div className="filter-chip-row" role="group" aria-label="Tipo de artículo">
        {ITEM_TYPES.map((type) => (
          <button key={type.key} type="button" className={`filter-chip${itemType === type.key ? " filter-chip-active" : ""}`} onClick={() => setItemType(type.key)}><Boxes size={13} /> {type.label}</button>
        ))}
      </div>
      <div className="definition-list">
        {fields.map((field) => {
          const required = requirements[itemType]?.[field.key] === "REQUIRED";
          return (
            <article key={field.key} className="definition-row">
              <span className="definition-icon"><SlidersHorizontal size={16} /></span>
              <div><strong>{field.label}{required ? " *" : ""}</strong><p>{required ? "Obligatorio al crear este tipo de artículo" : "Opcional"}</p></div>
              <small>{ITEM_TYPES.find((type) => type.key === itemType)?.label}</small>
              <button type="button" className={required ? "primary-button compact-button" : "secondary-button compact-button"} onClick={() => toggle(field.key)} disabled={pendingMigration}>
                {required ? "Obligatorio" : "Opcional"}
              </button>
            </article>
          );
        })}
      </div>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Campos personalizados ───────────────────────────────────────────────────

export function CustomFieldsManager() {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<"inventory" | "equipment">("inventory");
  const [fieldType, setFieldType] = useState("TEXT");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | null>(null);
  const [deleting, setDeleting] = useState<CustomFieldDefinition | null>(null);
  const [tab, setTab] = useState("custom");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/configuration/custom-fields");
      if (res.ok) { const p = await res.json() as { data?: CustomFieldDefinition[] }; setDefs(p.data ?? []); }
    } catch { /* deja lista vacía */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") ?? "").trim();
    if (label.length < 2) { showError("Escribe un nombre para el campo."); return; }
    const optionsRaw = String(data.get("options") ?? "").trim();
    setSaving(true);
    try {
      const res = await fetch("/api/configuration/custom-fields", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module, label, fieldType,
          required: data.get("required") === "on",
          help: String(data.get("help") ?? "").trim() || undefined,
          options: fieldType === "SELECT" && optionsRaw ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        }),
      });
      if (res.ok) { showToast(`Campo creado. Aparecerá en el formulario de ${MODULE_LABEL[module]}.`); setOpen(false); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo crear el campo."); }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setSaving(false); }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const data = new FormData(event.currentTarget);
    const optionsRaw = String(data.get("options") ?? "").trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/configuration/custom-fields/${editing.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: String(data.get("label") ?? "").trim(),
          required: data.get("required") === "on",
          help: String(data.get("help") ?? "").trim(),
          options: editing.field_type === "SELECT" ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean) : undefined,
        }),
      });
      if (res.ok) { showToast("Campo actualizado."); setEditing(null); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo actualizar el campo."); }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setSaving(false); }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      const res = await fetch(`/api/configuration/custom-fields/${deleting.id}`, { method: "DELETE" });
      if (res.ok) { const p = await res.json() as { message?: string }; showToast(p.message ?? "Campo eliminado."); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo eliminar el campo."); }
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setDeleting(null); }
  }

  const active = defs.filter((d) => (d.status ?? "ACTIVE") === "ACTIVE");

  return (
    <div>
      <Tabs items={[{ key: "custom", label: "Campos personalizados" }, { key: "templates", label: "Plantillas por tipo de artículo" }]} active={tab} onChange={setTab} />
      {tab === "templates" ? <FieldTemplatesSection /> : (
        <div style={{ marginTop: 18 }}>
          <div className="section-heading">
            <div><h2>Campos personalizados</h2><p>Añade información propia a Inventario y Equipos sin tocar el código. Aparecen en el formulario del módulo y se guardan con cada registro.</p></div>
            <button className="primary-button" onClick={() => setOpen((c) => !c)}><Plus size={15} /> Nuevo campo</button>
          </div>
          {open ? (
            <form className="inline-editor" onSubmit={create}>
              <label><span>Módulo</span><select value={module} onChange={(e) => setModule(e.target.value as typeof module)}><option value="inventory">Inventario</option><option value="equipment">Equipos</option></select></label>
              <label><span>Nombre visible</span><input name="label" required placeholder="Ej. Fecha de descarte" /></label>
              <label><span>Tipo</span><select value={fieldType} onChange={(e) => setFieldType(e.target.value)}><option value="TEXT">Texto</option><option value="NUMBER">Número</option><option value="DATE">Fecha</option><option value="TEXTAREA">Texto largo</option><option value="SELECT">Selección</option><option value="BOOLEAN">Sí / No</option></select></label>
              {fieldType === "SELECT" ? <label><span>Opciones (separadas por coma)</span><input name="options" placeholder="Bajo, Medio, Alto" /></label> : null}
              <label><span>Ayuda (opcional)</span><input name="help" placeholder="Texto guía para quien llena el formulario" /></label>
              <label className="checkbox-line"><input name="required" type="checkbox" /><span>Obligatorio</span></label>
              <button className="primary-button" type="submit" disabled={saving}><Save size={15} /> {saving ? "Guardando…" : "Agregar"}</button>
            </form>
          ) : null}
          {active.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><SlidersHorizontal size={22} /></div><h3>Sin campos personalizados</h3><p>Crea un campo para capturar información adicional en Inventario o Equipos.</p></div>
          ) : (
            <div className="definition-list">
              {active.map((def) => (
                <article key={def.id} className="definition-row">
                  <span className="definition-icon"><SlidersHorizontal size={16} /></span>
                  <div><strong>{def.label}{def.required_mode === "REQUIRED" ? " *" : ""}</strong><p>{MODULE_LABEL[def.module_key] ?? def.module_key} · {TYPE_LABEL[def.field_type] ?? def.field_type} · {def.required_mode === "REQUIRED" ? "Obligatorio" : "Opcional"}</p></div>
                  <small>Aparece en {MODULE_LABEL[def.module_key] ?? def.module_key}</small>
                  <div className="definition-row-actions">
                    <button className="icon-button" aria-label={`Editar ${def.label}`} onClick={() => setEditing(def)}><Pencil size={15} /></button>
                    <button className="icon-button" aria-label={`Eliminar ${def.label}`} onClick={() => setDeleting(def)}><Trash2 size={15} /></button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      <ActionModal open={Boolean(editing)} title={editing ? `Editar campo "${editing.label}"` : "Editar campo"} description="Los cambios aplican a los formularios de inmediato; los datos ya guardados no se modifican." onClose={() => setEditing(null)}>
        {editing ? (
          <form className="modal-form" onSubmit={saveEdit}>
            <div className="form-grid">
              <label><span>Nombre visible</span><input name="label" required minLength={2} defaultValue={editing.label} /></label>
              {editing.field_type === "SELECT" ? <label><span>Opciones (separadas por coma)</span><input name="options" defaultValue={(editing.validation_rule?.options ?? []).join(", ")} /></label> : null}
              <label><span>Ayuda</span><input name="help" defaultValue={editing.validation_rule?.help ?? ""} /></label>
              <label className="checkbox-line"><input name="required" type="checkbox" defaultChecked={editing.required_mode === "REQUIRED"} /><span>Obligatorio</span></label>
              <p className="modal-note">Tipo: {TYPE_LABEL[editing.field_type] ?? editing.field_type} · Módulo: {MODULE_LABEL[editing.module_key] ?? editing.module_key}. El tipo no se cambia para no invalidar datos ya capturados.</p>
            </div>
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setEditing(null)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button>
            </footer>
          </form>
        ) : null}
      </ActionModal>

      <ConfirmModal
        open={Boolean(deleting)}
        title={deleting ? `Eliminar el campo "${deleting.label}"` : "Eliminar campo"}
        description="Si el campo ya tiene datos registrados, se archivará en su lugar para conservar la trazabilidad."
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}
