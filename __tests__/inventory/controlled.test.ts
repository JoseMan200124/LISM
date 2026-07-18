import { describe, expect, it } from "vitest";
import {
  CONTROL_KIND_LABEL,
  controlledLogErrorMessage,
  isControlKind,
  isStockReducingMovement,
  missingControlledFields,
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
