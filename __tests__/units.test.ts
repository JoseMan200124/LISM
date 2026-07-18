import { describe, expect, it } from "vitest";
import { convertQuantity, normalizeUnit } from "@/lib/units";

describe("conversión de unidades de inventario", () => {
  it("normaliza sinónimos y acentos", () => {
    expect(normalizeUnit("mL")).toBe("ml");
    expect(normalizeUnit("Litros")).toBe("l");
    expect(normalizeUnit("µL")).toBe("ul");
    expect(normalizeUnit("Gramos")).toBe("g");
    expect(normalizeUnit("unidades")).toBe("unidades");
  });

  it("convierte dentro de la misma familia", () => {
    expect(convertQuantity(250, "mL", "L")).toBe(0.25);
    expect(convertQuantity(1.5, "L", "mL")).toBe(1500);
    expect(convertQuantity(500, "mg", "g")).toBe(0.5);
    expect(convertQuantity(2, "kg", "g")).toBe(2000);
  });

  it("mantiene la cantidad cuando la unidad es la misma", () => {
    expect(convertQuantity(7, "unidades", "Unidades")).toBe(7);
    expect(convertQuantity(3.25, "mL", "ml")).toBe(3.25);
  });

  it("rechaza unidades incompatibles", () => {
    expect(convertQuantity(10, "mL", "g")).toBeNull();
    expect(convertQuantity(10, "unidades", "cajas")).toBeNull();
    expect(convertQuantity(10, "mL", "unidades")).toBeNull();
  });

  it("redondea a 3 decimales para cuadrar con NUMERIC(14,3)", () => {
    expect(convertQuantity(1, "µL", "mL")).toBe(0.001);
    expect(convertQuantity(1, "µL", "L")).toBe(0);
  });
});
