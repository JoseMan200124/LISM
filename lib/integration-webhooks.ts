import crypto from "node:crypto";
import { getSql, hasDatabase } from "@/lib/db";
import { matchesEventPattern } from "@/lib/integration-events";

// Avisos salientes: NexaLab empujando hacia el ERP.
//
// Una integración de verdad no puede depender de que el ERP pregunte cada
// cinco minutos si pasó algo. Cuando un reactivo llega al punto de reorden o
// se aprueba una solicitud de compra, el ERP tiene que enterarse en el
// momento.
//
// De dónde salen los eventos: de la BITÁCORA. Todo cambio de negocio del
// sistema pasa por writeAuditEvent —es la garantía regulatoria del producto—,
// así que engancharse ahí da cobertura de los ciento y pico de acciones
// existentes sin tocar un solo handler, y cualquier acción que se añada en el
// futuro queda cubierta automáticamente. Un catálogo de eventos mantenido a
// mano se habría quedado desactualizado en la primera entrega siguiente.

export const WEBHOOK_SIGNATURE_HEADER = "x-nexalab-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-nexalab-timestamp";
export const WEBHOOK_EVENT_HEADER = "x-nexalab-event";
export const WEBHOOK_DELIVERY_HEADER = "x-nexalab-delivery";

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 5;
// Espera creciente entre intentos: un ERP que se cae un rato se recupera solo,
// y uno que está mal configurado deja de recibir tráfico rápido.
const BACKOFF_MINUTES = [1, 5, 15, 60];

export type WebhookEndpointRow = {
  id: string;
  organizationId: string;
  laboratoryId: string;
  targetUrl: string;
  signingSecret: string;
  eventTypes: string[];
  customHeaders: Record<string, string>;
};

