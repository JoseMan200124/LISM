import { describe, expect, it } from "vitest";
import {
  advanceByFrequency,
  frequencyLabel,
  nextDueFromWeekDays,
  normalizeWeekDays,
  weekDaysLabel,
} from "@/lib/equipment-frequency";

describe("frequencyLabel", () => {
  it("por uso no depende de valor", () => {
    expect(frequencyLabel(undefined, "USE")).toBe("Cada uso");
    expect(frequencyLabel(5, "USE")).toBe("Cada uso");
  });

  it("singular por unidad", () => {
    expect(frequencyLabel(1, "DAY")).toBe("Diaria");
    expect(frequencyLabel(1, "WEEK")).toBe("Semanal");
    expect(frequencyLabel(1, "MONTH")).toBe("Mensual");
    expect(frequencyLabel(1, "YEAR")).toBe("Anual");
  });

  it("plural con intervalo N", () => {
    expect(frequencyLabel(3, "DAY")).toBe("Cada 3 días");
    expect(frequencyLabel(2, "WEEK")).toBe("Cada 2 semanas");
    expect(frequencyLabel(6, "MONTH")).toBe("Cada 6 meses");
    expect(frequencyLabel(2, "YEAR")).toBe("Cada 2 años");
  });

  it("unidad desconocida o vacía", () => {
    expect(frequencyLabel(1, "")).toBe("—");
    expect(frequencyLabel(1, "HOUR")).toBe("—");
  });
});

describe("planes por días de la semana", () => {
  it("normaliza y ordena los días", () => {
    expect(normalizeWeekDays([5, 1, 1, "3", 9, 0])).toEqual([1, 3, 5]);
    expect(normalizeWeekDays(null)).toEqual([]);
  });

  it("etiqueta días hábiles y selecciones sueltas", () => {
    expect(weekDaysLabel([1, 2, 3, 4, 5])).toBe("días hábiles");
    expect(weekDaysLabel([1, 3])).toBe("Lun, Mié");
    expect(weekDaysLabel([1, 2, 3, 4, 5, 6, 7])).toBe("todos los días");
  });

  it("describe la frecuencia con días seleccionados", () => {
    expect(frequencyLabel(1, "DAY", [1, 2, 3, 4, 5])).toBe("Diaria (días hábiles)");
    expect(frequencyLabel(1, "WEEK", [2])).toBe("Semanal (Mar)");
  });

  it("calcula la próxima fecha según los días elegidos", () => {
    // 2026-07-17 es viernes: el próximo día hábil es el lunes 20.
    const friday = new Date(Date.UTC(2026, 6, 17));
    expect(nextDueFromWeekDays([1, 2, 3, 4, 5], friday)?.toISOString().slice(0, 10)).toBe("2026-07-20");
    expect(nextDueFromWeekDays([6], friday)?.toISOString().slice(0, 10)).toBe("2026-07-18");
    // Mismo día de la semana: salta a la próxima semana (estrictamente posterior).
    expect(nextDueFromWeekDays([5], friday)?.toISOString().slice(0, 10)).toBe("2026-07-24");
    expect(nextDueFromWeekDays([], friday)).toBeNull();
  });

  it("avanza por frecuencia simple para planes sin días fijos", () => {
    const base = new Date(Date.UTC(2026, 6, 17));
    expect(advanceByFrequency("WEEK", 2, base)?.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(advanceByFrequency("MONTH", 1, base)?.toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(advanceByFrequency("USE", 1, base)).toBeNull();
  });
});
