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
