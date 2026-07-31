import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { writeAuditEvent } from "@/lib/audit";
import { invalidateWebhookCache } from "@/lib/integration-webhooks";
import { sanitizeCustomHeaders, validateWebhookTarget } from "@/lib/integration-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().min(3).max(160).optional(),
  targetUrl: z.string().min(8).max(2000).optional(),
  eventTypes: z.array(z.string().min(1).max(80)).min(1).max(50).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  status: z.enum(["ACTIVE", "PAUSED"]).optional(),
});

async function loadEndpoint(laboratoryId: string, id: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT id, name, target_url, event_types, status, signing_secret
    FROM webhook_endpoints
    WHERE id = ${id} AND laboratory_id = ${laboratoryId}
    LIMIT 1
  `;
  return rows[0] as Record<string, unknown> | undefined;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const { id } = await context.params;
  const endpoint = await loadEndpoint(session.laboratoryId, id);
  if (!endpoint) return NextResponse.json({ message: "El webhook no existe en este laboratorio." }, { status: 404 });

  return NextResponse.json({ data: endpoint });
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

  const existing = await loadEndpoint(session.laboratoryId, id);
  if (!existing) return NextResponse.json({ message: "El webhook no existe en este laboratorio." }, { status: 404 });

  let targetUrl: string | null = null;
  if (payload.targetUrl) {
    const target = validateWebhookTarget(payload.targetUrl);
    if (!target.ok) return NextResponse.json({ message: target.message }, { status: 400 });
    targetUrl = target.url;
  }

  const eventTypes = payload.eventTypes
    ? [...new Set(payload.eventTypes.map((event) => event.trim().toUpperCase()).filter(Boolean))]
    : null;

  const sql = getSql();
  const rows = await sql`
    UPDATE webhook_endpoints SET
      name = COALESCE(${payload.name ?? null}, name),
      target_url = COALESCE(${targetUrl}, target_url),
      event_types = COALESCE(${eventTypes ? JSON.stringify(eventTypes) : null}::jsonb, event_types),
      custom_headers = COALESCE(${payload.customHeaders ? JSON.stringify(sanitizeCustomHeaders(payload.customHeaders)) : null}::jsonb, custom_headers),
      status = COALESCE(${payload.status ?? null}, status),
      -- Reactivar limpia el contador: si el receptor ya se arregló, no debe
      -- arrastrar el historial de fallos anterior.
      consecutive_failures = CASE WHEN ${payload.status ?? null} = 'ACTIVE' THEN 0 ELSE consecutive_failures END,
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, name, target_url, event_types, status
  `;

  invalidateWebhookCache(session.laboratoryId);

  await writeAuditEvent(session, {
    action: "INTEGRATION_WEBHOOK_UPDATED",
    entityType: "webhook_endpoint",
    entityId: id,
    previousValue: { name: existing.name, targetUrl: existing.target_url, status: existing.status },
    newValue: rows[0],
    reason: "Cambio en la configuración del webhook",
    request,
  });

  return NextResponse.json({ data: rows[0] });
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
  const existing = await loadEndpoint(session.laboratoryId, id);
  if (!existing) return NextResponse.json({ message: "El webhook no existe en este laboratorio." }, { status: 404 });

  const sql = getSql();
  await sql`DELETE FROM webhook_endpoints WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}`;
  invalidateWebhookCache(session.laboratoryId);

  await writeAuditEvent(session, {
    action: "INTEGRATION_WEBHOOK_DELETED",
    entityType: "webhook_endpoint",
    entityId: id,
    previousValue: { name: existing.name, targetUrl: existing.target_url },
    reason: "Baja de webhook",
    request,
  });

  return NextResponse.json({ data: { id, deleted: true } });
}
