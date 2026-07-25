// Control de reactivos de doble uso o precursores.
//
// Núcleo de reglas de negocio (probado en __tests__/inventory/controlled.test.ts):
// un reactivo marcado como controlado no puede descontarse del inventario sin un
// registro de consumo con trazabilidad completa (qué, cuánto, cuándo, quién y
// para qué). Estas reglas se aplican en el servidor (movimientos y descartes) y
// guían la UI del módulo de Inventario y de la vista "Reactivos controlados".

export type ControlKind = "DUAL_USE" | "PRECURSOR" | "BOTH";

export const CONTROL_KIND_LABEL: Record<ControlKind, string> = {
  DUAL_USE: "Doble uso",
  PRECURSOR: "Precursor",
  BOTH: "Doble uso y precursor",
};

export const CONTROL_KIND_OPTIONS: ReadonlyArray<{ value: ControlKind; label: string }> = [
  { value: "DUAL_USE", label: "Doble uso" },
  { value: "PRECURSOR", label: "Precursor" },
  { value: "BOTH", label: "Doble uso y precursor" },
];

export function isControlKind(value: unknown): value is ControlKind {
  return value === "DUAL_USE" || value === "PRECURSOR" || value === "BOTH";
}

// Movimientos que descuentan existencia y, por tanto, exigen registro de
// consumo cuando el reactivo es controlado. Una transferencia (delta 0) o una
// entrada no descuentan y no lo requieren.
export function isStockReducingMovement(movementType: string, direction?: string | null): boolean {
  if (movementType === "CONSUMPTION" || movementType === "DISPOSAL") return true;
  if (movementType === "ADJUSTMENT" && direction === "OUT") return true;
  return false;
}

export type ControlledUsageInput = {
  usageArea?: string | null;
  usagePurpose?: string | null;
  usedByPerson?: string | null;
};

// Etiquetas de los campos obligatorios del registro de consumo controlado.
export const CONTROLLED_FIELD_LABELS: Record<keyof ControlledUsageInput, string> = {
  usageArea: "Área, laboratorio o proyecto relacionado",
  usagePurpose: "Motivo o finalidad de uso",
  usedByPerson: "Usuario/persona que lo utilizó",
};

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length < 2;
}

// Devuelve las claves de los campos obligatorios que faltan para registrar el
// consumo de un reactivo controlado. Un arreglo vacío significa que el registro
// está completo y el descuento puede proceder.
export function missingControlledFields(input: ControlledUsageInput): Array<keyof ControlledUsageInput> {
  const missing: Array<keyof ControlledUsageInput> = [];
  if (isBlank(input.usageArea)) missing.push("usageArea");
  if (isBlank(input.usagePurpose)) missing.push("usagePurpose");
  if (isBlank(input.usedByPerson)) missing.push("usedByPerson");
  return missing;
}

// Mensaje humano y consistente cuando falta información obligatoria de un
// consumo controlado, usado tanto por el API como por la UI.
export function controlledLogErrorMessage(missing: Array<keyof ControlledUsageInput>): string {
  const labels = missing.map((key) => CONTROLLED_FIELD_LABELS[key]);
  return `Reactivo controlado (doble uso o precursor): no puede descontarse del inventario sin completar el registro de consumo. Falta: ${labels.join(", ")}.`;
}

// ---------------------------------------------------------------------------
// Autorización digital de uso (migración 0020)
//
// Sustituye la hoja en papel que el usuario llenaba, llevaba al responsable y
// regresaba firmada antes de poder usar el reactivo: solicitud -> autorización
// del responsable -> consumo en un clic. El consumo sigue siendo un movimiento
// de inventario normal; la autorización solo lo habilita y le presta la
// trazabilidad ya capturada.
// ---------------------------------------------------------------------------

export type ControlledRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CONSUMED" | "CANCELLED";

export const CONTROLLED_REQUEST_STATUS_LABEL: Record<ControlledRequestStatus, string> = {
  PENDING: "Por autorizar",
  APPROVED: "Autorizada",
  REJECTED: "Rechazada",
  CONSUMED: "Consumida",
  CANCELLED: "Cancelada",
};

export type ControlledUsagePolicy = {
  // Cuando es true, un reactivo controlado no puede descontarse sin una
  // autorización aprobada y vigente. Quien puede autorizar no queda bloqueado:
  // su propio consumo se registra como autorizado en el acto.
  requirePreapproval: boolean;
  // Horas que una autorización aprobada permanece utilizable.
  validityHours: number;
};

export const DEFAULT_CONTROLLED_POLICY: ControlledUsagePolicy = {
  requirePreapproval: true,
  validityHours: 72,
};

export const MIN_VALIDITY_HOURS = 1;
export const MAX_VALIDITY_HOURS = 720; // 30 días

export function clampValidityHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_CONTROLLED_POLICY.validityHours;
  return Math.min(MAX_VALIDITY_HOURS, Math.max(MIN_VALIDITY_HOURS, Math.round(hours)));
}

