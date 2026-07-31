import { getSql, hasDatabase } from "@/lib/db";

// Control de caudal y registro de tráfico del gateway.

type Counter = { count: number; resetAt: number };

const counters = new Map<string, Counter>();
const WINDOW_MS = 60_000;

/**
 * Límite por minuto y credencial.
 *
 * El contador vive en memoria del proceso: con varias réplicas de Container
 * Apps el techo efectivo es el límite multiplicado por el número de réplicas.
 * Es deliberado — sirve para frenar un cliente desbocado o un bucle mal
 * programado, que es el caso real, sin pagar una escritura en base de datos
 * por cada llamada. Un límite exacto exigiría almacenamiento compartido.
 */
export function consumeRateLimit(clientId: string, limitPerMinute: number): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const limit = Math.max(1, limitPerMinute);
  const now = Date.now();
  const current = counters.get(clientId);

  if (!current || current.resetAt <= now) {
    counters.set(clientId, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetInSeconds: WINDOW_MS / 1000 };
  }

  const resetInSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetInSeconds };
  }

  current.count += 1;
  return { allowed: true, remaining: limit - current.count, resetInSeconds };
}

/** Solo para pruebas: deja el contador en blanco entre casos. */
export function resetRateLimits(): void {
  counters.clear();
}

export type RequestLogInput = {
  organizationId: string | null;
  laboratoryId: string | null;
  apiClientId: string | null;
  operationId: string | null;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  ipAddress: string | null;
  userAgent: string | null;
  errorCode?: string | null;
};

/**
 * Deja constancia de la llamada. Nunca debe hacer fallar la petición: si la
 * telemetría no se puede escribir, el ERP igual merece su respuesta.
 */
export async function writeRequestLog(input: RequestLogInput): Promise<void> {
  if (!hasDatabase()) return;
  try {
    const sql = getSql();
    await sql`
      INSERT INTO api_request_logs (
        organization_id, laboratory_id, api_client_id, operation_id,
        method, path, status_code, duration_ms, ip_address, user_agent, error_code
      ) VALUES (
        ${input.organizationId}, ${input.laboratoryId}, ${input.apiClientId}, ${input.operationId},
        ${input.method}, ${input.path}, ${input.statusCode}, ${input.durationMs},
        ${input.ipAddress}, ${input.userAgent}, ${input.errorCode ?? null}
      )
    `;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[integration] No se pudo registrar la llamada:", message);
  }
}

export function clientIpFrom(request: Request): string | null {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}
