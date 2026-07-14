// Lógica pura de prácticas educativas, extraída para poder probarla sin base de
// datos. La ruta app/api/education/practices consume estas funciones.

/**
 * Calcula el siguiente código de práctica correlativo (PRA-<año>-NNN) a partir
 * de los códigos ya existentes del laboratorio para ese año. Ignora cualquier
 * código que no siga el formato del año en curso.
 */
export function computeNextPracticeCode(existingCodes: readonly string[], year: number): string {
  const prefix = `PRA-${year}-`;
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

/**
 * Regla de negocio: si se indica fin, debe ser posterior al inicio.
 * Devuelve true cuando el rango es válido (sin fin, o fin > inicio).
 */
export function isValidPracticeRange(startsAt: string, endsAt?: string | null): boolean {
  if (!endsAt) return true;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return end > start;
}
