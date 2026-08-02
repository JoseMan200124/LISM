import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { withServiceSession } from "@/lib/session";
import { authenticateIntegrationRequest, type IntegrationPrincipal } from "@/lib/integration-auth";
import { allowedMethodsFor, matchOperation, type IntegrationOperation } from "@/lib/integration-registry";
import { clientIpFrom, consumeRateLimit, writeRequestLog } from "@/lib/integration-telemetry";
import { applyPagination } from "@/lib/integration-pagination";

// Gateway REST de integraciones: la única puerta por la que un ERP, SAP, Power
// Apps o cualquier otro sistema entra a NexaLab.
//
// No contiene ni una regla de negocio. Su trabajo es identificar quién llama,
// comprobar que su credencial alcanza para la operación pedida y delegar en el
// mismo handler que atiende a la aplicación web (ver lib/integration-registry.ts).
// Esa delegación es lo que garantiza que una compra creada desde SAP pase por
// las mismas validaciones, permisos y bitácora que una creada a mano.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function errorResponse(
  status: number,
  error: string,
  message: string,
  extra: Record<string, unknown> = {},
): NextResponse {
  return NextResponse.json({ error, message, ...extra }, { status });
}

/** Códigos HTTP para cada fallo de credencial, sin decir de más a quien llama. */
function statusForAuthFailure(error: string): number {
  if (error === "unconfigured") return 503;
  if (error === "revoked" || error === "expired" || error === "no_actor" || error === "actor_without_access") return 403;
  return 401;
}

/**
 * Petición que recibe el handler nativo. Conserva la URL original —y con ella
 * los parámetros de consulta, que varios handlers leen— y reinyecta el cuerpo,
 * porque el original ya se consumió al leerlo aquí.
 */
function nativeRequest(request: Request, method: string, rawBody: string | null): Request {
  const headers = new Headers(request.headers);
  headers.set("x-nexalab-actor-channel", "integration-api");
  // La credencial no debe seguir viajando hacia dentro: el handler ya recibe
  // la sesión resuelta y no tiene por qué ver el secreto.
  headers.delete("authorization");
  headers.delete("x-api-key");

  if (rawBody === null) {
    return new Request(request.url, { method, headers });
  }
  headers.set("content-type", "application/json");
  return new Request(request.url, { method, headers, body: rawBody });
}

async function handle(request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const startedAt = Date.now();
  const { path } = await context.params;
  const segments = (path ?? []).filter(Boolean);
  const url = new URL(request.url);
  const publicPath = `/${segments.join("/")}`;
  const requestId = crypto.randomUUID();

  let principal: IntegrationPrincipal | null = null;
  let operation: IntegrationOperation | null = null;
  let response: Response;
  let errorCode: string | null = null;

  /** Sella la respuesta: cabeceras de correlación y registro de la llamada. */
  const finish = (finalResponse: Response): Response => {
    const durationMs = Date.now() - startedAt;
    const headers = new Headers(finalResponse.headers);
    headers.set("x-nexalab-request-id", requestId);
    if (operation) headers.set("x-nexalab-operation", operation.operationId);

    // La telemetría no debe retrasar la respuesta ni tumbarla si falla.
    void writeRequestLog({
      organizationId: principal?.session.organizationId ?? null,
      laboratoryId: principal?.session.laboratoryId ?? null,
      apiClientId: principal?.client.id ?? null,
      operationId: operation?.operationId ?? null,
      method: request.method,
      path: publicPath,
      statusCode: finalResponse.status,
      durationMs,
      ipAddress: clientIpFrom(request),
      userAgent: request.headers.get("user-agent"),
      errorCode,
    }).catch(() => {});

    return new Response(finalResponse.body, {
      status: finalResponse.status,
      statusText: finalResponse.statusText,
      headers,
    });
  };

  try {
    const authenticated = await authenticateIntegrationRequest(request.headers);
    if ("failure" in authenticated) {
      errorCode = authenticated.failure.error;
      response = errorResponse(
        statusForAuthFailure(authenticated.failure.error),
        authenticated.failure.error,
        authenticated.failure.message,
      );
    } else {
      principal = authenticated.principal;
      const matched = matchOperation(request.method, segments);

      if (!matched) {
        const allowed = allowedMethodsFor(segments);
        if (allowed.length > 0) {
          errorCode = "method_not_allowed";
          response = errorResponse(405, "method_not_allowed", `Esta ruta acepta: ${allowed.join(", ")}.`, { allowed });
        } else {
          errorCode = "not_found";
          response = errorResponse(404, "not_found", `La ruta ${publicPath} no existe en la API de integración. Consulta /api/v1/openapi.`);
        }
      } else if (!principal.scopes.includes(matched.operation.scope)) {
        errorCode = "insufficient_scope";
        response = errorResponse(403, "insufficient_scope", `Esta operación requiere el alcance '${matched.operation.scope}'.`, {
          requiredScope: matched.operation.scope,
          grantedScopes: principal.scopes,
        });
      } else {
        operation = matched.operation;
        const limit = consumeRateLimit(principal.client.id, principal.client.rateLimitPerMinute);
        if (!limit.allowed) {
          errorCode = "rate_limited";
          response = errorResponse(429, "rate_limited", "Se superó el límite de llamadas por minuto de esta credencial.", {
            retryAfterSeconds: limit.resetInSeconds,
          });
        } else {
          const expectsBody = ["POST", "PATCH", "PUT"].includes(request.method.toUpperCase());
          const rawBody = expectsBody ? await request.text() : null;

          // Un cuerpo mal formado se detecta aquí y no dentro del handler, para
          // que el integrador reciba un mensaje que le diga qué corregir.
          if (expectsBody && rawBody) {
            try {
              JSON.parse(rawBody);
            } catch {
              errorCode = "invalid_json";
              return finish(errorResponse(400, "invalid_json", "El cuerpo de la petición no es JSON válido."));
            }
          }

          const native = nativeRequest(request, request.method, expectsBody ? rawBody ?? "{}" : null);
          const raw = await withServiceSession(principal.session, () =>
            matched.operation.invoke({ request: native, id: matched.id }),
          );
          response = await applyPagination(raw, {
            limit: url.searchParams.get("limit"),
            offset: url.searchParams.get("offset"),
          });
          if (!response.ok) errorCode = `upstream_${response.status}`;
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error interno de la API de integración.";
    errorCode = "internal_error";
    console.error(`[integration ${requestId}] ${request.method} ${publicPath}:`, message);
    response = errorResponse(500, "internal_error", message);
  }

  return finish(response);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;

export async function OPTIONS(_request: Request, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const allowed = allowedMethodsFor((path ?? []).filter(Boolean));
  return new Response(null, {
    status: allowed.length > 0 ? 204 : 404,
    headers: { allow: [...allowed, "OPTIONS"].join(", ") },
  });
}