// Normaliza la política guardada en laboratory_settings.controlled_usage_policy.
// Un JSON vacío, parcial o corrupto cae a los valores por defecto en lugar de
// romper el módulo.
export function resolveControlledPolicy(raw: unknown): ControlledUsagePolicy {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...DEFAULT_CONTROLLED_POLICY };
  const value = raw as Record<string, unknown>;
  return {
    requirePreapproval:
      typeof value.requirePreapproval === "boolean"
        ? value.requirePreapproval
        : DEFAULT_CONTROLLED_POLICY.requirePreapproval,
    validityHours:
      typeof value.validityHours === "number"
        ? clampValidityHours(value.validityHours)
        : DEFAULT_CONTROLLED_POLICY.validityHours,
  };
}

/**
 * Calcula el siguiente folio correlativo de autorización (AU-<año>-NNN) a
 * partir de los folios existentes del laboratorio para ese año. Ignora los
 * códigos que no siguen el formato del año en curso.
 */
export function computeNextRequestCode(existingCodes: readonly string[], year: number): string {
  const prefix = `AU-${year}-`;
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

// Forma mínima de una autorización para las reglas puras. Coincide con las
// columnas de controlled_usage_requests para poder pasar la fila tal cual.
export type ControlledAuthorization = {
  status: string;
  quantity: number | string;
  approved_quantity?: number | string | null;
  expires_at?: string | Date | null;
  consumed_at?: string | Date | null;
};

// Cantidad efectivamente autorizada: la que aprobó el responsable si ajustó el
// pedido, o la solicitada si la aprobó tal cual.
export function authorizedQuantity(request: Pick<ControlledAuthorization, "quantity" | "approved_quantity">): number {
  const approved = request.approved_quantity;
  if (approved !== null && approved !== undefined && Number.isFinite(Number(approved))) {
    return Number(approved);
  }
  return Number(request.quantity);
}

function toTime(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

export function isAuthorizationExpired(expiresAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  const time = toTime(expiresAt);
  if (time === null) return false; // sin vigencia definida no vence
  return time <= now.getTime();
}

export type AuthorizationState = "USABLE" | "PENDING" | "EXPIRED" | "CONSUMED" | "REJECTED" | "CANCELLED";

// Estado utilizable de una autorización. Solo "USABLE" habilita el descuento.
export function authorizationState(request: ControlledAuthorization, now: Date = new Date()): AuthorizationState {
  if (request.status === "REJECTED") return "REJECTED";
  if (request.status === "CANCELLED") return "CANCELLED";
  if (request.status === "CONSUMED" || request.consumed_at) return "CONSUMED";
  if (request.status === "PENDING") return "PENDING";
  if (request.status !== "APPROVED") return "PENDING";
  if (isAuthorizationExpired(request.expires_at, now)) return "EXPIRED";
  return "USABLE";
}

export function isAuthorizationUsable(request: ControlledAuthorization, now: Date = new Date()): boolean {
  return authorizationState(request, now) === "USABLE";
}

export const AUTHORIZATION_STATE_MESSAGE: Record<AuthorizationState, string> = {
  USABLE: "Autorización vigente.",
  PENDING: "Esta solicitud todavía está por autorizar.",
  EXPIRED: "La autorización venció. Solicita una nueva para poder consumir.",
  CONSUMED: "Esta autorización ya se usó en un consumo registrado.",
  REJECTED: "Esta solicitud fue rechazada por el responsable.",
  CANCELLED: "Esta solicitud fue cancelada.",
};

// Fecha de vencimiento de una autorización recién aprobada.
export function authorizationExpiry(approvedAt: Date, validityHours: number): Date {
  return new Date(approvedAt.getTime() + clampValidityHours(validityHours) * 60 * 60 * 1000);
}

// Mensaje del bloqueo cuando la política exige autorización previa y el usuario
// no puede autorizarse a sí mismo.
export function authorizationRequiredMessage(itemName?: string | null): string {
  const target = itemName ? ` de ${itemName}` : "";
  return `Reactivo controlado: el consumo${target} requiere una autorización aprobada y vigente del responsable. Envía la solicitud desde "Reactivos controlados" y podrás registrar el consumo en un clic cuando se autorice.`;
}

// Verifica que la cantidad a descontar quepa en la autorización. Devuelve el
// mensaje del rechazo o null si es válida.
export function checkAuthorizedQuantity(
  request: ControlledAuthorization,
  quantity: number,
  unit: string,
): string | null {
  const limit = authorizedQuantity(request);
  // Tolerancia de redondeo por conversión de unidades (mL↔L, g↔kg…).
  if (quantity > limit + 1e-6) {
    return `La cantidad (${quantity} ${unit}) supera la autorizada (${limit} ${unit}). Solicita una autorización nueva o registra una cantidad menor o igual.`;
  }
  return null;
}

export type ControlledRequestInput = {
  usedByPerson?: string | null;
  usageArea?: string | null;
  usagePurpose?: string | null;
};

// Campos obligatorios de la solicitud: son los mismos que exige el registro de
// consumo, capturados una sola vez y al inicio del flujo.
export function missingRequestFields(input: ControlledRequestInput): Array<keyof ControlledUsageInput> {
  return missingControlledFields({
    usageArea: input.usageArea,
    usagePurpose: input.usagePurpose,
    usedByPerson: input.usedByPerson,
  });
}

