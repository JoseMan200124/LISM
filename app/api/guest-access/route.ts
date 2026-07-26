import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  DEFAULT_GUEST_DURATION_DAYS,
  GUEST_SCOPES,
  MAX_GUEST_DURATION_DAYS,
  generateGuestCode,
  isGuestSession,
  normalizeGuestScopes,
} from "@/lib/guest-access";

// Códigos de acceso de invitado emitidos por profesores, coordinadores y
// dirección. Cada código habilita una entrada limitada al laboratorio sin
// crear cuentas de usuario.

const createSchema = z.object({
  label: z.string().min(3).max(160),
  note: z.string().max(1000).optional(),
  scopes: z.array(z.enum(GUEST_SCOPES)).min(1, "Elige al menos qué podrá ver el invitado."),
  durationDays: z.coerce.number().int().min(1).max(MAX_GUEST_DURATION_DAYS).default(DEFAULT_GUEST_DURATION_DAYS),
  maxUses: z.coerce.number().int().min(1).max(5000).optional().nullable(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (isGuestSession(session)) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasPermission(session, "guests.manage")) return NextResponse.json({ message: "No tienes permiso para administrar accesos de invitado." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT g.id, g.code, g.label, g.note, g.scopes, g.expires_at, g.max_uses, g.uses_count,
           g.status, g.created_at, g.last_used_at, u.full_name AS created_by_name,
           (SELECT count(*) FROM guest_access_sessions s WHERE s.grant_id = g.id) AS session_count
    FROM guest_access_grants g
    LEFT JOIN users u ON u.id = g.created_by
    WHERE g.laboratory_id = ${session.laboratoryId}
    ORDER BY g.created_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (isGuestSession(session)) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasPermission(session, "guests.manage")) return NextResponse.json({ message: "No tienes permiso para emitir accesos de invitado." }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del acceso.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  const scopes = normalizeGuestScopes(payload.scopes);
  if (!scopes.length) return NextResponse.json({ message: "Elige al menos un permiso para el invitado." }, { status: 400 });

  const expiresAt = new Date(Date.now() + payload.durationDays * 24 * 60 * 60 * 1000);

  if (!hasDatabase()) {
    return NextResponse.json({
      data: {
        id: crypto.randomUUID(), code: generateGuestCode(), label: payload.label, note: payload.note ?? null,
        scopes, expires_at: expiresAt.toISOString(), max_uses: payload.maxUses ?? null, uses_count: 0,
        status: "ACTIVE", created_at: new Date().toISOString(),
      },
      mode: "demo",
    }, { status: 201 });
  }

  const sql = getSql();
  // El código es único a nivel global: se reintenta ante la colisión, que con
  // 31^8 combinaciones es improbable pero no imposible.
  let created: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    const code = generateGuestCode();
    const rows = await sql`
      INSERT INTO guest_access_grants (laboratory_id, code, label, note, scopes, expires_at, max_uses, created_by)
      VALUES (${session.laboratoryId}, ${code}, ${payload.label}, ${payload.note ?? null},
              ${JSON.stringify(scopes)}::jsonb, ${expiresAt.toISOString()}, ${payload.maxUses ?? null}, ${session.userId})
      ON CONFLICT (code) DO NOTHING
      RETURNING id, code, label, note, scopes, expires_at, max_uses, uses_count, status, created_at
    `;
    created = (rows[0] as Record<string, unknown>) ?? null;
  }
  if (!created) return NextResponse.json({ message: "No se pudo generar un código único. Intenta de nuevo." }, { status: 503 });

  await writeAuditEvent(session, {
    action: "GUEST_ACCESS_GRANTED",
    entityType: "guest_access_grant",
    entityId: String(created.id),
    newValue: { label: payload.label, scopes, expiresAt: expiresAt.toISOString(), maxUses: payload.maxUses ?? null },
    reason: "Emisión de acceso temporal de invitado",
    request,
  });

  return NextResponse.json({ data: created }, { status: 201 });
}
