// Representación en lenguaje claro de una frecuencia estructurada (valor + unidad)
// de un plan de equipo. Las unidades provienen del enum de equipment_plans:
// USE, DAY, WEEK, MONTH, YEAR. Extraído para poder probarlo sin la UI.

export type FrequencyUnit = "USE" | "DAY" | "WEEK" | "MONTH" | "YEAR";

export function frequencyLabel(value: unknown, unit: unknown): string {
  const n = Number(value);
  const u = String(unit ?? "");
  if (u === "USE") return "Cada uso";
  if (!u) return "—";
  const singular = n === 1 || !Number.isFinite(n);
  const map: Record<string, [string, string]> = {
    DAY: ["Diaria", `Cada ${n} días`],
    WEEK: ["Semanal", `Cada ${n} semanas`],
    MONTH: ["Mensual", `Cada ${n} meses`],
    YEAR: ["Anual", `Cada ${n} años`],
  };
  const pair = map[u];
  if (!pair) return "—";
  return singular ? pair[0] : pair[1];
}
