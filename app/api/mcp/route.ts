import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { authenticateIntegrationRequest, type IntegrationPrincipal } from "@/lib/integration-auth";
import { clientIpFrom, consumeRateLimit, writeRequestLog } from "@/lib/integration-telemetry";
import { handleJsonRpcMessage, jsonRpcError } from "@/lib/mcp-protocol";
import { JSON_RPC_ERRORS, LATEST_PROTOCOL_VERSION, operationBehindTool } from "@/lib/mcp-server";

// Servidor MCP de NexaLab: la puerta por la que un asistente de IA entra al
// laboratorio.
//
// Es hermano del gateway REST de /api/v1 y comparte con él todo lo que importa:
// la misma credencial, los mismos alcances, el mismo límite de llamadas, la
// misma telemetría y los mismos handlers. Lo único que cambia es el idioma en el
// que se habla —JSON-RPC del protocolo MCP en lugar de REST— y que las
// herramientas publican la forma exacta de sus cuerpos, porque un modelo no
// puede descubrirla a base de prueba y error como haría una persona.
//
// Transporte: "Streamable HTTP" en su modo de respuesta JSON. No se abre SSE,
// porque este servidor no envía nada que el cliente no haya pedido: no hay
// notificaciones de servidor, ni muestreo, ni progreso.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function withProtocolHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set("mcp-protocol-version", LATEST_PROTOCOL_VERSION);
  headers.set("x-nexalab-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function statusForAuthFailure(error: string): number {
  if (error === "unconfigured") return 503;
  if (["revoked", "expired", "no_actor", "actor_without_access"].includes(error)) return 403;
  return 401;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  let principal: IntegrationPrincipal | null = null;
  let toolName: string | null = null;
  let errorCode: string | null = null;
  let response: Response;

  const finish = (finalResponse: Response): Response => {
    void writeRequestLog({
      organizationId: principal?.session.organizationId ?? null,
      laboratoryId: principal?.session.laboratoryId ?? null,
      apiClientId: principal?.client.id ?? null,
      // Se registra la operación del catálogo detrás de la herramienta, para
      // que una llamada por MCP y la misma por REST aparezcan juntas en la
      // telemetría en vez de en dos mundos separados.
      operationId: toolName ? (operationBehindTool(toolName)?.operationId ?? toolName) : null,
      method: "POST",
      path: "/mcp",
      statusCode: finalResponse.status,
      durationMs: Date.now() - startedAt,
      ipAddress: clientIpFrom(request),
      userAgent: request.headers.get("user-agent"),
      errorCode,
    }).catch(() => {});

    return withProtocolHeaders(finalResponse, requestId);
  };

  try {
    const authenticated = await authenticateIntegrationRequest(request.headers);
    if ("failure" in authenticated) {
      errorCode = authenticated.failure.error;
      return finish(
        NextResponse.json(
          { error: authenticated.failure.error, message: authenticated.failure.message },
          {
            status: statusForAuthFailure(authenticated.failure.error),
            // Le dice al cliente MCP cómo debe presentarse. Sin esto, algunos
            // se limitan a mostrar "401" sin explicar que falta la credencial.
            headers: { "www-authenticate": 'Bearer realm="NexaLab", error="invalid_token"' },
          },
        ),
      );
    }
    principal = authenticated.principal;

    const limit = consumeRateLimit(principal.client.id, principal.client.rateLimitPerMinute);
    if (!limit.allowed) {
      errorCode = "rate_limited";
      return finish(
        NextResponse.json(
          { error: "rate_limited", message: "Se superó el límite de llamadas por minuto de esta credencial." },
          { status: 429, headers: { "retry-after": String(limit.resetInSeconds) } },
        ),
      );
    }

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      errorCode = "parse_error";
      return finish(
        NextResponse.json(jsonRpcError(null, JSON_RPC_ERRORS.parseError, "El cuerpo no es JSON válido."), { status: 400 }),
      );
    }

    const context = {
      principal,
      origin: new URL(request.url).origin,
      userAgent: request.headers.get("user-agent"),
      forwardedFor: clientIpFrom(request),
    };

    // El lote desapareció del protocolo en la revisión 2025-06-18, pero clientes
    // anteriores lo siguen enviando y aceptarlo no cuesta nada.
    const messages = Array.isArray(payload) ? payload : [payload];
    const responses = [];
    for (const message of messages) {
      const handled = await handleJsonRpcMessage(message, context);
      if (handled.toolName) toolName = handled.toolName;
      if (handled.response) responses.push(handled.response);
    }

    if (responses.length === 0) {
      // Solo había notificaciones: el protocolo pide acuse sin cuerpo.
      response = new Response(null, { status: 202 });
    } else {
      response = NextResponse.json(Array.isArray(payload) ? responses : responses[0], { status: 200 });
    }
  } catch (error) {
    errorCode = "internal_error";
    const message = error instanceof Error ? error.message : "Error interno del servidor MCP.";
    console.error(`[mcp ${requestId}]`, message);
    response = NextResponse.json(
      jsonRpcError(null, JSON_RPC_ERRORS.internalError, "Error interno del servidor MCP."),
      { status: 500 },
    );
  }

  return finish(response);
}

/**
 * El protocolo reserva GET para abrir un canal de eventos del servidor al
 * cliente. Este servidor no emite nada por su cuenta, así que responde 405 tal
 * como pide la especificación para ese caso.
 */
export function GET(): Response {
  return NextResponse.json(
    {
      error: "method_not_allowed",
      message: "Este servidor MCP no abre canal de eventos. Envía los mensajes JSON-RPC por POST.",
    },
    { status: 405, headers: { allow: "POST, OPTIONS" } },
  );
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: { allow: "POST, GET, OPTIONS" } });
}
