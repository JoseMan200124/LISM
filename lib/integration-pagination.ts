import { NextResponse } from "next/server";

// Recorte de colecciones para los dos consumidores de la capa de integración:
// el gateway REST (/api/v1) y el servidor MCP (/api/mcp).
//
// El recorte ocurre sobre el resultado ya consultado, no en SQL: los handlers
// nativos no reciben paginación y forzarla habría significado reescribirlos,
// que es justo lo que este diseño evita. Sirve para que quien llama no tenga
// que tragarse la colección entera; NO alivia a la base de datos. Cuando una
// colección crezca lo bastante para que eso importe, la paginación debe bajar
// al handler nativo y ningún contrato de aquí cambiará.

export const MAX_PAGE_SIZE = 500;
export const DEFAULT_PAGE_SIZE = 100;

export type PaginationRequest = {
  limit?: string | number | null;
  offset?: string | number | null;
  /**
   * Tamaño aplicado cuando quien llama no pide nada. El gateway REST lo deja
   * sin definir —un ERP que no pagina espera la colección completa— y el
   * servidor MCP sí lo fija, porque volcar 250 filas en la ventana de contexto
   * de un modelo no ayuda a nadie.
   */
  fallbackLimit?: number;
};

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Devuelve la misma respuesta con `data` recortado y un bloque `pagination`.
 *
 * Se deja intacta cuando no hay nada que recortar: respuesta de error, cuerpo
 * que no es JSON, o `data` que no es una colección. Un detalle de un artículo
 * no se convierte en una página de un elemento.
 */
export async function applyPagination(
  response: Response,
  request: PaginationRequest,
): Promise<Response> {
  const limitParam = toNumber(request.limit);
  const offsetParam = toNumber(request.offset);
  if (limitParam === null && offsetParam === null && request.fallbackLimit === undefined) return response;
  if (!response.ok) return response;

  let body: unknown;
  try {
    body = await response.clone().json();
  } catch {
    return response;
  }
  if (!body || typeof body !== "object" || !Array.isArray((body as { data?: unknown }).data)) {
    return response;
  }

  const rows = (body as { data: unknown[] }).data;
  const offset = Math.max(0, offsetParam ?? 0);
  const requested = limitParam ?? request.fallbackLimit ?? DEFAULT_PAGE_SIZE;
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, requested));
  const page = rows.slice(offset, offset + limit);

  return NextResponse.json(
    {
      ...(body as Record<string, unknown>),
      data: page,
      pagination: { total: rows.length, offset, limit, returned: page.length },
    },
    { status: response.status },
  );
}
