import { describe, expect, it } from "vitest";
import {
  DEFAULT_GUEST_SCOPES,
  GUEST_SCOPES,
  checkGuestGrant,
  generateGuestCode,
  guestPermissions,
  guestSessionSeconds,
  normalizeGuestCode,
  normalizeGuestScopes,
} from "@/lib/guest-access";
import { permissionsByRole } from "@/lib/authorization";

describe("códigos de invitado", () => {
  it("genera códigos con el formato NXL-XXXX-XXXX y sin caracteres ambiguos", () => {
    for (let index = 0; index < 40; index += 1) {
      const code = generateGuestCode();
      expect(code).toMatch(/^NXL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
      // El prefijo es fijo; lo que se dicta en clase es el cuerpo y ahí no
      // puede haber caracteres que se confundan al copiarlos.
      expect(code.slice(4)).not.toMatch(/[01ILO]/);
    }
  });

  it("acepta el código dictado con o sin guiones y en minúsculas", () => {
    expect(normalizeGuestCode("nxl-ab23-cd45")).toBe("NXL-AB23-CD45");
    expect(normalizeGuestCode("  NXLAB23CD45 ")).toBe("NXL-AB23-CD45");
    expect(normalizeGuestCode("AB23CD45")).toBe("NXL-AB23-CD45");
  });

  it("rechaza códigos de longitud incorrecta", () => {
    expect(normalizeGuestCode("NXL-AB23")).toBe("");
    expect(normalizeGuestCode("")).toBe("");
    expect(normalizeGuestCode("NXL-AB23-CD45-EF67")).toBe("");
  });
});

describe("alcance del invitado", () => {
  it("descarta alcances inventados y conserva el orden oficial", () => {
    expect(normalizeGuestScopes(["equipment.view", "inventory.view", "borrar.todo"]))
      .toEqual(["inventory.view", "equipment.view"]);
  });

  it("registrar consumos implica poder ver el inventario", () => {
    expect(normalizeGuestScopes(["inventory.consume"])).toEqual(["inventory.view", "inventory.consume"]);
  });

  it("traduce el alcance a permisos reales de la aplicación", () => {
    expect(guestPermissions(["inventory.view"])).toEqual(["inventory.view"]);
    expect(guestPermissions(["inventory.consume"]).sort()).toEqual(["inventory.move", "inventory.view"]);
    expect(guestPermissions(["equipment.view"])).toEqual(["equipment.view"]);
  });

  it("nunca concede permisos de gestión ni de configuración", () => {
    const granted = guestPermissions([...GUEST_SCOPES]);
    expect(granted).not.toContain("inventory.manage");
    expect(granted).not.toContain("configuration.manage");
    expect(granted).not.toContain("guests.manage");
    expect(granted).not.toContain("audit.view");
  });

  it("el rol GUEST no tiene matriz base: todo viene del código", () => {
    expect(permissionsByRole.GUEST).toEqual([]);
  });

  it("el alcance por defecto es solo de consulta", () => {
    expect(DEFAULT_GUEST_SCOPES).toEqual(["inventory.view", "equipment.view"]);
    expect(guestPermissions(DEFAULT_GUEST_SCOPES)).not.toContain("inventory.move");
  });
});

describe("vigencia del código", () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();

  it("acepta un código activo y vigente", () => {
    expect(checkGuestGrant({ status: "ACTIVE", expires_at: future })).toEqual({ usable: true });
  });

  it("rechaza el código revocado, vencido o agotado", () => {
    expect(checkGuestGrant({ status: "REVOKED", expires_at: future }).usable).toBe(false);
    expect(checkGuestGrant({ status: "ACTIVE", expires_at: past }).usable).toBe(false);
    expect(checkGuestGrant({ status: "ACTIVE", expires_at: future, max_uses: 30, uses_count: 30 }).usable).toBe(false);
  });

  it("permite seguir usándolo mientras queden accesos disponibles", () => {
    expect(checkGuestGrant({ status: "ACTIVE", expires_at: future, max_uses: 30, uses_count: 29 }).usable).toBe(true);
  });

  it("rechaza una vigencia con fecha inválida", () => {
    expect(checkGuestGrant({ status: "ACTIVE", expires_at: "no es una fecha" }).usable).toBe(false);
  });

  it("la sesión nunca dura más que la vigencia del código", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    const inTwoHours = new Date("2026-07-26T14:00:00.000Z");
    expect(guestSessionSeconds(inTwoHours, 12 * 3600, now)).toBe(2 * 3600);
    const inTwoDays = new Date("2026-07-28T12:00:00.000Z");
    expect(guestSessionSeconds(inTwoDays, 12 * 3600, now)).toBe(12 * 3600);
  });
});