export function signWebhookPayload(secret: string, timestamp: string, rawBody: string): string {
  return `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
}

// Caché corta de endpoints por laboratorio. writeAuditEvent corre en rutas
// calientes: sin esto, cada cambio de negocio pagaría una consulta extra solo
// para descubrir que el laboratorio no tiene webhooks configurados, que es el
// caso mayoritario.
type CacheEntry = { endpoints: WebhookEndpointRow[]; expiresAt: number };
const endpointCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

export function invalidateWebhookCache(laboratoryId?: string): void {
  if (laboratoryId) endpointCache.delete(laboratoryId);
  else endpointCache.clear();
}

function parseJsonColumn<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

async function activeEndpoints(laboratoryId: string): Promise<WebhookEndpointRow[]> {
  const cached = endpointCache.get(laboratoryId);
  if (cached && cached.expiresAt > Date.now()) return cached.endpoints;

  const sql = getSql();
  const rows = await sql`
    SELECT id, organization_id, laboratory_id, target_url, signing_secret, event_types, custom_headers
    FROM webhook_endpoints
    WHERE laboratory_id = ${laboratoryId} AND status = 'ACTIVE'
  `;
  const endpoints = (rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    laboratoryId: String(row.laboratory_id),
    targetUrl: String(row.target_url),
    signingSecret: String(row.signing_secret),
    eventTypes: parseJsonColumn<string[]>(row.event_types, []),
    customHeaders: parseJsonColumn<Record<string, string>>(row.custom_headers, {}),
  }));

  endpointCache.set(laboratoryId, { endpoints, expiresAt: Date.now() + CACHE_TTL_MS });
  return endpoints;
}

export type PendingDelivery = {
  id: string;
  endpointId: string;
  targetUrl: string;
  signingSecret: string;
  customHeaders: Record<string, string>;
  eventType: string;
  eventId: string;
  payload: unknown;
  attempts: number;
};

/** Envía una entrega y anota el desenlace. No lanza: registra y sigue. */
export async function dispatchDelivery(delivery: PendingDelivery): Promise<boolean> {
  const sql = getSql();
  const rawBody = JSON.stringify({
    id: delivery.eventId,
    type: delivery.eventType,
    createdAt: new Date().toISOString(),
    data: delivery.payload,
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const attempt = delivery.attempts + 1;

  let responseStatus: number | null = null;
  let errorMessage: string | null = null;

  try {
    const response = await fetch(delivery.targetUrl, {
      method: "POST",
      headers: {
        ...delivery.customHeaders,
        "content-type": "application/json",
        [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(delivery.signingSecret, timestamp, rawBody),
        [WEBHOOK_TIMESTAMP_HEADER]: timestamp,
        [WEBHOOK_EVENT_HEADER]: delivery.eventType,
        [WEBHOOK_DELIVERY_HEADER]: delivery.id,
        "user-agent": "NexaLab-Webhooks/1.0",
      },
      body: rawBody,
      // Un receptor lento no puede quedarse colgado de un proceso nuestro.
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    responseStatus = response.status;
    if (!response.ok) {
      errorMessage = `El receptor respondió ${response.status}.`;
    }
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Fallo de red al entregar el evento.";
  }

  const delivered = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;

  if (delivered) {
    await sql`
      UPDATE webhook_deliveries
      SET status = 'DELIVERED', attempts = ${attempt}, response_status = ${responseStatus},
          delivered_at = now(), last_error = NULL
      WHERE id = ${delivery.id}
    `;
    await sql`
      UPDATE webhook_endpoints
      SET last_success_at = now(), consecutive_failures = 0, updated_at = now()
      WHERE id = ${delivery.endpointId}
    `;
    return true;
  }

  const exhausted = attempt >= MAX_ATTEMPTS;
  const backoffMinutes = BACKOFF_MINUTES[Math.min(attempt - 1, BACKOFF_MINUTES.length - 1)];

  await sql`
    UPDATE webhook_deliveries
    SET status = ${exhausted ? "FAILED" : "PENDING"},
        attempts = ${attempt},
        response_status = ${responseStatus},
        last_error = ${errorMessage},
        next_attempt_at = now() + (${backoffMinutes} * interval '1 minute')
    WHERE id = ${delivery.id}
  `;
  await sql`
    UPDATE webhook_endpoints
    SET last_failure_at = now(), consecutive_failures = consecutive_failures + 1, updated_at = now()
    WHERE id = ${delivery.endpointId}
  `;
  return false;
}

/**
 * Encola el evento para todos los endpoints suscritos y trata de entregarlo ya.
 *
 * Silencia sus propios errores por diseño: esto se llama justo después de
 * escribir la bitácora, y un webhook mal configurado JAMÁS puede hacer fallar
 * la operación de laboratorio que lo originó. Tampoco puede fallar cuando las
 * tablas todavía no existen, durante la ventana entre desplegar la imagen y
 * correr la migración.
 */
export async function emitWebhookEvent(args: {
  organizationId: string;
  laboratoryId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!hasDatabase()) return;

  try {
    const endpoints = await activeEndpoints(args.laboratoryId);
    const subscribed = endpoints.filter((endpoint) =>
      endpoint.eventTypes.some((pattern) => matchesEventPattern(pattern, args.eventType)),
    );
    if (subscribed.length === 0) return;

    const sql = getSql();
    for (const endpoint of subscribed) {
      const rows = await sql`
        INSERT INTO webhook_deliveries (
          endpoint_id, organization_id, laboratory_id, event_type, payload
        ) VALUES (
          ${endpoint.id}, ${args.organizationId}, ${args.laboratoryId}, ${args.eventType},
          ${JSON.stringify(args.payload)}::jsonb
        )
        RETURNING id, event_id
      `;
      const row = rows[0] as { id: string; event_id: string };

      // Entrega inmediata en segundo plano: quien hizo el cambio no espera al ERP.
      void dispatchDelivery({
        id: String(row.id),
        endpointId: endpoint.id,
        targetUrl: endpoint.targetUrl,
        signingSecret: endpoint.signingSecret,
        customHeaders: endpoint.customHeaders,
        eventType: args.eventType,
        eventId: String(row.event_id),
        payload: args.payload,
        attempts: 0,
      }).catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Antes de la migración 0026 las tablas no existen: no es un fallo real.
    if (message.includes("webhook_endpoints") || message.includes("webhook_deliveries")) return;
    console.error("[webhooks] No se pudo encolar el evento:", message);
  }
}

/**
 * Reintenta las entregas pendientes que ya cumplieron su espera. Pensado para
 * llamarse desde el panel de integraciones o un proceso programado.
 */
export async function flushPendingDeliveries(laboratoryId: string, limit = 25): Promise<{ attempted: number; delivered: number }> {
  if (!hasDatabase()) return { attempted: 0, delivered: 0 };
  const sql = getSql();

  const rows = await sql`
    SELECT d.id, d.endpoint_id, d.event_type, d.event_id, d.payload, d.attempts,
           e.target_url, e.signing_secret, e.custom_headers
    FROM webhook_deliveries d
    JOIN webhook_endpoints e ON e.id = d.endpoint_id AND e.status = 'ACTIVE'
    WHERE d.laboratory_id = ${laboratoryId}
      AND d.status = 'PENDING'
      AND d.next_attempt_at <= now()
    ORDER BY d.created_at ASC
    LIMIT ${limit}
  `;

  let delivered = 0;
  for (const raw of rows as Array<Record<string, unknown>>) {
    const ok = await dispatchDelivery({
      id: String(raw.id),
      endpointId: String(raw.endpoint_id),
      targetUrl: String(raw.target_url),
      signingSecret: String(raw.signing_secret),
      customHeaders: parseJsonColumn<Record<string, string>>(raw.custom_headers, {}),
      eventType: String(raw.event_type),
      eventId: String(raw.event_id),
      payload: parseJsonColumn<unknown>(raw.payload, {}),
      attempts: Number(raw.attempts ?? 0),
    });
    if (ok) delivered += 1;
  }

  return { attempted: rows.length, delivered };
}
