import { describe, expect, it } from "vitest";
import { computeNextPracticeCode, isValidPracticeRange } from "@/lib/education-practice";

describe("computeNextPracticeCode", () => {
  it("empieza en 001 cuando no hay códigos del año", () => {
    expect(computeNextPracticeCode([], 2026)).toBe("PRA-2026-001");
  });

  it("continúa la secuencia del seed (PRA-2026-021..026 -> 027)", () => {
    const codes = ["PRA-2026-021", "PRA-2026-022", "PRA-2026-023", "PRA-2026-024", "PRA-2026-025", "PRA-2026-026"];
    expect(computeNextPracticeCode(codes, 2026)).toBe("PRA-2026-027");
  });

  it("ignora códigos de otros años", () => {
    expect(computeNextPracticeCode(["PRA-2025-099", "PRA-2026-003"], 2026)).toBe("PRA-2026-004");
  });

  it("ignora códigos con formato distinto", () => {
    expect(computeNextPracticeCode(["PRA-2026-ABC", "PRA-2026-007", "OTRO-1"], 2026)).toBe("PRA-2026-008");
  });

  it("rellena a 3 dígitos", () => {
    expect(computeNextPracticeCode(["PRA-2026-004"], 2026)).toBe("PRA-2026-005");
  });
});

describe("isValidPracticeRange", () => {
  const start = "2026-07-13T14:00:00.000Z";

  it("acepta rango sin fin", () => {
    expect(isValidPracticeRange(start, undefined)).toBe(true);
    expect(isValidPracticeRange(start, null)).toBe(true);
  });

  it("rechaza fin igual al inicio", () => {
    expect(isValidPracticeRange(start, start)).toBe(false);
  });

  it("rechaza fin anterior al inicio", () => {
    expect(isValidPracticeRange(start, "2026-07-13T13:00:00.000Z")).toBe(false);
  });

  it("acepta fin posterior al inicio", () => {
    expect(isValidPracticeRange(start, "2026-07-13T16:00:00.000Z")).toBe(true);
  });

  it("rechaza fechas inválidas", () => {
    expect(isValidPracticeRange(start, "no-es-fecha")).toBe(false);
  });
});
