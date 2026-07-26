import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { AsyncLocalStorage } from "node:async_hooks";

export const SESSION_COOKIE = "nexalab_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type UserSession = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "LAB_ADMIN" | "SCIENTIST" | "TECHNICIAN" | "REVIEWER" | "VIEWER" | "HEAD_OF_LAB" | "ANALYST" | "ASSISTANT" | "AUDITOR" | "CONSULTATION" | "PROFESSOR" | "STUDENT" | "GUEST";
  organizationId: string;
  laboratoryId: string;
  laboratoryName: string;
  profileCode: string;
  sessionMode?: "demo" | "database";
  // Permisos efectivos resueltos al iniciar sesión (matriz base del rol +
  // anulaciones del laboratorio). Ausente en sesiones anteriores: en ese caso
  // hasPermission usa la matriz base del rol.
  permissions?: string[];
  // Presente solo en las sesiones abiertas con un código de invitado. Los
  // permisos vienen del alcance del código y userId apunta a la sesión de
  // invitado, no a un usuario registrado.
  guest?: {
    grantId: string;
    sessionId: string;
    grantLabel: string;
    scopes: string[];
    expiresAt: string;
  };
};

// Las integraciones internas firmadas pueden reutilizar exactamente los mismos
// handlers HTTP que usa la aplicación web. AsyncLocalStorage mantiene la sesión
// sintetizada aislada a una sola petición asíncrona: nunca se comparte entre
// usuarios ni sustituye la autenticación normal basada en cookie.
const serviceSessionStorage = new AsyncLocalStorage<UserSession>();

export function withServiceSession<T>(session: UserSession, operation: () => T): T {
  return serviceSessionStorage.run(session, operation);
}

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET || "nexalab-demo-session-secret-change-before-production";
  return new TextEncoder().encode(value);
}

export async function createSessionToken(session: UserSession, ttlSeconds: number = SESSION_TTL_SECONDS): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(60, Math.floor(ttlSeconds))}s`)
    .sign(secret());
}

export async function verifySessionToken(token?: string): Promise<UserSession | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as UserSession;
  } catch {
    return null;
  }
}

/**
 * Token de sesión enviado por un cliente que no maneja cookies httpOnly (la
 * app móvil nativa). Es exactamente el mismo JWT que viaja en la cookie: no
 * introduce un segundo mecanismo de autenticación ni amplía privilegios.
 */
function bearerToken(authorization: string | null): string | undefined {
  if (!authorization) return undefined;
  const [scheme, ...rest] = authorization.split(" ");
  if (scheme.toLowerCase() !== "bearer") return undefined;
  const token = rest.join(" ").trim();
  return token || undefined;
}

export async function getSession(): Promise<UserSession | null> {
  const serviceSession = serviceSessionStorage.getStore();
  if (serviceSession) return serviceSession;

  const cookieStore = await cookies();
  const fromCookie = await verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  if (fromCookie) return fromCookie;

  const headerStore = await headers();
  return verifySessionToken(bearerToken(headerStore.get("authorization")));
}

export async function setSessionCookie(token: string, maxAgeSeconds: number = SESSION_TTL_SECONDS): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.max(60, Math.floor(maxAgeSeconds)),
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(0),
    path: "/",
  });
}
