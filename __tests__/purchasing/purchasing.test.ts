import { describe, expect, it } from "vitest";
import { PURCHASE_PRIORITY_LABEL, PURCHASE_STATUS_LABEL, computeNextPurchaseCode } from "@/lib/purchasing";

describe("computeNextPurchaseCode", () => {
  it("empieza en 001 cuando no hay códigos del año", () => {
    expect(computeNextPurchaseCode([], 2026)).toBe("OC-2026-001");
  });

  it("continúa la secuencia del año en curso", () => {
    expect(computeNextPurchaseCode(["OC-2026-001", "OC-2026-002", "OC-2026-003"], 2026)).toBe("OC-2026-004");
  });

  it("ignora códigos de otros años", () => {
    expect(computeNextPurchaseCode(["OC-2025-050", "OC-2026-002"], 2026)).toBe("OC-2026-003");
  });

  it("ignora códigos con formato distinto", () => {
    expect(computeNextPurchaseCode(["OC-2026-ABC", "OC-2026-007", "PRA-2026-1"], 2026)).toBe("OC-2026-008");
  });

  it("rellena a 3 dígitos", () => {
    expect(computeNextPurchaseCode(["OC-2026-009"], 2026)).toBe("OC-2026-010");
  });
});

describe("etiquetas de compras", () => {
  it("traduce los estados a español", () => {
    expect(PURCHASE_STATUS_LABEL.PENDING).toBe("Por aprobar");
    expect(PURCHASE_STATUS_LABEL.RECEIVED).toBe("Recibida");
  });

  it("traduce las prioridades a español", () => {
    expect(PURCHASE_PRIORITY_LABEL.URGENT).toBe("Urgente");
    expect(PURCHASE_PRIORITY_LABEL.LOW).toBe("Baja");
  });
});
