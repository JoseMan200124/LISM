import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateLinkCode,
  hashLinkCode,
  isDiloBridgeConfigured,
  normalizePhone,
  resolveLaboratory,
  verifyDiloSignature,
  type UserLaboratory,
} from "@/lib/dilo-bridge";

const SECRET = "un-secreto-de-pruebas-suficientemente-largo";

function sign(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

describe("verifyDiloSignature", () => {
  beforeEach(() => {
    process.env.DILO_NEXALAB_SERVICE_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.DILO_NEXALAB_SERVICE_SECRET;
  });

  it("acepta una firma correcta y reciente", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ action: "context", phone: "50242110769" });
    expect(
      verifyDiloSignature({ timestamp, rawBody, signatureHeader: sign(SECRET, timestamp, rawBody) }),
    ).toBe(true);
  });

  it("rechaza una firma con otro secreto", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = JSON.stringify({ action: "context" });
    expect(
      verifyDiloSignature({ timestamp, rawBody, signatureHeader: sign("otro-secreto-igual-de-largo!", timestamp, rawBody) }),
    ).toBe(false);
  });

  it("rechaza un timestamp fuera de la tolerancia (anti-replay)", () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 600);
    const rawBody = "{}";
    expect(
      verifyDiloSignature({ timestamp, rawBody, signatureHeader: sign(SECRET, timestamp, rawBody) }),
    ).toBe(false);
  });

  it("rechaza si el body firmado no coincide con el recibido", () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(
      verifyDiloSignature({ timestamp, rawBody: '{"action":"alerts.list"}', signatureHeader: sign(SECRET, timestamp, '{"action":"context"}') }),
    ).toBe(false);
  });

  it("queda apagado sin secreto configurado", () => {
    delete process.env.DILO_NEXALAB_SERVICE_SECRET;
    const timestamp = String(Math.floor(Date.now() / 1000));
    expect(isDiloBridgeConfigured()).toBe(false);
    expect(
      verifyDiloSignature({ timestamp, rawBody: "{}", signatureHeader: sign(SECRET, timestamp, "{}") }),
    ).toBe(false);
  });

  it("exige un secreto de al menos 16 caracteres", () => {
    process.env.DILO_NEXALAB_SERVICE_SECRET = "corto";
    expect(isDiloBridgeConfigured()).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("normaliza formatos distintos al mismo número", () => {
    expect(normalizePhone("+502 4211-0769")).toBe("50242110769");
    expect(normalizePhone("50242110769")).toBe("50242110769");
  });

  it("rechaza números demasiado cortos o vacíos", () => {
    expect(normalizePhone("1234567")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
});

describe("códigos de vinculación", () => {
  it("genera códigos de 8 caracteres sin ambiguos (0/O, 1/I)", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateLinkCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("hashea sin distinguir mayúsculas ni espacios alrededor", () => {
    expect(hashLinkCode("  abcd2345 ")).toBe(hashLinkCode("ABCD2345"));
    expect(hashLinkCode("ABCD2345")).not.toBe(hashLinkCode("ABCD2346"));
  });
});

describe("resolveLaboratory", () => {
  const labs: UserLaboratory[] = [
    { laboratoryId: "1", laboratoryName: "Laboratorio Química Central", organizationId: "o1", role: "ANALYST", profileCode: "PHARMA_QC" },
    { laboratoryId: "2", laboratoryName: "Laboratorio de Microbiología", organizationId: "o1", role: "STUDENT", profileCode: "EDUCATIONAL_SMALL_LAB" },
  ];

  it("sin nombre y con un solo laboratorio, lo usa directo", () => {
    const result = resolveLaboratory([labs[0]], null);
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.laboratory.laboratoryId).toBe("1");
  });

  it("sin nombre y con varios, pide elegir", () => {
    expect(resolveLaboratory(labs, null).status).toBe("none");
  });

  it("resuelve por coincidencia parcial ignorando acentos", () => {
    const result = resolveLaboratory(labs, "microbiologia");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.laboratory.laboratoryId).toBe("2");
  });

  it("jamás devuelve un laboratorio fuera de la lista del usuario", () => {
    expect(resolveLaboratory(labs, "Laboratorio Ajeno").status).toBe("none");
  });

  it("marca ambigüedad cuando varias sedes coinciden", () => {
    expect(resolveLaboratory(labs, "laboratorio").status).toBe("ambiguous");
  });
});
