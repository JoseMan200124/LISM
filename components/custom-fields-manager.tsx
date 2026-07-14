"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, Save, SlidersHorizontal, Trash2 } from "lucide-react";
import { Toast, useToast } from "@/components/action-kit";
import type { CustomFieldDefinition } from "@/lib/custom-fields";

const TYPE_LABEL: Record<string, string> = { TEXT: "Texto", NUMBER: "Número", DATE: "Fecha", TEXTAREA: "Texto largo", SELECT: "Selección", BOOLEAN: "Sí / No" };
const MODULE_LABEL: Record<string, string> = { inventory: "Inventario", equipment: "Equipos" };

export function CustomFieldsManager() {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  const [open, setOpen] = useState(false);
  const [module, setModule] = useState<"inventory" | "equipment">("inventory");
  const [fieldType, setFieldType] = useState("TEXT");
  const [saving, setSaving] = useState(false);
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

  async function remove(def: CustomFieldDefinition) {
    if (!window.confirm(`¿Eliminar el campo "${def.label}"? Si ya tiene datos registrados, se archivará en su lugar.`)) return;
    try {
      const res = await fetch(`/api/configuration/custom-fields/${def.id}`, { method: "DELETE" });
      if (res.ok) { const p = await res.json() as { message?: string }; showToast(p.message ?? "Campo eliminado."); await load(); }
      else { const p = await res.json().catch(() => ({})) as { message?: string }; showError(p.message ?? "No se pudo eliminar el campo."); }
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  const active = defs.filter((d) => (d.status ?? "ACTIVE") === "ACTIVE");

  return (
    <div>
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
              <button className="icon-button" aria-label={`Eliminar ${def.label}`} onClick={() => void remove(def)}><Trash2 size={15} /></button>
            </article>
          ))}
        </div>
      )}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}
