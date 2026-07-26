// Cumplimiento regulatorio de reactivos controlados y de doble uso.
//
// Catálogos, etiquetas y reglas puras que comparten el servidor, la web y la
// app móvil. Nada aquí toca la base de datos: así se puede probar sin ella y
// las tres capas hablan exactamente el mismo idioma ante una inspección.

// ─── Catálogo de reactivos ──────────────────────────────────────────────────

export const REAGENT_CATEGORIES = ["CONTROLLED", "DUAL_USE", "PRECURSOR", "UNCONTROLLED"] as const;
export type ReagentCategory = (typeof REAGENT_CATEGORIES)[number];

export const REAGENT_CATEGORY_LABEL: Record<ReagentCategory, string> = {
  CONTROLLED: "Controlado",
  DUAL_USE: "Doble uso",
  PRECURSOR: "Precursor",
  UNCONTROLLED: "No controlado",
};

export const REAGENT_CATEGORY_HINT: Record<ReagentCategory, string> = {
  CONTROLLED: "Requiere licencia vigente, autorización previa de uso y reporte a la autoridad.",
  DUAL_USE: "Puede desviarse a usos indebidos: exige trazabilidad completa de cada consumo.",
  PRECURSOR: "Precursor de sustancias controladas: sujeto a control y reporte del Ministerio de Gobernación.",
  UNCONTROLLED: "Sin requisitos regulatorios especiales más allá de la ficha de seguridad.",
};

/** Autoridades que se registran con más frecuencia en Guatemala. */
export const REGULATORS = [
  "Ministerio de Gobernación",
  "Ministerio de Salud Pública y Asistencia Social",
  "Ministerio de Ambiente y Recursos Naturales",
  "Dirección General de Control de Armas y Municiones",
  "Registro Sanitario",
  "Otra autoridad",
] as const;

/** Un reactivo de estas categorías arrastra obligaciones documentales. */
export function isRegulated(category: string | null | undefined): boolean {
  return category === "CONTROLLED" || category === "DUAL_USE" || category === "PRECURSOR";
}

// ─── Permisos y licencias ───────────────────────────────────────────────────

export const PERMIT_TYPES = ["LICENSE", "PERMIT", "AUTHORIZATION", "REGISTRATION", "IMPORT_PERMIT", "OTHER"] as const;
export type PermitType = (typeof PERMIT_TYPES)[number];

export const PERMIT_TYPE_LABEL: Record<PermitType, string> = {
  LICENSE: "Licencia",
  PERMIT: "Permiso",
  AUTHORIZATION: "Autorización",
  REGISTRATION: "Registro",
  IMPORT_PERMIT: "Permiso de importación",
  OTHER: "Otro documento",
};

export const PERMIT_STATUSES = ["ACTIVE", "SUSPENDED", "REVOKED"] as const;

export const PERMIT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Vigente",
  SUSPENDED: "Suspendido",
  REVOKED: "Revocado",
  EXPIRED: "Vencido",
};

/** Días de aviso previo al vencimiento de una licencia. */
export const PERMIT_WARNING_DAYS = 60;

export type PermitState = "ACTIVE" | "EXPIRING" | "EXPIRED" | "SUSPENDED" | "REVOKED" | "NO_EXPIRY";

/**
 * Estado real de un permiso: el campo `status` permite suspenderlo o revocarlo
 * a mano, pero el vencimiento se deriva siempre de la fecha, que es lo que mira
 * el inspector.
 */
export function permitState(
  permit: { status: string; expires_on?: string | Date | null },
  now: Date = new Date(),
): PermitState {
  if (permit.status === "SUSPENDED") return "SUSPENDED";
  if (permit.status === "REVOKED") return "REVOKED";
  if (!permit.expires_on) return "NO_EXPIRY";
  const expires = permit.expires_on instanceof Date ? permit.expires_on : new Date(permit.expires_on);
  if (!Number.isFinite(expires.getTime())) return "NO_EXPIRY";
  const days = (expires.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 0) return "EXPIRED";
  if (days <= PERMIT_WARNING_DAYS) return "EXPIRING";
  return "ACTIVE";
}

export const PERMIT_STATE_LABEL: Record<PermitState, string> = {
  ACTIVE: "Vigente",
  EXPIRING: "Por vencer",
  EXPIRED: "Vencido",
  SUSPENDED: "Suspendido",
  REVOKED: "Revocado",
  NO_EXPIRY: "Sin vencimiento",
};

/** Solo un permiso vigente ampara una compra o un uso. */
export function permitCovers(permit: { status: string; expires_on?: string | Date | null }, now: Date = new Date()): boolean {
  const state = permitState(permit, now);
  return state === "ACTIVE" || state === "EXPIRING" || state === "NO_EXPIRY";
}

