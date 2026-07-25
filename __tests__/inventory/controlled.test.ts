import { describe, expect, it } from "vitest";
import {
  CONTROL_KIND_LABEL,
  DEFAULT_CONTROLLED_POLICY,
  MAX_VALIDITY_HOURS,
  authorizationExpiry,
  authorizationRequiredMessage,
  authorizationState,
  authorizedQuantity,
  checkAuthorizedQuantity,
  clampValidityHours,
  computeNextRequestCode,
  controlledLogErrorMessage,
  isAuthorizationExpired,
  isAuthorizationUsable,
  isControlKind,
  isStockReducingMovement,
  missingControlledFields,
  missingRequestFields,
  resolveControlledPolicy,
} from "@/lib/controlled-reagents";

describe("control de reactivos de doble uso o precursores", () => {
  it("reconoce los tipos de control válidos", () => {
    expect(isControlKind("DUAL_USE")).toBe(true);
    expect(isControlKind("PRECURSOR")).toBe(true);
    expect(isControlKind("BOTH")).toBe(true);
    expect(isControlKind("OTHER")).toBe(false);
    expect(isControlKind(null)).toBe(false);
    expect(CONTROL_KIND_LABEL.DUAL_USE).toBe("Doble uso");
    expect(CONTROL_KIND_LABEL.PRECURSOR).toBe("Precursor");
  });

  it("marca como descuento los movimientos que reducen existencia", () => {
    expect(isStockReducingMovement("CONSUMPTION")).toBe(true);
    expect(isStockReducingMovement("DISPOSAL")).toBe(true);
    expect(isStockReducingMovement("ADJUSTMENT", "OUT")).toBe(true);
  });

  it("no exige registro para movimientos que no descuentan", () => {
    expect(isStockReducingMovement("RECEIPT")).toBe(false);
    expect(isStockReducingMovement("TRANSFER")).toBe(false);
    expect(isStockReducingMovement("ADJUSTMENT", "IN")).toBe(false);
  });

  it("detecta los campos obligatorios faltantes del registro de consumo", () => {
    expect(missingControlledFields({})).toEqual(["usageArea", "usagePurpose", "usedByPerson"]);
    expect(missingControlledFields({ usageArea: "Lab A", usagePurpose: "Síntesis" })).toEqual(["usedByPerson"]);
    expect(missingControlledFields({ usageArea: " ", usagePurpose: "x", usedByPerson: "" })).toEqual([
      "usageArea",
      "usagePurpose",
      "usedByPerson",
    ]);
  });

  it("acepta un registro de consumo completo", () => {
    expect(
      missingControlledFields({
        usageArea: "Laboratorio de Química Orgánica",
        usagePurpose: "Síntesis de práctica 4",
        usedByPerson: "Ana Pérez",
      }),
    ).toEqual([]);
  });

  it("construye un mensaje humano indicando qué falta", () => {
    const message = controlledLogErrorMessage(["usageArea", "usedByPerson"]);
    expect(message).toContain("no puede descontarse del inventario");
    expect(message).toContain("Área, laboratorio o proyecto relacionado");
    expect(message).toContain("Usuario/persona que lo utilizó");
  });
});

