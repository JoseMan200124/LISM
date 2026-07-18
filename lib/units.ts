// Unidades de laboratorio para movimientos de inventario.
//
// Permite registrar un consumo en una unidad distinta a la del artículo
// (p. ej. 250 mL de un lote controlado en litros) y que el servidor convierta
// y descuente la cantidad correcta. Solo se convierten unidades compatibles;
// las unidades de conteo (unidades, piezas…) no se convierten entre sí.

const SYNONYMS: Record<string, string> = {
  l: "l", lt: "l", lts: "l", litro: "l", litros: "l",
  dl: "dl", decilitro: "dl", decilitros: "dl",
  cl: "cl", centilitro: "cl", centilitros: "cl",
  ml: "ml", mililitro: "ml", mililitros: "ml", cc: "ml",
  ul: "ul", µl: "ul", microlitro: "ul", microlitros: "ul",
  kg: "kg", kilo: "kg", kilos: "kg", kilogramo: "kg", kilogramos: "kg",
  g: "g", gr: "g", grs: "g", gramo: "g", gramos: "g",
  mg: "mg", miligramo: "mg", miligramos: "mg",
  ug: "ug", µg: "ug", microgramo: "ug", microgramos: "ug",
};

// Factor a la unidad base de su familia (L para volumen, g para masa).
const FACTORS: Record<string, { family: "VOLUME" | "MASS"; factor: number }> = {
  l: { family: "VOLUME", factor: 1 },
  dl: { family: "VOLUME", factor: 0.1 },
  cl: { family: "VOLUME", factor: 0.01 },
  ml: { family: "VOLUME", factor: 0.001 },
  ul: { family: "VOLUME", factor: 0.000001 },
  kg: { family: "MASS", factor: 1000 },
  g: { family: "MASS", factor: 1 },
  mg: { family: "MASS", factor: 0.001 },
  ug: { family: "MASS", factor: 0.000001 },
};

export function normalizeUnit(unit: unknown): string {
  const raw = String(unit ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.$/, "");
  return SYNONYMS[raw] ?? raw;
}

/**
 * Convierte una cantidad entre unidades. Devuelve null si las unidades no son
 * compatibles (familias distintas o unidades de conteo diferentes).
 */
export function convertQuantity(quantity: number, fromUnit: unknown, toUnit: unknown): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!Number.isFinite(quantity)) return null;
  if (from === to) return quantity;
  const fromFactor = FACTORS[from];
  const toFactor = FACTORS[to];
  if (!fromFactor || !toFactor || fromFactor.family !== toFactor.family) return null;
  const converted = (quantity * fromFactor.factor) / toFactor.factor;
  // NUMERIC(14,3) en la base: se redondea a 3 decimales para cuadrar saldos.
  return Math.round(converted * 1000) / 1000;
}

/** Unidades sugeridas en formularios (además de las ya usadas en el laboratorio). */
export const COMMON_UNITS = [
  "unidades", "mL", "L", "µL", "g", "kg", "mg", "µg",
  "gotas", "piezas", "cajas", "frascos", "tubos", "placas", "pares",
];
