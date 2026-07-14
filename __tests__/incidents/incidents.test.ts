import { describe, expect, it } from "vitest";
import { computeNextIncidentCode, isMissingRelationError } from "@/lib/incidents";

describe("computeNextIncidentCode", () => {
  it("empieza en 001", () => {
    expect(computeNextIncidentCode([], 2026)).toBe("INC-2026-001");
  });
  it("continúa la secuencia del año", () => {
    expect(computeNextIncidentCode(["INC-2026-001", "INC-2026-002"], 2026)).toBe("INC-2026-003");
  });
  it("ignora otros años y formatos", () => {
    expect(computeNextIncidentCode(["INC-2025-050", "INC-2026-004", "X"], 2026)).toBe("INC-2026-005");
  });
});

describe("isMissingRelationError", () => {
  it("detecta relación inexistente", () => {
    expect(isMissingRelationError(new Error('relation "incidents" does not exist'))).toBe(true);
  });
  it("no marca otros errores", () => {
    expect(isMissingRelationError(new Error("timeout"))).toBe(false);
    expect(isMissingRelationError("nope")).toBe(false);
  });
});
