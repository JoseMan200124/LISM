import { describe, expect, it } from "vitest";
import {
  CODE_PREFIX,
  SAMPLE_TYPES,
  computeNextCode,
  expiryFromShelfLife,
  requiresChangeReason,
  sampleSourceFields,
  sampleTypeFields,
} from "@/lib/research";
import { computeContentHash, resolveSignaturePolicy, DEFAULT_SIGNATURE_POLICY } from "@/lib/signatures";
import { isResearchModule, isResearchProfile, researchProfileModules, resolveLabProfile } from "@/lib/lab-profile";
import { canAccessModule } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

describe("códigos correlativos de investigación", () => {
  it("arranca en 001 cuando no hay códigos del año", () => {
    expect(computeNextCode([], CODE_PREFIX.project, 2026)).toBe("PRY-2026-001");
  });

  it("continúa desde el mayor del año en curso", () => {
    expect(computeNextCode(["PRY-2026-001", "PRY-2026-007", "PRY-2026-003"], "PRY", 2026)).toBe("PRY-2026-008");
  });

  it("ignora códigos de otros años y con formato ajeno", () => {
    expect(computeNextCode(["PRY-2025-090", "PRY-2026-ABC", "OTRO-2026-004"], "PRY", 2026)).toBe("PRY-2026-001");
  });

  it("respeta el relleno pedido para muestras y biobanco", () => {
    expect(computeNextCode(["MU-2026-0009"], CODE_PREFIX.sample, 2026, 4)).toBe("MU-2026-0010");
  });
});

describe("formulario dinámico de muestras", () => {
  it("cada tipo de muestra tiene sus propios campos", () => {
    for (const type of SAMPLE_TYPES) {
      expect(sampleTypeFields(type).length).toBeGreaterThan(0);
    }
  });

  it("solo pide datos de donante donde tiene sentido", () => {
    expect(sampleSourceFields("BIOLOGICAL").length).toBeGreaterThan(0);
    expect(sampleSourceFields("ENVIRONMENTAL")).toEqual([]);
    expect(sampleSourceFields("BIOTECHNOLOGICAL")).toEqual([]);
  });

  it("un tipo desconocido no rompe el formulario", () => {
    expect(sampleTypeFields("LO_QUE_SEA")).toEqual([]);
    expect(sampleSourceFields("LO_QUE_SEA")).toEqual([]);
  });
});

describe("biobanco", () => {
  it("calcula la expiración a partir de la vida útil", () => {
    expect(expiryFromShelfLife("2026-01-31", 12)).toBe("2027-01-31");
    expect(expiryFromShelfLife("2026-07-26", 6)).toBe("2027-01-26");
  });

  it("sin fecha de ingreso o sin vida útil no inventa una expiración", () => {
    expect(expiryFromShelfLife(null, 12)).toBeNull();
    expect(expiryFromShelfLife("2026-01-31", null)).toBeNull();
    expect(expiryFromShelfLife("2026-01-31", 0)).toBeNull();
  });
});

describe("cuaderno electrónico", () => {
  it("una entrada firmada exige motivo para modificarse", () => {
    expect(requiresChangeReason("SIGNED")).toBe(true);
    expect(requiresChangeReason("WITNESSED")).toBe(true);
    expect(requiresChangeReason("DRAFT")).toBe(false);
    expect(requiresChangeReason("COMPLETED")).toBe(false);
  });
});

describe("firma electrónica", () => {
  it("la huella no depende del orden de las claves", async () => {
    const a = await computeContentHash({ codigo: "OC-2026-001", total: 1200, items: [{ q: 1, d: "x" }] });
    const b = await computeContentHash({ items: [{ d: "x", q: 1 }], total: 1200, codigo: "OC-2026-001" });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("un contenido distinto produce una huella distinta", async () => {
    const a = await computeContentHash({ total: 1200 });
    const b = await computeContentHash({ total: 1201 });
    expect(a).not.toBe(b);
  });

  it("por omisión se exige firma en los cuatro actos", () => {
    expect(resolveSignaturePolicy(null)).toEqual(DEFAULT_SIGNATURE_POLICY);
    expect(resolveSignaturePolicy({ purchaseRequest: false })).toEqual({ ...DEFAULT_SIGNATURE_POLICY, purchaseRequest: false });
  });

  it("ignora valores que no sean booleanos", () => {
    expect(resolveSignaturePolicy({ purchaseApproval: "no" })).toEqual(DEFAULT_SIGNATURE_POLICY);
  });
});

describe("perfil de laboratorio de investigación", () => {
  it("reconoce el perfil y sus módulos", () => {
    expect(resolveLabProfile("RESEARCH_LAB")).toBe("RESEARCH_LAB");
    expect(isResearchProfile("RESEARCH_LAB")).toBe(true);
    expect(isResearchProfile("EDUCATIONAL_SMALL_LAB")).toBe(false);
    expect(isResearchProfile(null)).toBe(false);
  });

  it("los módulos nuevos son exclusivos del perfil de investigación", () => {
    for (const moduleKey of ["projects", "protocols", "samples", "biobank", "notebook", "library"] as const) {
      expect(isResearchModule(moduleKey)).toBe(true);
      expect(researchProfileModules.has(moduleKey)).toBe(true);
    }
    expect(isResearchModule("inventory")).toBe(false);
  });

  it("el perfil de investigación conserva los módulos de recursos", () => {
    for (const moduleKey of ["inventory", "controlled", "equipment", "purchasing", "configuration"] as const) {
      expect(researchProfileModules.has(moduleKey)).toBe(true);
    }
  });

  it("un invitado no alcanza los módulos de investigación", () => {
    const guest: UserSession = {
      userId: "s1", name: "Ana", email: "", role: "GUEST",
      organizationId: "o", laboratoryId: "l", laboratoryName: "Lab", profileCode: "RESEARCH_LAB",
      permissions: ["inventory.view", "equipment.view"],
      guest: { grantId: "g", sessionId: "s1", grantLabel: "Química I", scopes: ["inventory.view"], expiresAt: new Date().toISOString() },
    };
    expect(canAccessModule(guest, "projects")).toBe(false);
    expect(canAccessModule(guest, "notebook")).toBe(false);
    expect(canAccessModule(guest, "inventory")).toBe(true);
    expect(canAccessModule(guest, "administration")).toBe(false);
  });

  it("un científico sí ve los módulos de investigación", () => {
    const scientist: UserSession = {
      userId: "u1", name: "Luis", email: "l@x.com", role: "SCIENTIST",
      organizationId: "o", laboratoryId: "l", laboratoryName: "Lab", profileCode: "RESEARCH_LAB",
    };
    expect(canAccessModule(scientist, "projects")).toBe(true);
    expect(canAccessModule(scientist, "biobank")).toBe(true);
    expect(canAccessModule(scientist, "configuration")).toBe(false);
  });
});
