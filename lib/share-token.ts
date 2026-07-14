import { SignJWT, jwtVerify } from "jose";

// Enlace seguro para compartir una práctica con estudiantes SIN cuenta: un token
// firmado (stateless, sin tabla nueva) que codifica la práctica y su laboratorio,
// con vencimiento. La vista pública /p/[token] solo muestra campos no sensibles.

export type PracticeSharePayload = {
  kind: "practice-share";
  practiceId: string;
  laboratoryId: string;
};

function secret(): Uint8Array {
  // Secreto dedicado si existe; si no, cae al de sesión (mismo patrón que lib/session.ts).
  const value = process.env.SHARE_LINK_SECRET || process.env.SESSION_SECRET || "nexalab-demo-session-secret-change-before-production";
  return new TextEncoder().encode(value);
}

export async function createPracticeShareToken(practiceId: string, laboratoryId: string, expiresIn = "30d"): Promise<string> {
  return new SignJWT({ kind: "practice-share", practiceId, laboratoryId } satisfies PracticeSharePayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifyPracticeShareToken(token: string): Promise<PracticeSharePayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.kind !== "practice-share" || typeof payload.practiceId !== "string" || typeof payload.laboratoryId !== "string") return null;
    return { kind: "practice-share", practiceId: payload.practiceId, laboratoryId: payload.laboratoryId };
  } catch {
    return null;
  }
}
