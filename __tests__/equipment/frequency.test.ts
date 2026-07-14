import { describe, expect, it } from "vitest";
import { frequencyLabel } from "@/lib/equipment-frequency";

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
