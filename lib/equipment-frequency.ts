// Representación en lenguaje claro de una frecuencia estructurada (valor + unidad)
// de un plan de equipo. Las unidades provienen del enum de equipment_plans:
// USE, DAY, WEEK, MONTH, YEAR. Extraído para poder probarlo sin la UI.

export type FrequencyUnit = "USE" | "DAY" | "WEEK" | "MONTH" | "YEAR";

// Días ISO: 1 = lunes … 7 = domingo.
export const WEEKDAY_OPTIONS: Array<{ value: number; label: string; short: string }> = [
  { value: 1, label: "Lunes", short: "Lun" },
  { value: 2, label: "Martes", short: "Mar" },
  { value: 3, label: "Miércoles", short: "Mié" },
  { value: 4, label: "Jueves", short: "Jue" },
  { value: 5, label: "Viernes", short: "Vie" },
  { value: 6, label: "Sábado", short: "Sáb" },
  { value: 7, label: "Domingo", short: "Dom" },
];

export const BUSINESS_DAYS = [1, 2, 3, 4, 5];

export function normalizeWeekDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const days = value
    .map((day) => Number(day))
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7);
  return [...new Set(days)].sort((a, b) => a - b);
}

export function weekDaysLabel(value: unknown): string {
  const days = normalizeWeekDays(value);
  if (days.length === 0) return "";
  if (days.length === 5 && BUSINESS_DAYS.every((day) => days.includes(day))) return "días hábiles";
  if (days.length === 7) return "todos los días";
  return days
    .map((day) => WEEKDAY_OPTIONS.find((option) => option.value === day)?.short ?? String(day))
    .join(", ");
}

export function frequencyLabel(value: unknown, unit: unknown, weekDays?: unknown): string {
  const n = Number(value);
  const u = String(unit ?? "");
  if (u === "USE") return "Cada uso";
  if (!u) return "—";
  const daysLabel = weekDaysLabel(weekDays);
  if (daysLabel && (u === "DAY" || u === "WEEK")) {
    return u === "DAY" ? `Diaria (${daysLabel})` : `Semanal (${daysLabel})`;
  }
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

/** Día ISO (1-7) de una fecha en UTC. */
function isoWeekDayUtc(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Próxima fecha (medianoche UTC) estrictamente posterior a `from` cuyo día de
 * la semana esté en la selección. Devuelve null si no hay días válidos.
 */
export function nextDueFromWeekDays(weekDays: unknown, from: Date = new Date()): Date | null {
  const days = normalizeWeekDays(weekDays);
  if (days.length === 0) return null;
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  for (let step = 1; step <= 7; step += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (days.includes(isoWeekDayUtc(cursor))) return new Date(cursor);
  }
  return null;
}

/** Avanza una fecha según la frecuencia del plan (para planes sin días fijos). */
export function advanceByFrequency(unit: unknown, value: unknown, from: Date = new Date()): Date | null {
  const u = String(unit ?? "");
  const n = Number(value) > 0 ? Number(value) : 1;
  const base = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  if (u === "DAY") { base.setUTCDate(base.getUTCDate() + n); return base; }
  if (u === "WEEK") { base.setUTCDate(base.getUTCDate() + n * 7); return base; }
  if (u === "MONTH") { base.setUTCMonth(base.getUTCMonth() + n); return base; }
  if (u === "YEAR") { base.setUTCFullYear(base.getUTCFullYear() + n); return base; }
  return null;
}
