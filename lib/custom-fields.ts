// Campos personalizados: catálogos, tipos y validación compartida entre la API
// de definiciones (app/api/configuration/custom-fields) y los formularios que
// los consumen (inventario, equipos). Extraído para poder probarlo sin BD.

export const CUSTOM_FIELD_MODULES = ["inventory", "equipment", "education"] as const;
export type CustomFieldModule = (typeof CUSTOM_FIELD_MODULES)[number];

export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "TEXTAREA", "SELECT", "BOOLEAN"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const MODULE_LABELS: Record<CustomFieldModule, string> = {
  inventory: "Inventario",
  equipment: "Equipos",
  education: "Prácticas",
};

export type CustomFieldDefinition = {
  id: string;
  module_key: string;
  field_key: string;
  label: string;
  field_type: string;
  required_mode: string;
  validation_rule?: { help?: string; options?: string[] } | null;
  sort_order?: number;
  status?: string;
};

/** Convierte una etiqueta en un field_key estable (cf_<slug>). */
export function slugifyFieldKey(label: string): string {
  const base = label
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `cf_${base || "campo"}`.slice(0, 60);
}

/** Garantiza unicidad del field_key dentro de un módulo agregando sufijo. */
export function uniqueFieldKey(label: string, existingKeys: readonly string[]): string {
  const base = slugifyFieldKey(label);
  if (!existingKeys.includes(base)) return base;
  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

/**
 * Valida los campos obligatorios activos. Devuelve la lista de field_key que
 * faltan (vacía si todo bien). La API la usa para rechazar en servidor, no solo
 * en la UI.
 */
export function missingRequiredFields(
  definitions: readonly CustomFieldDefinition[],
  values: Record<string, unknown> | undefined,
): string[] {
  const v = values ?? {};
  return definitions
    .filter((d) => (d.status ?? "ACTIVE") === "ACTIVE" && d.required_mode === "REQUIRED")
    .filter((d) => isEmptyValue(v[d.field_key]))
    .map((d) => d.field_key);
}
