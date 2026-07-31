import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { writeAuditEvent } from "@/lib/audit";
import { generateWebhookSecret } from "@/lib/integration-auth";
import { invalidateWebhookCache } from "@/lib/integration-webhooks";
import { sanitizeCustomHeaders, validateWebhookTarget } from "@/lib/integration-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(3).max(160),
  targetUrl: z.string().min(8).max(2000),
  eventTypes: z.array(z.string().min(1).max(80)).min(1).max(50),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: { endpoints: [], deliveries: [] }, mode: "demo" });

  const sql = getSql();
  const endpoints = await sql`
    SELECT id, name, target_url, event_types, custom_headers, status,
           last_success_at, last_failure_at, consecutive_failures, created_at
    FROM webhook_endpoints
    WHERE laboratory_id = ${session.laboratoryId}
    ORDER BY created_at DESC
  `;

  // Las últimas entregas son lo que de verdad se mira cuando algo no llega.
  const deliveries = await sql`
    SELECT d.id, d.endpoint_id, e.name AS endpoint_name, d.event_type, d.status,
           d.attempts, d.response_status, d.last_error, d.created_at, d.delivered_at
    FROM webhook_deliveries d
    JOIN webhook_endpoints e ON e.id = d.endpoint_id
    WHERE d.laboratory_id = ${session.laboratoryId}
    ORDER BY d.created_at DESC
    LIMIT 50
  `;

  return NextResponse.json({ data: { endpoints, deliveries }, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para registrar webhooks." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Datos del webhook inválidos.", issues: parsed.error.issues }, { status: 400 });
  }
  const payload = parsed.data;

  const target = validateWebhookTarget(payload.targetUrl);
  if (!target.ok) return NextResponse.json({ message: target.message }, { status: 400 });

  const eventTypes = [...new Set(payload.eventTypes.map((event) => event.trim().toUpperCase()).filter(Boolean))];
  const secret = generateWebhookSecret();
  const sql = getSql();

  const rows = await sql`
    INSERT INTO webhook_endpoints (
      organization_id, laboratory_id, name, target_url, signing_secret,
      event_types, custom_headers, created_by
    ) VALUES (
      ${session.organizationId}, ${session.laboratoryId}, ${payload.name}, ${target.url}, ${secret},
      ${JSON.stringify(eventTypes)}::jsonb, ${JSON.stringify(sanitizeCustomHeaders(payload.customHeaders))}::jsonb, ${session.userId}
    )
    RETURNING id, name, target_url, event_types, status, created_at
  `;

  invalidateWebhookCache(session.laboratoryId);

  await writeAuditEvent(session, {
    action: "INTEGRATION_WEBHOOK_CREATED",
    entityType: "webhook_endpoint",
    entityId: String(rows[0].id),
    newValue: { name: payload.name, targetUrl: target.url, eventTypes },
    reason: "Alta de webhook hacia un sistema externo",
    request,
  });

  return NextResponse.json(
    {
      // El secreto de firma se muestra aquí para que el receptor pueda validar
      // la firma. Se puede volver a consultar en el detalle: sin él, el ERP no
      // puede verificar nada, así que ocultarlo no aportaría seguridad.
      data: { ...rows[0], signingSecret: secret },
    },
    { status: 201 },
  );
}
