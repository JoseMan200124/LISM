import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { createSessionToken, getSession, setSessionCookie, SESSION_TTL_SECONDS } from "@/lib/session";
import { DEMO_LAB_PROFILE, RESEARCH_LAB_PROFILE } from "@/lib/lab-profile";
import { DEFAULT_SIGNATURE_POLICY, resolveSignaturePolicy, SIGNATURE_POLICY_KEYS } from "@/lib/signatures";

// Perfil del laboratorio y política de firma. Cambiar el perfil no borra nada:
// solo decide qué módulos se muestran. Los módulos de investigación
// (proyectos, protocolos, muestras, biobancos, cuaderno y gestión documental)
// permanecen ocultos hasta que se elige el perfil de investigación.

const SELECTABLE_PROFILES = [DEMO_LAB_PROFILE, RESEARCH_LAB_PROFILE] as const;

const schema = z.object({
  profileCode: z.enum(SELECTABLE_PROFILES).optional(),
  signaturePolicy: z.record(z.enum(SIGNATURE_POLICY_KEYS), z.boolean()).optional(),
}).refine((value) => value.profileCode || value.signaturePolicy, { message: "No hay cambios que aplicar." });

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) {
    return NextResponse.json({ data: { profileCode: session.profileCode, signaturePolicy: DEFAULT_SIGNATURE_POLICY }, mode: "demo" });
  }
  const sql = getSql();
  const rows = await sql`SELECT profile_code, signature_policy FROM laboratory_settings WHERE laboratory_id = ${session.laboratoryId} LIMIT 1`;
  return NextResponse.json({
    data: {
      profileCode: String(rows[0]?.profile_code ?? session.profileCode),
      signaturePolicy: resolveSignaturePolicy(rows[0]?.signature_policy),
    },
    mode: "database",
  });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para cambiar el perfil del laboratorio." }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (hasDatabase()) {
    const sql = getSql();
    const previous = await sql`SELECT profile_code, signature_policy FROM laboratory_settings WHERE laboratory_id = ${session.laboratoryId} LIMIT 1`;
    const policy = payload.signaturePolicy
      ? { ...resolveSignaturePolicy(previous[0]?.signature_policy), ...payload.signaturePolicy }
      : null;
    await sql`
      INSERT INTO laboratory_settings (laboratory_id, profile_code, signature_policy)
      VALUES (${session.laboratoryId}, ${payload.profileCode ?? String(previous[0]?.profile_code ?? session.profileCode)}, ${JSON.stringify(policy ?? resolveSignaturePolicy(previous[0]?.signature_policy))}::jsonb)
      ON CONFLICT (laboratory_id) DO UPDATE SET
        profile_code = COALESCE(${payload.profileCode ?? null}, laboratory_settings.profile_code),
        signature_policy = COALESCE(${policy ? JSON.stringify(policy) : null}::jsonb, laboratory_settings.signature_policy),
        updated_at = now()
    `;
    await writeAuditEvent(session, {
      action: "LABORATORY_PROFILE_UPDATED",
      entityType: "laboratory_settings",
      entityId: session.laboratoryId,
      previousValue: previous[0] ?? null,
      newValue: { profileCode: payload.profileCode ?? previous[0]?.profile_code, signaturePolicy: policy },
      reason: "Cambio de perfil del laboratorio o de la política de firma",
      request,
    });
  }

  // El perfil viaja en la sesión: se vuelve a firmar el token para que la
  // navegación cambie sin necesidad de cerrar sesión.
  if (payload.profileCode && payload.profileCode !== session.profileCode) {
    const token = await createSessionToken({ ...session, profileCode: payload.profileCode });
    await setSessionCookie(token);
    return NextResponse.json({ data: { profileCode: payload.profileCode }, token, expiresInSeconds: SESSION_TTL_SECONDS, reload: true });
  }
  return NextResponse.json({ data: { profileCode: session.profileCode, signaturePolicy: payload.signaturePolicy } });
}
