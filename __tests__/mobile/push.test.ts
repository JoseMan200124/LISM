import { describe, expect, it } from "vitest";
import { isExpoPushToken, isMissingPushMigration } from "@/lib/push";
import { effectivePermissions, permissionsByRole } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

/**
 * Notificaciones push de la app móvil. Lo relevante a nivel de reglas es que el
 * push nunca llegue a alguien que no podría ver esa información en la web: los
 * destinatarios se resuelven con la misma matriz de permisos, incluidas las
 * anulaciones que el administrador haya definido para el laboratorio.
 */

/** Réplica de la resolución que hace `rolesWithPermission` sin tocar la base de datos. */
function rolesFor(permission: string, overrides: Array<{ role: string; permission: string; allowed: boolean }> = []) {
  return (Object.keys(permissionsByRole) as Array<UserSession["role"]>).filter((role) =>
    effectivePermissions(
      role,
      overrides.filter((override) => override.role === role),
    ).includes(permission as never),
  );
}

describe("validación del token de Expo", () => {
  it("acepta los dos formatos que emite Expo", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(isExpoPushToken("ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
  });

  it("rechaza cualquier otra cosa", () => {
    expect(isExpoPushToken("no-es-un-token")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushToken("FCM:abc123")).toBe(false);
    expect(isExpoPushToken("")).toBe(false);
  });

  it("tolera espacios alrededor del token", () => {
    expect(isExpoPushToken("  ExponentPushToken[abc]  ")).toBe(true);
  });
});

describe("degradación sin la migración 0021", () => {
  it("reconoce el error de tabla inexistente para quedar inerte", () => {
    expect(isMissingPushMigration(new Error('relation "push_devices" does not exist'))).toBe(true);
    expect(isMissingPushMigration(new Error("error 42P01"))).toBe(true);
  });

  it("no confunde otros errores con la migración pendiente", () => {
    expect(isMissingPushMigration(new Error("connection timeout"))).toBe(false);
    expect(isMissingPushMigration(new Error("duplicate key value"))).toBe(false);
  });
});

describe("destinatarios de un push", () => {
  it("las autorizaciones de reactivos controlados van a quien puede autorizar", () => {
    // canAuthorizeControlled usa inventory.manage (lib/controlled-usage-service.ts).
    const roles = rolesFor("inventory.manage");
    expect(roles).toContain("OWNER");
    expect(roles).toContain("LAB_ADMIN");
    expect(roles).toContain("HEAD_OF_LAB");
    expect(roles).not.toContain("STUDENT");
    expect(roles).not.toContain("PROFESSOR");
    expect(roles).not.toContain("TECHNICIAN");
  });

  it("las alertas van a quien puede verlas", () => {
    const roles = rolesFor("alerts.view");
    expect(roles).toContain("LAB_ADMIN");
    expect(roles).toContain("PROFESSOR");
    expect(roles).not.toContain("STUDENT");
  });

  it("las incidencias van a quien puede gestionarlas", () => {
    const roles = rolesFor("incidents.manage");
    expect(roles).toContain("LAB_ADMIN");
    expect(roles).toContain("PROFESSOR");
    expect(roles).not.toContain("AUDITOR");
    expect(roles).not.toContain("STUDENT");
  });

  it("respeta que el administrador quite un permiso a un rol", () => {
    const roles = rolesFor("alerts.view", [{ role: "PROFESSOR", permission: "alerts.view", allowed: false }]);
    expect(roles).not.toContain("PROFESSOR");
    expect(roles).toContain("LAB_ADMIN");
  });

  it("respeta que el administrador conceda un permiso extra a un rol", () => {
    const roles = rolesFor("alerts.view", [{ role: "STUDENT", permission: "alerts.view", allowed: true }]);
    expect(roles).toContain("STUDENT");
  });

  it("ignora anulaciones sobre permisos que no existen", () => {
    const roles = rolesFor("alerts.view", [{ role: "STUDENT", permission: "permiso.inventado", allowed: true }]);
    expect(roles).not.toContain("STUDENT");
  });
});
