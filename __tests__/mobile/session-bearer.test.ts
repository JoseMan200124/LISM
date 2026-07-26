import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La app móvil no maneja la cookie httpOnly de la web: envía exactamente el
 * mismo JWT de sesión en `Authorization: Bearer`. Estas pruebas fijan ese
 * contrato — que el Bearer se acepte, que la cookie siga teniendo prioridad y
 * que un token inválido no abra sesión.
 */

const cookieStore = { value: undefined as string | undefined };
const headerStore = { authorization: null as string | null };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "nexalab_session" && cookieStore.value ? { value: cookieStore.value } : undefined),
    set: () => undefined,
  }),
  headers: async () => ({
    get: (name: string) => (name.toLowerCase() === "authorization" ? headerStore.authorization : null),
  }),
}));

import type { UserSession } from "@/lib/session";

// Importación dinámica: el módulo lee `next/headers`, que debe estar mockeado
// antes de que se evalúe.
const { createSessionToken, getSession, SESSION_TTL_SECONDS } = await import("@/lib/session");

function demoSession(overrides: Partial<UserSession> = {}): UserSession {
  return {
    userId: "00000000-0000-0000-0000-000000000101",
    name: "José Admin",
    email: "admin@nexalab.local",
    role: "LAB_ADMIN",
    organizationId: "00000000-0000-0000-0000-000000000001",
    laboratoryId: "00000000-0000-0000-0000-000000000011",
    laboratoryName: "Laboratorio Central",
    profileCode: "EDUCATIONAL_SMALL_LAB",
    sessionMode: "database",
    permissions: ["inventory.view", "inventory.manage"],
    ...overrides,
  };
}

beforeEach(() => {
  cookieStore.value = undefined;
  headerStore.authorization = null;
});

describe("sesión por cabecera Authorization (app móvil)", () => {
  it("acepta el token de sesión enviado como Bearer", async () => {
    const session = demoSession();
    headerStore.authorization = `Bearer ${await createSessionToken(session)}`;

    const resolved = await getSession();
    expect(resolved).toMatchObject({
      userId: session.userId,
      role: "LAB_ADMIN",
      laboratoryId: session.laboratoryId,
      permissions: ["inventory.view", "inventory.manage"],
    });
  });

  it("es indiferente a las mayúsculas del esquema", async () => {
    headerStore.authorization = `bearer ${await createSessionToken(demoSession())}`;
    expect(await getSession()).not.toBeNull();
  });

  it("la cookie tiene prioridad sobre la cabecera", async () => {
    // Un navegador con sesión abierta no debe verse afectado por una cabecera
    // Authorization inyectada en la petición.
    cookieStore.value = await createSessionToken(demoSession({ userId: "usuario-de-la-cookie" }));
    headerStore.authorization = `Bearer ${await createSessionToken(demoSession({ userId: "usuario-del-bearer" }))}`;

    const resolved = await getSession();
    expect(resolved?.userId).toBe("usuario-de-la-cookie");
  });

  it("usa el Bearer cuando la cookie existe pero no es válida", async () => {
    cookieStore.value = "cookie.corrupta.inservible";
    headerStore.authorization = `Bearer ${await createSessionToken(demoSession({ userId: "usuario-del-bearer" }))}`;

    const resolved = await getSession();
    expect(resolved?.userId).toBe("usuario-del-bearer");
  });

  it("rechaza un token que no está firmado con el secreto del servidor", async () => {
    headerStore.authorization =
      "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJmYWxzbyIsInJvbGUiOiJPV05FUiJ9.firmafalsa";
    expect(await getSession()).toBeNull();
  });

  it("rechaza esquemas de autorización distintos de Bearer", async () => {
    headerStore.authorization = `Basic ${await createSessionToken(demoSession())}`;
    expect(await getSession()).toBeNull();
  });

  it("rechaza un Bearer vacío", async () => {
    headerStore.authorization = "Bearer   ";
    expect(await getSession()).toBeNull();
  });

  it("sin cookie ni cabecera no hay sesión", async () => {
    expect(await getSession()).toBeNull();
  });

  it("el token caduca a las 12 horas, igual que la cookie de la web", () => {
    expect(SESSION_TTL_SECONDS).toBe(60 * 60 * 12);
  });
});
