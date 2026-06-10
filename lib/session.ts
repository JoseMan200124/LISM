import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "nexalab_session";

export type UserSession = {
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "LAB_ADMIN" | "SCIENTIST" | "TECHNICIAN" | "REVIEWER" | "VIEWER" | "HEAD_OF_LAB" | "ANALYST" | "ASSISTANT" | "AUDITOR" | "CONSULTATION" | "PROFESSOR" | "STUDENT";
  organizationId: string;
  laboratoryId: string;
  laboratoryName: string;
  sessionMode?: "demo" | "database";
};

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
