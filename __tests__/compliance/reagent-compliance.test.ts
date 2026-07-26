import { describe, expect, it } from "vitest";
import {
  DISPOSAL_METHOD_LABEL,
  DISPOSAL_REASON_LABEL,
  EXPIRY_WARNING_DAYS,
  PERMIT_WARNING_DAYS,
  REAGENT_CATEGORY_LABEL,
  countDifference,
  expiryState,
  isRegulated,
  missingReceiptFields,
  permitCovers,
  permitState,
  requiresJustification,
} from "@/lib/compliance-reagents";
import { canAccessModule } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-07-26T12:00:00.000Z");

describe("clasificación de reactivos", () => {
  it("las tres categorías reguladas arrastran obligaciones", () => {
    expect(isRegulated("CONTROLLED")).toBe(true);
    expect(isRegulated("DUAL_USE")).toBe(true);
    expect(isRegulated("PRECURSOR")).toBe(true);
    expect(isRegulated("UNCONTROLLED")).toBe(false);
    expect(isRegulated(null)).toBe(false);
  });

  it("cada categoría y motivo tiene etiqueta en español", () => {
    expect(REAGENT_CATEGORY_LABEL.DUAL_USE).toBe("Doble uso");
    expect(DISPOSAL_REASON_LABEL.EXPIRED).toBe("Vencido");
    expect(DISPOSAL_METHOD_LABEL.AUTHORIZED_MANAGER).toBe("Gestor autorizado de residuos");
  });
});

describe("vigencia de licencias y permisos", () => {
  it("distingue vigente, por vencer y vencido", () => {
    expect(permitState({ status: "ACTIVE", expires_on: new Date(now.getTime() + 200 * DAY) }, now)).toBe("ACTIVE");
    expect(permitState({ status: "ACTIVE", expires_on: new Date(now.getTime() + 10 * DAY) }, now)).toBe("EXPIRING");
    expect(permitState({ status: "ACTIVE", expires_on: new Date(now.getTime() - DAY) }, now)).toBe("EXPIRED");
  });

  it("avisa con la antelación definida", () => {
    const justInside = new Date(now.getTime() + (PERMIT_WARNING_DAYS - 1) * DAY);
    const justOutside = new Date(now.getTime() + (PERMIT_WARNING_DAYS + 1) * DAY);
    expect(permitState({ status: "ACTIVE", expires_on: justInside }, now)).toBe("EXPIRING");
    expect(permitState({ status: "ACTIVE", expires_on: justOutside }, now)).toBe("ACTIVE");
  });

  it("suspender o revocar manda sobre la fecha", () => {
    const future = new Date(now.getTime() + 200 * DAY);
    expect(permitState({ status: "SUSPENDED", expires_on: future }, now)).toBe("SUSPENDED");
    expect(permitState({ status: "REVOKED", expires_on: future }, now)).toBe("REVOKED");
  });

  it("solo un permiso utilizable ampara una entrada", () => {
    expect(permitCovers({ status: "ACTIVE", expires_on: new Date(now.getTime() + 10 * DAY) }, now)).toBe(true);
    expect(permitCovers({ status: "ACTIVE", expires_on: null }, now)).toBe(true);
    expect(permitCovers({ status: "ACTIVE", expires_on: new Date(now.getTime() - DAY) }, now)).toBe(false);
    expect(permitCovers({ status: "SUSPENDED", expires_on: new Date(now.getTime() + 100 * DAY) }, now)).toBe(false);
  });
});

describe("recepción de entradas", () => {
  const base = { vendor: "Merck", invoiceNumber: "A-123", receivedQuantity: 2, receivedOn: "2026-07-26" };

  it("un reactivo no controlado solo exige los datos básicos", () => {
    expect(missingReceiptFields(base, false)).toEqual([]);
  });

  it("un controlado exige además licencia, permiso y responsable", () => {
    const missing = missingReceiptFields(base, true);
    expect(missing).toEqual(["Número de licencia", "Número de permiso", "Responsable que recibió"]);
  });

  it("detecta los campos básicos vacíos o en blanco", () => {
    const missing = missingReceiptFields({ ...base, vendor: "   ", invoiceNumber: "" }, false);
    expect(missing).toEqual(["Proveedor", "Número de factura"]);
  });

  it("con todo completo, un controlado pasa la validación", () => {
    const complete = { ...base, licenseNumber: "LIC-1", permitNumber: "PER-2", receivedByName: "Ana" };
    expect(missingReceiptFields(complete, true)).toEqual([]);
  });
});

describe("inventario físico", () => {
  it("calcula la diferencia entre lo contado y el sistema", () => {
    expect(countDifference(10, 8)).toBe(-2);
    expect(countDifference(10, 12.5)).toBe(2.5);
    expect(countDifference(10, 10)).toBe(0);
    expect(countDifference(10, null)).toBeNull();
  });

  it("cualquier diferencia exige justificación", () => {
    expect(requiresJustification(-2)).toBe(true);
    expect(requiresJustification(0.5)).toBe(true);
    expect(requiresJustification(0)).toBe(false);
    expect(requiresJustification(null)).toBe(false);
  });
});

describe("vencimiento de reactivos", () => {
  it("clasifica el estado por la fecha", () => {
    expect(expiryState(new Date(now.getTime() + 200 * DAY), now)).toBe("OK");
    expect(expiryState(new Date(now.getTime() + (EXPIRY_WARNING_DAYS - 5) * DAY), now)).toBe("EXPIRING");
    expect(expiryState(new Date(now.getTime() - DAY), now)).toBe("EXPIRED");
    expect(expiryState(null, now)).toBe("NO_EXPIRY");
    expect(expiryState("no es fecha", now)).toBe("NO_EXPIRY");
  });
});

describe("mensajería interna", () => {
  function session(overrides: Partial<UserSession> = {}): UserSession {
    return {
      userId: "u1", name: "Ana", email: "ana@x.com", role: "TECHNICIAN",
      organizationId: "o1", laboratoryId: "l1", laboratoryName: "Química",
      profileCode: "EDUCATIONAL_SMALL_LAB", ...overrides,
    };
  }

  it("está abierta a cualquier usuario con cuenta, sin permiso especial", () => {
    expect(canAccessModule(session(), "messages")).toBe(true);
    expect(canAccessModule(session({ role: "STUDENT" }), "messages")).toBe(true);
    expect(canAccessModule(session({ role: "VIEWER" }), "messages")).toBe(true);
  });

  it("un invitado no tiene mensajería", () => {
    const guest = session({
      role: "GUEST",
      permissions: ["inventory.view"],
      guest: { grantId: "g", sessionId: "s", grantLabel: "Química I", scopes: ["inventory.view"], expiresAt: new Date().toISOString() },
    });
    expect(canAccessModule(guest, "messages")).toBe(false);
  });
});
