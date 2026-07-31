import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { writeAuditEvent } from "@/lib/audit";
import { generateApiCredentials } from "@/lib/integration-auth";
import { INTEGRATION_SCOPES, normalizeScopes } from "@/lib/integration-scopes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(3).max(160).optional(),
  description: z.string().max(500).optional(),
  scopes: z.array(z.enum(INTEGRATION_SCOPES)).min(1).optional(),
  rateLimitPerMinute: z.coerce.number().int().min(10).max(6000).optional(),
  status: z.enum(["ACTIVE", "REVOKED"]).optional(),
  // Emite un secreto nuevo e invalida el anterior en el acto.
  rotate: z.boolean().optional(),
});

async function loadClient(laboratoryId: string, id: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, description, scopes, rate_limit_per_minute, status, client_id, key_prefix
    FROM api_clients
    WHERE id = ${id} AND laboratory_id = ${laboratoryId}
    LIMIT 1
  `;
  return rows[0] as Record<string, unknown> | undefined;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const { id } = await context.params;
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  }
  const payload = parsed.data;

  // El alcance por laboratorio se comprueba al cargar: nadie toca la credencial
  // de otro laboratorio aunque conozca su identificador.
  const existing = await loadClient(session.laboratoryId, id);
  if (!existing) return NextResponse.json({ message: "La credencial no existe en este laboratorio." }, { status: 404 });

  const sql = getSql();
  const scopes = payload.scopes ? normalizeScopes(payload.scopes) : null;
  const rotated = payload.rotate ? generateApiCredentials() : null;

  const rows = await sql`
    UPDATE api_clients SET
      name = COALESCE(${payload.name ?? null}, name),
      description = COALESCE(${payload.description ?? null}, description),
      scopes = COALESCE(${scopes ? JSON.stringify(scopes) : null}::jsonb, scopes),
      rate_limit_per_minute = COALESCE(${payload.rateLimitPerMinute ?? null}, rate_limit_per_minute),
      status = COALESCE(${payload.status ?? null}, status),
      key_prefix = COALESCE(${rotated?.keyPrefix ?? null}, key_prefix),
      key_hash = COALESCE(${rotated?.keyHash ?? null}, key_hash),
      client_id = COALESCE(${rotated?.clientId ?? null}, client_id),
      revoked_at = CASE WHEN ${payload.status ?? null} = 'REVOKED' THEN now() ELSE revoked_at END,
      revoked_by = CASE WHEN ${payload.status ?? null} = 'REVOKED' THEN ${session.userId}::uuid ELSE revoked_by END,
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, name, client_id, key_prefix, scopes, rate_limit_per_minute, status
  `;

  await writeAuditEvent(session, {
    action: payload.status === "REVOKED" ? "INTEGRATION_CLIENT_REVOKED" : "INTEGRATION_CLIENT_UPDATED",
    entityType: "api_client",
    entityId: id,
    previousValue: { name: existing.name, scopes: existing.scopes, status: existing.status },
    newValue: { ...rows[0], rotated: Boolean(rotated) },
    reason: rotated ? "Rotación del secreto de la credencial de integración" : "Cambio en la credencial de integración",
    request,
  });

  return NextResponse.json({
    data: {
      ...rows[0],
      ...(rotated ? { secret: rotated.secret, secretShownOnce: true } : {}),
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const { id } = await context.params;
  const existing = await loadClient(session.laboratoryId, id);
  if (!existing) return NextResponse.json({ message: "La credencial no existe en este laboratorio." }, { status: 404 });

  // Se revoca, no se borra: la telemetría de lo que ese sistema llamó tiene que
  // seguir siendo consultable, igual que el resto de registros del producto.
  const sql = getSql();
  await sql`
    UPDATE api_clients
    SET status = 'REVOKED', revoked_at = now(), revoked_by = ${session.userId}, updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
  `;

  await writeAuditEvent(session, {
    action: "INTEGRATION_CLIENT_REVOKED",
    entityType: "api_client",
    entityId: id,
    previousValue: { name: existing.name, status: existing.status },
    newValue: { status: "REVOKED" },
    reason: "Revocación de credencial de integración",
    request,
  });

  return NextResponse.json({ data: { id, status: "REVOKED" } });
}
