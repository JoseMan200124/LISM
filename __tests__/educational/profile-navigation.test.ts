import { describe, expect, it } from "vitest";
import { canAccessModule, hasPermission } from "@/lib/authorization";
import { getEducationalModules, isEducationalProfile, resolveLabProfile } from "@/lib/lab-profile";
import { educationalNavigationByRole } from "@/lib/navigation";
import type { UserSession } from "@/lib/session";

const session = (role: UserSession["role"]): UserSession => ({ userId: "u", name: "Usuario", email: "u@example.test", role, organizationId: "o", laboratoryId: "l", laboratoryName: "Lab", profileCode: "EDUCATIONAL_SMALL_LAB" });

describe("perfil educativo y navegación por rol", () => {
  it("resuelve el perfil persistido y el fallback demo", () => { expect(resolveLabProfile("EDUCATIONAL_SMALL_LAB")).toBe("EDUCATIONAL_SMALL_LAB"); expect(resolveLabProfile(null)).toBe("EDUCATIONAL_SMALL_LAB"); expect(isEducationalProfile("CLINICAL")).toBe(false); });
  it("restringe módulos y mutaciones del estudiante", () => { expect([...getEducationalModules("STUDENT")]).toEqual(["dashboard", "education"]); expect(canAccessModule(session("STUDENT"), "alerts")).toBe(false); expect(hasPermission(session("STUDENT"), "inventory.manage")).toBe(false); });
  it("envía Avisos al Programa, no a Alertas", () => { const links = educationalNavigationByRole.STUDENT?.flatMap((group) => group.items) ?? []; expect(links.find((item) => item.label === "Avisos")?.href).toBe("/app/education?tab=notices"); expect(links.some((item) => item.href === "/app/alerts")).toBe(false); });
  it("profesor ve alertas relacionadas pero no administra reglas", () => { expect(hasPermission(session("PROFESSOR"), "alerts.view")).toBe(true); expect(hasPermission(session("PROFESSOR"), "alerts.manage")).toBe(false); });
});
