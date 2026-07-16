import { describe, expect, it } from "vitest";
import { EDUCATIONAL_ALERT_SOURCES, EDUCATIONAL_RULE_TEMPLATES, isEducationalAlertSource } from "@/lib/alert-rules";
import { sourceRecordHref } from "@/lib/deep-links";
import { resolveTheme, isThemePreference } from "@/lib/theme";
import { tutorialsByModule } from "@/lib/tutorial-steps";

describe("tema persistible", () => {
  it("resuelve la preferencia del sistema", () => { expect(resolveTheme("system", true)).toBe("dark"); expect(resolveTheme("system", false)).toBe("light"); expect(resolveTheme("light", true)).toBe("light"); });
  it("valida el catálogo", () => { expect(isThemePreference("dark")).toBe(true); expect(isThemePreference("sepia")).toBe(false); });
});

describe("reglas educativas", () => {
  it("excluye fuentes farmacéuticas", () => { expect(EDUCATIONAL_ALERT_SOURCES).toContain("INCIDENT"); for (const source of ["RESULT", "SPECIMEN", "ORDER", "OOS", "OOT"]) expect(isEducationalAlertSource(source)).toBe(false); });
  it("incluye ocho plantillas personalizables", () => { expect(EDUCATIONAL_RULE_TEMPLATES).toHaveLength(8); expect(EDUCATIONAL_RULE_TEMPLATES.map((item) => item.sourceType)).toContain("RESOURCE_RESERVATION"); });
});

describe("deep links exactos", () => {
  it.each([["INVENTORY_ITEM", "/app/inventory?itemId=id"], ["EQUIPMENT", "/app/equipment?equipmentId=id"], ["EDUCATIONAL_PRACTICE", "/app/education?tab=schedule&practiceId=id"], ["RESOURCE_RESERVATION", "/app/education?tab=reservations&reservationId=id"], ["INCIDENT", "/app/incidents?incidentId=id"], ["EQUIPMENT_PLAN", "/app/equipment?tab=plans&planId=id"]])("mapea %s", (source, expected) => expect(sourceRecordHref(source, "id")).toBe(expected));
});

describe("tutorial sin saltos", () => {
  it("mantiene ids únicos y explica el ciclo de reglas", () => { const steps = tutorialsByModule.alerts?.steps ?? []; expect(new Set(steps.map((step) => step.id)).size).toBe(steps.length); expect(steps.map((step) => step.id)).toEqual(expect.arrayContaining(["rule-origin", "rule-severity", "rule-channel", "rule-active"])); });
  it("abre la pestaña antes de localizar el objetivo", () => { const step = tutorialsByModule.alerts?.steps.find((item) => item.id === "rule-origin"); expect(step?.preAction?.click).toContain("nth-child(2)"); });
});
