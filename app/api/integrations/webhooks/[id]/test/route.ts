import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";
import { dispatchDelivery } from "@/lib/integration-webhooks";

// Envío de prueba. Sin esto, la única forma de saber si el destino está bien
// configurado sería esperar a que ocurra algo real en el laboratorio.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar integraciones." }, { status: 403 });
  }
  if (!hasDatabase()) {
    return NextResponse.json({ message: "La capa de integración requiere base de datos." }, { status: 503 });
  }

  const { id } = await context.params;
  const sql = getSql();
  const rows = await sql`
    SELECT id, target_url, signing_secret, custom_headers
    FROM webhook_endpoints
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    LIMIT 1
  `;
  const endpoint = rows[0] as Record<string, unknown> | undefined;
  if (!endpoint) return NextResponse.json({ message: "El webhook no existe en este laboratorio." }, { status: 404 });

  const payload = {
    action: "INTEGRATION_WEBHOOK_TEST",
    entityType: "webhook_endpoint",
    entityId: id,
    laboratoryId: session.laboratoryId,
    organizationId: session.organizationId,
    message: "Evento de prueba emitido desde NexaLab. Si lo recibes, la configuración es correcta.",
    occurredAt: new Date().toISOString(),
  };

  // La entrega de prueba se registra como cualquier otra: aparece en el
  // historial y se puede comparar con las reales cuando algo falla.
  const created = await sql`
    INSERT INTO webhook_deliveries (endpoint_id, organization_id, laboratory_id, event_type, payload)
    VALUES (${id}, ${session.organizationId}, ${session.laboratoryId}, 'INTEGRATION_WEBHOOK_TEST', ${JSON.stringify(payload)}::jsonb)
    RETURNING id, event_id
  `;
  const delivery = created[0] as { id: string; event_id: string };

  const customHeaders = typeof endpoint.custom_headers === "string"
    ? JSON.parse(endpoint.custom_headers) as Record<string, string>
    : (endpoint.custom_headers as Record<string, string> | null) ?? {};

  // Aquí sí se espera el resultado: quien pulsó "probar" quiere saber qué pasó.
  const delivered = await dispatchDelivery({
    id: String(delivery.id),
    endpointId: id,
    targetUrl: String(endpoint.target_url),
    signingSecret: String(endpoint.signing_secret),
    customHeaders,
    eventType: "INTEGRATION_WEBHOOK_TEST",
    eventId: String(delivery.event_id),
    payload,
    attempts: 0,
  });

  const finalRows = await sql`
    SELECT status, attempts, response_status, last_error FROM webhook_deliveries WHERE id = ${delivery.id}
  `;

  return NextResponse.json({ data: { delivered, delivery: finalRows[0] } });
}
