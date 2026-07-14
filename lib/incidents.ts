// Lógica y catálogos de Incidencias / Hallazgos. Extraído para poder probar la
// generación de código sin base de datos y para compartir enums entre API y UI.

export const INCIDENT_CATEGORIES = ["ACCIDENT", "EQUIPMENT_DAMAGE", "SPILL", "FINDING", "DEVIATION", "NONCOMPLIANCE", "OTHER"] as const;
export const INCIDENT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const INCIDENT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "ARCHIVED"] as const;
export const INCIDENT_RELATED_TYPES = ["EQUIPMENT", "INVENTORY_ITEM", "EDUCATIONAL_PRACTICE"] as const;

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/**
 * Siguiente código INC-<año>-NNN único por laboratorio, a partir de los códigos
 * ya existentes del año en curso.
 */
export function computeNextIncidentCode(existingCodes: readonly string[], year: number): string {
  const prefix = `INC-${year}-`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const value = Number(suffix);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

// PostgreSQL: la relación no existe todavía (migración 0014 sin aplicar).
export function isMissingRelationError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /relation .*incidents.* does not exist|does not exist/i.test(error.message);
}