describe("autorización digital de uso de reactivos controlados", () => {
  const APPROVED_AT = new Date("2026-07-20T10:00:00.000Z");

  it("genera folios correlativos por año e ignora otros formatos", () => {
    expect(computeNextRequestCode([], 2026)).toBe("AU-2026-001");
    expect(computeNextRequestCode(["AU-2026-001", "AU-2026-002"], 2026)).toBe("AU-2026-003");
    // Folios de otro año o con formato ajeno no afectan el correlativo.
    expect(computeNextRequestCode(["AU-2025-009", "OC-2026-004", "AU-2026-x"], 2026)).toBe("AU-2026-001");
    expect(computeNextRequestCode(["AU-2026-009"], 2026)).toBe("AU-2026-010");
  });

  it("resuelve la política del laboratorio con valores por defecto seguros", () => {
    expect(resolveControlledPolicy(null)).toEqual(DEFAULT_CONTROLLED_POLICY);
    expect(resolveControlledPolicy({})).toEqual(DEFAULT_CONTROLLED_POLICY);
    expect(resolveControlledPolicy("corrupto")).toEqual(DEFAULT_CONTROLLED_POLICY);
    expect(resolveControlledPolicy({ requirePreapproval: false })).toEqual({
      requirePreapproval: false,
      validityHours: DEFAULT_CONTROLLED_POLICY.validityHours,
    });
    expect(resolveControlledPolicy({ requirePreapproval: true, validityHours: 24 })).toEqual({
      requirePreapproval: true,
      validityHours: 24,
    });
  });

  it("exige autorización previa por defecto", () => {
    expect(DEFAULT_CONTROLLED_POLICY.requirePreapproval).toBe(true);
  });

  it("acota la vigencia a un rango razonable", () => {
    expect(clampValidityHours(0)).toBe(1);
    expect(clampValidityHours(-5)).toBe(1);
    expect(clampValidityHours(48)).toBe(48);
    expect(clampValidityHours(10_000)).toBe(MAX_VALIDITY_HOURS);
    expect(clampValidityHours(Number.NaN)).toBe(DEFAULT_CONTROLLED_POLICY.validityHours);
  });

  it("usa la cantidad aprobada cuando el responsable autorizó menos", () => {
    expect(authorizedQuantity({ quantity: 100, approved_quantity: 40 })).toBe(40);
    expect(authorizedQuantity({ quantity: 100, approved_quantity: null })).toBe(100);
    expect(authorizedQuantity({ quantity: "25.5", approved_quantity: undefined })).toBe(25.5);
  });

  it("calcula el vencimiento de la autorización", () => {
    expect(authorizationExpiry(APPROVED_AT, 72).toISOString()).toBe("2026-07-23T10:00:00.000Z");
    expect(isAuthorizationExpired("2026-07-23T10:00:00.000Z", new Date("2026-07-24T00:00:00.000Z"))).toBe(true);
    expect(isAuthorizationExpired("2026-07-23T10:00:00.000Z", new Date("2026-07-22T00:00:00.000Z"))).toBe(false);
    // Sin vigencia definida no vence.
    expect(isAuthorizationExpired(null)).toBe(false);
  });

  it("solo habilita el consumo con una autorización aprobada y vigente", () => {
    const base = { quantity: 10, approved_quantity: 10, expires_at: "2026-07-23T10:00:00.000Z", consumed_at: null };
    const now = new Date("2026-07-21T10:00:00.000Z");

    expect(authorizationState({ ...base, status: "APPROVED" }, now)).toBe("USABLE");
    expect(isAuthorizationUsable({ ...base, status: "APPROVED" }, now)).toBe(true);

    expect(authorizationState({ ...base, status: "PENDING" }, now)).toBe("PENDING");
    expect(authorizationState({ ...base, status: "REJECTED" }, now)).toBe("REJECTED");
    expect(authorizationState({ ...base, status: "CANCELLED" }, now)).toBe("CANCELLED");
    expect(authorizationState({ ...base, status: "CONSUMED" }, now)).toBe("CONSUMED");

    // Aprobada pero ya usada: no puede reutilizarse.
    expect(authorizationState({ ...base, status: "APPROVED", consumed_at: "2026-07-21T09:00:00.000Z" }, now)).toBe("CONSUMED");
    // Aprobada pero vencida: no habilita el descuento.
    expect(authorizationState({ ...base, status: "APPROVED" }, new Date("2026-07-25T00:00:00.000Z"))).toBe("EXPIRED");
    expect(isAuthorizationUsable({ ...base, status: "APPROVED" }, new Date("2026-07-25T00:00:00.000Z"))).toBe(false);
  });

  it("impide consumir más de lo autorizado", () => {
    const authorization = { status: "APPROVED", quantity: 100, approved_quantity: 40 };
    expect(checkAuthorizedQuantity(authorization, 40, "mL")).toBeNull();
    expect(checkAuthorizedQuantity(authorization, 20, "mL")).toBeNull();
    const error = checkAuthorizedQuantity(authorization, 41, "mL");
    expect(error).toContain("supera la autorizada");
    expect(error).toContain("40 mL");
  });

  it("tolera el redondeo de la conversión de unidades", () => {
    const authorization = { status: "APPROVED", quantity: 1, approved_quantity: null };
    expect(checkAuthorizedQuantity(authorization, 1 + 1e-9, "L")).toBeNull();
  });

  it("pide en la solicitud los mismos datos que exige el registro de consumo", () => {
    expect(missingRequestFields({})).toEqual(["usageArea", "usagePurpose", "usedByPerson"]);
    expect(
      missingRequestFields({ usedByPerson: "Ana Pérez", usageArea: "Laboratorio B", usagePurpose: "Práctica 4" }),
    ).toEqual([]);
  });

  it("explica el bloqueo cuando falta la autorización previa", () => {
    const message = authorizationRequiredMessage("Ácido sulfúrico");
    expect(message).toContain("Ácido sulfúrico");
    expect(message).toContain("autorización aprobada y vigente");
  });
});
