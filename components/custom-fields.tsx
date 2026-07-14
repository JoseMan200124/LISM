"use client";

import { useEffect, useState } from "react";
import type { CustomFieldDefinition, CustomFieldModule } from "@/lib/custom-fields";

/** Carga las definiciones activas de campos personalizados de un módulo. */
export function useCustomFieldDefs(module: CustomFieldModule) {
  const [defs, setDefs] = useState<CustomFieldDefinition[]>([]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/configuration/custom-fields?module=${module}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .catch(() => ({ data: [] }))
      .then((p: { data?: CustomFieldDefinition[] }) => { if (active) setDefs(p.data ?? []); });
    return () => { active = false; };
  }, [module]);
  return defs;
}

/** Renderiza los inputs de los campos personalizados dentro de un formulario. */
export function CustomFieldInputs({ defs }: Readonly<{ defs: CustomFieldDefinition[] }>) {
  if (defs.length === 0) return null;
  return (
    <>
      <span className="form-section-title field-span-two">Campos personalizados</span>
      {defs.map((d) => {
        const required = d.required_mode === "REQUIRED";
        const help = d.validation_rule?.help;
        const options = d.validation_rule?.options ?? [];
        const label = <span>{d.label}{required ? " *" : ""}</span>;
        if (d.field_type === "TEXTAREA") return <label key={d.id} className="field-span-two">{label}<textarea name={d.field_key} rows={2} required={required} />{help ? <small className="field-help">{help}</small> : null}</label>;
        if (d.field_type === "BOOLEAN") return <label key={d.id} className="checkbox-line field-span-two"><input type="checkbox" name={d.field_key} /><span>{d.label}</span></label>;
        if (d.field_type === "SELECT") return <label key={d.id}>{label}<select name={d.field_key} defaultValue="" required={required}><option value="">Selecciona…</option>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select>{help ? <small className="field-help">{help}</small> : null}</label>;
        const type = d.field_type === "NUMBER" ? "number" : d.field_type === "DATE" ? "date" : "text";
        return <label key={d.id}>{label}<input type={type} name={d.field_key} required={required} step={type === "number" ? "any" : undefined} />{help ? <small className="field-help">{help}</small> : null}</label>;
      })}
    </>
  );
}

/** Extrae los valores de los campos personalizados desde el FormData. */
export function collectCustomValues(defs: CustomFieldDefinition[], data: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const d of defs) {
    if (d.field_type === "BOOLEAN") { values[d.field_key] = data.get(d.field_key) === "on"; continue; }
    const raw = data.get(d.field_key);
    const str = raw === null ? "" : String(raw).trim();
    if (str !== "") values[d.field_key] = d.field_type === "NUMBER" ? Number(str) : str;
  }
  return values;
}