// ─── Disposición final ──────────────────────────────────────────────────────

export const DISPOSAL_METHODS = ["AUTHORIZED_MANAGER", "INCINERATION", "NEUTRALIZATION", "VENDOR_RETURN", "OTHER"] as const;

export const DISPOSAL_METHOD_LABEL: Record<string, string> = {
  AUTHORIZED_MANAGER: "Gestor autorizado de residuos",
  INCINERATION: "Incineración",
  NEUTRALIZATION: "Neutralización en el laboratorio",
  VENDOR_RETURN: "Devolución al proveedor",
  OTHER: "Otro método",
};

export const DISPOSAL_REASONS = ["EXPIRED", "CONTAMINATED", "DAMAGED", "SURPLUS", "REGULATORY_ORDER", "OTHER"] as const;

export const DISPOSAL_REASON_LABEL: Record<string, string> = {
  EXPIRED: "Vencido",
  CONTAMINATED: "Contaminado",
  DAMAGED: "Envase dañado",
  SURPLUS: "Excedente sin uso",
  REGULATORY_ORDER: "Orden de la autoridad",
  OTHER: "Otro motivo",
};

// ─── Inventario físico ──────────────────────────────────────────────────────

export const COUNT_SCOPES = ["CONTROLLED", "ALL", "CATEGORY"] as const;

export const COUNT_SCOPE_LABEL: Record<string, string> = {
  CONTROLLED: "Solo reactivos controlados y de doble uso",
  ALL: "Todo el inventario",
  CATEGORY: "Una categoría específica",
};

export const COUNT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  IN_PROGRESS: "En conteo",
  CLOSED: "Cerrado, pendiente de aprobación",
  APPROVED: "Aprobado",
  CANCELLED: "Cancelado",
};

/** Diferencia entre lo contado y lo que dice el sistema. */
export function countDifference(systemQuantity: number, countedQuantity: number | null): number | null {
  if (countedQuantity === null || !Number.isFinite(countedQuantity)) return null;
  return Number((countedQuantity - systemQuantity).toFixed(3));
}

/**
 * Una diferencia distinta de cero exige justificación escrita: es el punto que
 * más se revisa en auditoría y el que no puede quedar en blanco.
 */
export function requiresJustification(difference: number | null): boolean {
  return difference !== null && Math.abs(difference) > 0.0001;
}

// ─── Vencimiento de reactivos ───────────────────────────────────────────────

export const EXPIRY_WARNING_DAYS = 30;

export type ExpiryState = "OK" | "EXPIRING" | "EXPIRED" | "NO_EXPIRY";

export function expiryState(expiresAt: string | Date | null | undefined, now: Date = new Date()): ExpiryState {
  if (!expiresAt) return "NO_EXPIRY";
  const date = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (!Number.isFinite(date.getTime())) return "NO_EXPIRY";
  const days = (date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 0) return "EXPIRED";
  if (days <= EXPIRY_WARNING_DAYS) return "EXPIRING";
  return "OK";
}

// ─── Recepción de compras ───────────────────────────────────────────────────

/**
 * Campos que la autoridad exige al recibir un reactivo controlado. Se valida en
 * el servidor: sin ellos la recepción no se registra.
 */
export const REQUIRED_RECEIPT_FIELDS = ["vendor", "invoiceNumber", "receivedQuantity", "receivedOn"] as const;

export function missingReceiptFields(
  input: Record<string, unknown>,
  controlled: boolean,
): string[] {
  const missing: string[] = [];
  const labels: Record<string, string> = {
    vendor: "Proveedor",
    invoiceNumber: "Número de factura",
    receivedQuantity: "Cantidad recibida",
    receivedOn: "Fecha de recepción",
    licenseNumber: "Número de licencia",
    permitNumber: "Número de permiso",
    receivedByName: "Responsable que recibió",
  };
  for (const field of REQUIRED_RECEIPT_FIELDS) {
    const value = input[field];
    if (value === undefined || value === null || String(value).trim() === "") missing.push(labels[field]);
  }
  // Un controlado suma licencia, permiso y responsable identificado.
  if (controlled) {
    for (const field of ["licenseNumber", "permitNumber", "receivedByName"]) {
      const value = input[field];
      if (value === undefined || value === null || String(value).trim() === "") missing.push(labels[field]);
    }
  }
  return missing;
}

// ─── Códigos correlativos ───────────────────────────────────────────────────

export const COMPLIANCE_CODE_PREFIX = {
  catalog: "RG",
  receipt: "REC",
  count: "INV",
  disposal: "DES",
} as const;
