// Formateo de fechas para la UI (es-GT).
//
// Las columnas DATE de PostgreSQL llegan del driver como "YYYY-MM-DD" (o como
// medianoche UTC "YYYY-MM-DDT00:00:00.000Z"). Si ese valor se interpreta en la
// zona horaria local (GMT-6) el día retrocede uno: un vencimiento del 17 se
// mostraba como 16 (retro del cliente). Para valores de solo-fecha el formateo
// se hace en UTC; los timestamps reales siguen mostrándose en hora local.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const UTC_MIDNIGHT = /^\d{4}-\d{2}-\d{2}T00:00:00(\.\d{1,3})?(Z|\+00(:?00)?)$/;

export function isDateOnlyValue(raw: string): boolean {
  return DATE_ONLY.test(raw) || UTC_MIDNIGHT.test(raw);
}

export function formatDate(value: unknown): string {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("es-GT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(isDateOnlyValue(raw) ? { timeZone: "UTC" } : {}),
  });
}

export function formatDateTime(value: unknown): string {
  if (!value) return "—";
  const raw = String(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  if (isDateOnlyValue(raw)) return formatDate(raw);
  return date.toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Valor "YYYY-MM-DD" para inputs type=date a partir de un valor de la BD. */
export function toDateInputValue(value: unknown): string {
  if (!value) return "";
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}
