import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { AsyncLocalStorage } from "node:async_hooks";

export const SESSION_COOKIE = "nexalab_session";

export type UserSession = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "LAB_ADMIN" | "SCIENTIST" | "TECHNICIAN" | "REVIEWER" | "VIEWER" | "HEAD_OF_LAB" | "ANALYST" | "ASSISTANT" | "AUDITOR" | "CONSULTATION" | "PROFESSOR" | "STUDENT";
  organizationId: string;
  laboratoryId: string;
  laboratoryName: string;
  profileCode: string;
  sessionMode?: "demo" | "database";
  // Permisos efectivos resueltos al iniciar sesión (matriz base del rol +
  // anulaciones del laboratorio). Ausente en sesiones anteriores: en ese caso
  // hasPermission usa la matriz base del rol.
  permissions?: string[];
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

export async function createSessionToken(session: UserSession): Promise<string> {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
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

export async function getSession(): Promise<UserSession | null> {
  const serviceSession = serviceSessionStorage.getStore();
  if (serviceSession) return serviceSession;
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12,
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
