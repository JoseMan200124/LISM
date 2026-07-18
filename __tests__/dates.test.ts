import { describe, expect, it } from "vitest";
import { formatDate, isDateOnlyValue, toDateInputValue } from "@/lib/dates";

describe("fechas de solo-día (bug del día anterior)", () => {
  it("detecta valores de solo-fecha", () => {
    expect(isDateOnlyValue("2026-07-17")).toBe(true);
    expect(isDateOnlyValue("2026-07-17T00:00:00.000Z")).toBe(true);
    expect(isDateOnlyValue("2026-07-17T00:00:00+00:00")).toBe(true);
    expect(isDateOnlyValue("2026-07-17T14:22:03.000Z")).toBe(false);
  });

  it("formatea una fecha DATE sin retroceder un día en zonas GMT-6", () => {
    // Independiente de la zona del runner: el día formateado debe ser el 17.
    expect(formatDate("2026-07-17")).toMatch(/17/);
    expect(formatDate("2026-07-17T00:00:00.000Z")).toMatch(/17/);
  });

  it("mantiene vacío o crudo ante valores inválidos", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("no-es-fecha")).toBe("no-es-fecha");
  });

  it("convierte valores de BD a input type=date", () => {
    expect(toDateInputValue("2026-07-17")).toBe("2026-07-17");
    expect(toDateInputValue("2026-07-17T00:00:00.000Z")).toBe("2026-07-17");
    expect(toDateInputValue(null)).toBe("");
  });
});
