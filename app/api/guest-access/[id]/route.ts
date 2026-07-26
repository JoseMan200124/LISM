import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { GUEST_SCOPES, MAX_GUEST_DURATION_DAYS, isGuestSession, normalizeGuestScopes } from "@/lib/guest-access";

// Revocación y ajuste de un acceso de invitado ya emitido. Revocar corta el
// acceso de inmediato para las sesiones que se abran después; las sesiones
// vivas caducan por sí solas al vencer su token (12 horas como máximo).

const patchSchema = z.object({
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  label: z.string().min(3).max(160).optional(),
  note: z.string().max(1000).optional().nullable(),
  scopes: z.array(z.enum(GUEST_SCOPES)).min(1).optional(),
  extendDays: z.coerce.number().int().min(1).max(MAX_GUEST_DURATION_DAYS).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (isGuestSession(session)) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasPermission(session, "guests.manage")) return NextResponse.json({ message: "No tienes permiso para administrar accesos de invitado." }, { status: 403 });

  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });

  const sql = getSql();
  const existing = await sql`SELECT * FROM guest_access_grants WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ message: "Acceso no encontrado." }, { status: 404 });

  const revoking = payload.status === "REVOKED" && existing[0].status !== "REVOKED";
  const scopes = payload.scopes ? normalizeGuestScopes(payload.scopes) : null;
  const expiresAt = payload.extendDays
    ? new Date(Date.now() + payload.extendDays * 24 * 60 * 60 * 1000).toISOString()
    : null;

  const rows = await sql`
    UPDATE guest_access_grants SET
      status = COALESCE(${payload.status ?? null}, status),
      label = COALESCE(${payload.label ?? null}, label),
      note = ${payload.note === undefined ? existing[0].note : payload.note},
      scopes = COALESCE(${scopes ? JSON.stringify(scopes) : null}::jsonb, scopes),
      expires_at = COALESCE(${expiresAt}::timestamptz, expires_at),
      revoked_by = ${revoking ? session.userId : (existing[0].revoked_by ?? null)},
      revoked_at = ${revoking ? new Date().toISOString() : (existing[0].revoked_at ?? null)},
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, code, label, note, scopes, expires_at, max_uses, uses_count, status, created_at, last_used_at
  `;

  await writeAuditEvent(session, {
    action: revoking ? "GUEST_ACCESS_REVOKED" : "GUEST_ACCESS_UPDATED",
    entityType: "guest_access_grant",
    entityId: id,
    previousValue: existing[0],
    newValue: rows[0],
    reason: revoking ? "Revocación de acceso de invitado" : "Actualización de acceso de invitado",
    request,
  });

  return NextResponse.json({ data: rows[0] });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (isGuestSession(session)) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasPermission(session, "guests.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: { id }, mode: "demo" });

  const sql = getSql();
  // No se borra el registro: se revoca para conservar la trazabilidad de quién
  // entró con ese código y cuándo.
  const rows = await sql`
    UPDATE guest_access_grants
    SET status = 'REVOKED', revoked_by = ${session.userId}, revoked_at = now(), updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} AND status <> 'REVOKED'
    RETURNING id, code, label, status
  `;
  if (!rows.length) return NextResponse.json({ message: "Acceso no encontrado o ya revocado." }, { status: 404 });

  await writeAuditEvent(session, {
    action: "GUEST_ACCESS_REVOKED",
    entityType: "guest_access_grant",
    entityId: id,
    newValue: rows[0],
    reason: "Revocación de acceso de invitado",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
