import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { createSessionToken, setSessionCookie, SESSION_TTL_SECONDS, type UserSession } from "@/lib/session";
import {
  checkGuestGrant,
  guestPermissions,
  guestSessionSeconds,
  normalizeGuestCode,
  normalizeGuestScopes,
} from "@/lib/guest-access";

// Canje del código de invitado. Es la única ruta pública que abre una sesión
// sin cuenta: el estudiante escribe el código que le dio su profesor y el
// nombre con el que quedará registrado cualquier consumo que haga.

export const dynamic = "force-dynamic";

const redeemSchema = z.object({
  code: z.string().min(4).max(40),
  displayName: z.string().min(3).max(160),
  identifier: z.string().max(120).optional(),
  client: z.enum(["web", "mobile"]).optional().default("web"),
});

// Freno a la fuerza bruta sobre el código. En memoria del proceso: suficiente
// para lo que protege (un código de aula de 8 caracteres con vigencia limitada)
// y sin dependencias nuevas.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 10 * 60 * 1000;

function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "desconocido";
}

export async function POST(request: Request) {
  const parsed = redeemSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Escribe el código y tu nombre completo." }, { status: 400 });

  const { displayName, identifier, client } = parsed.data;
  const code = normalizeGuestCode(parsed.data.code);
  if (!code) return NextResponse.json({ message: "El código no tiene el formato correcto (NXL-XXXX-XXXX)." }, { status: 400 });

  if (tooManyAttempts(clientKey(request))) {
    return NextResponse.json({ message: "Demasiados intentos. Espera unos minutos antes de volver a probar." }, { status: 429 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ message: "El acceso de invitado no está disponible en modo demostración." }, { status: 503 });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT g.id, g.laboratory_id, g.label, g.scopes, g.expires_at, g.max_uses, g.uses_count, g.status,
           l.name AS laboratory_name, l.organization_id,
           COALESCE(ls.profile_code, 'EDUCATIONAL_SMALL_LAB') AS profile_code
    FROM guest_access_grants g
    JOIN laboratories l ON l.id = g.laboratory_id AND l.status = 'ACTIVE'
    LEFT JOIN laboratory_settings ls ON ls.laboratory_id = l.id
    WHERE g.code = ${code}
    LIMIT 1
  `;
  const grant = rows[0] as Record<string, unknown> | undefined;
  if (!grant) return NextResponse.json({ message: "Ese código no existe. Revísalo con quien te lo compartió." }, { status: 404 });

  const check = checkGuestGrant({
    status: String(grant.status),
    expires_at: grant.expires_at as string,
    max_uses: grant.max_uses as number | null,
    uses_count: grant.uses_count as number | null,
  });
  if (!check.usable) return NextResponse.json({ message: check.reason }, { status: 403 });

  const scopes = normalizeGuestScopes(grant.scopes);
  if (!scopes.length) return NextResponse.json({ message: "Este código no tiene permisos asignados. Pide uno nuevo." }, { status: 403 });

  const sessionRows = await sql`
    INSERT INTO guest_access_sessions (grant_id, laboratory_id, display_name, identifier, user_agent)
    VALUES (${String(grant.id)}, ${String(grant.laboratory_id)}, ${displayName.trim()}, ${identifier?.trim() || null},
            ${request.headers.get("user-agent")?.slice(0, 400) ?? null})
    RETURNING id, started_at
  `;
  await sql`
    UPDATE guest_access_grants SET uses_count = uses_count + 1, last_used_at = now(), updated_at = now()
    WHERE id = ${String(grant.id)}
  `;

  const expiresAt = new Date(String(grant.expires_at));
  const ttl = guestSessionSeconds(expiresAt, SESSION_TTL_SECONDS);

  const session: UserSession = {
    // El identificador de la sesión de invitado hace las veces de userId: los
    // registros que cree quedan atados a él y a su nombre declarado.
    userId: String(sessionRows[0].id),
    name: displayName.trim(),
    email: "",
    role: "GUEST",
    organizationId: String(grant.organization_id),
    laboratoryId: String(grant.laboratory_id),
    laboratoryName: String(grant.laboratory_name),
    profileCode: String(grant.profile_code),
    sessionMode: "database",
    permissions: guestPermissions(scopes),
    guest: {
      grantId: String(grant.id),
      sessionId: String(sessionRows[0].id),
      grantLabel: String(grant.label),
      scopes,
      expiresAt: expiresAt.toISOString(),
    },
  };

  const token = await createSessionToken(session, ttl);
  await setSessionCookie(token, ttl);

  if (client === "mobile") {
    return NextResponse.json({ ok: true, token, expiresInSeconds: ttl, session });
  }
  return NextResponse.json({
    ok: true,
    session: {
      name: session.name,
      laboratoryName: session.laboratoryName,
      grantLabel: session.guest?.grantLabel,
      scopes,
      expiresAt: session.guest?.expiresAt,
    },
  });
}
