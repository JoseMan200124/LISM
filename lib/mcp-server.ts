import { withServiceSession } from "@/lib/session";
import { INTEGRATION_OPERATIONS, type IntegrationOperation } from "@/lib/integration-registry";
import { applyPagination } from "@/lib/integration-pagination";
import { toolsForScopes, operationIdForTool, type McpToolDefinition } from "@/lib/mcp-tools";
import type { IntegrationPrincipal } from "@/lib/integration-auth";

// Motor del servidor MCP: traduce mensajes JSON-RPC del protocolo a llamadas
// sobre el mismo registro de operaciones que atiende al ERP y a la web.
//
// Igual que el gateway REST, no contiene una sola regla de negocio. Un modelo
// que registra un movimiento de inventario pasa por la misma validación Zod,
// los mismos permisos, el mismo alcance por laboratorio y la misma bitácora que
// una persona haciéndolo desde la pantalla. Esa es la razón de montar el MCP
// encima de la capa de integración en vez de darle acceso a la base de datos:
// un agente no puede hacer nada que su credencial no pudiera hacer ya.

export const SERVER_NAME = "nexalab";
export const SERVER_VERSION = "1.0.0";

/**
 * Versiones del protocolo que sabemos hablar, de más reciente a más antigua.
 * En `initialize` se devuelve la que pida el cliente si está aquí; si no, la
 * primera, y es el cliente quien decide si sigue.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL_VERSION = SUPPORTED_PROTOCOL_VERSIONS[0];

/**
 * Tamaño de página por defecto de las colecciones.
 *
 * El gateway REST no fija ninguno —un ERP que no pagina quiere todo— pero aquí
 * el consumidor es una ventana de contexto: devolver 250 filas de inventario
 * para responder "¿cuántos reactivos vencen este mes?" gasta el presupuesto del
 * modelo sin mejorar la respuesta. El bloque `pagination` de la respuesta dice
 * cuántas hay en total, así que el modelo sabe que puede pedir más.
 */
const MCP_DEFAULT_PAGE_SIZE = 50;

export const JSON_RPC_ERRORS = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
} as const;

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: Record<string, unknown>;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

export type McpContext = {
  principal: IntegrationPrincipal;
  /** Origen de la petición, para reconstruir la URL que esperan los handlers. */
  origin: string;
  userAgent: string | null;
  forwardedFor: string | null;
};

const operationById = new Map<string, IntegrationOperation>(
  INTEGRATION_OPERATIONS.map((operation) => [operation.operationId, operation]),
);

// ————————————————————————————————— Herramientas propias del MCP

/**
 * Las dos herramientas que no salen del catálogo. No añaden capacidades: una
 * describe la credencial y la otra encadena listados que ya existen. Están aquí
 * porque un agente que acaba de conectarse necesita orientarse antes de actuar,
 * y hacerlo a base de llamadas sueltas gasta turnos y contexto.
 */
const WHOAMI_TOOL: McpToolDefinition = {
  name: "nexalab_whoami",
  title: "Identidad y alcance de la conexión",
  description: [
    "Devuelve el laboratorio al que está conectada esta credencial, su perfil, los alcances concedidos",
    "y las operaciones disponibles. Conviene llamarla al principio: evita proponer acciones que esta",
    "integración tiene prohibidas y aclara sobre qué laboratorio se está trabajando.",
  ].join(" "),
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const OVERVIEW_SECTIONS: Array<{ key: string; operationId: string; label: string }> = [
  { key: "inventario", operationId: "inventory.items.list", label: "Artículos de inventario" },
  { key: "inventarioControlado", operationId: "inventory.controlled.list", label: "Reactivos controlados" },
  { key: "movimientos", operationId: "inventory.movements.list", label: "Movimientos de existencia" },
  { key: "equipos", operationId: "equipment.list", label: "Equipos" },
  { key: "eventosEquipo", operationId: "equipment.events.list", label: "Eventos de equipo" },
  { key: "planesEquipo", operationId: "equipment.plans.list", label: "Planes de mantenimiento" },
  { key: "muestras", operationId: "specimens.list", label: "Muestras" },
  { key: "resultados", operationId: "results.list", label: "Resultados" },
  { key: "compras", operationId: "purchasing.requests.list", label: "Solicitudes de compra" },
  { key: "cumplimiento", operationId: "compliance.summary", label: "Cumplimiento" },
  { key: "incidencias", operationId: "incidents.list", label: "Incidencias" },
  { key: "alertas", operationId: "alerts.list", label: "Alertas" },
  { key: "practicas", operationId: "education.practices.list", label: "Prácticas" },
  { key: "reservas", operationId: "education.reservations.list", label: "Reservas" },
  { key: "proyectos", operationId: "research.projects.list", label: "Proyectos de investigación" },
  { key: "calidad", operationId: "quality.oos.list", label: "Resultados fuera de especificación" },
];

const OVERVIEW_TOOL: McpToolDefinition = {
  name: "nexalab_overview",
  title: "Panorama del laboratorio",
  description: [
    "Recorre de una vez todas las secciones que alcanza esta credencial (inventario, equipos, muestras,",
    "compras, cumplimiento, incidencias, alertas, educación, investigación y calidad) y devuelve, por cada",
    "una, cuántos registros hay y una muestra de los más recientes. Es el punto de partida para analizar el",
    "estado del laboratorio sin encadenar quince consultas. Para el detalle de una sección, usa su",
    "herramienta específica.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: { type: "string", enum: OVERVIEW_SECTIONS.map((section) => section.key) },
        description: "Secciones a incluir. Si se omite, se incluyen todas las que permita la credencial.",
      },
      sampleSize: {
        type: "integer",
        minimum: 0,
        maximum: 20,
        description: "Cuántos registros recientes devolver por sección (por omisión 3, solo como muestra).",
      },
    },
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

/** Secciones del panorama, para que las pruebas comprueben que todas existen. */
export function overviewSectionOperationIds(): string[] {
  return OVERVIEW_SECTIONS.map((section) => section.operationId);
}

export function listTools(principal: IntegrationPrincipal): McpToolDefinition[] {
  return [WHOAMI_TOOL, OVERVIEW_TOOL, ...toolsForScopes(principal.scopes)];
}

// ————————————————————————————————— Ejecución

/**
 * Reconstruye la petición HTTP que espera el handler nativo.
 *
 * El User-Agent identifica el canal a propósito: `writeAuditEvent` lo guarda, y
 * así la bitácora distingue lo que hizo un agente de lo que hizo una persona
 * desde la pantalla, atribuido siempre al usuario responsable de la credencial.
 */
function nativeRequestFor(
  operation: IntegrationOperation,
  args: Record<string, unknown>,
  context: McpContext,
): { request: Request; id: string | null } {
  const id = typeof args.id === "string" ? args.id : null;
  const path = operation.path.replace("{id}", id ? encodeURIComponent(id) : "");
  const url = new URL(`/api/v1${path}`, context.origin);

  for (const query of operation.query ?? []) {
    const value = args[query.name];
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(query.name, String(value));
  }

  const headers = new Headers({
    "content-type": "application/json",
    "x-nexalab-actor-channel": "mcp",
    "user-agent": `NexaLab-MCP/${SERVER_VERSION} (${context.userAgent ?? "cliente desconocido"})`,
  });
  if (context.forwardedFor) headers.set("x-forwarded-for", context.forwardedFor);

  const expectsBody = ["POST", "PATCH", "PUT"].includes(operation.method);
  const init: RequestInit = { method: operation.method, headers };
  if (expectsBody) init.body = JSON.stringify(args.body ?? {});

  return { request: new Request(url, init), id };
}

async function invokeOperation(
  operation: IntegrationOperation,
  args: Record<string, unknown>,
  context: McpContext,
): Promise<Response> {
  if (operation.path.includes("{id}") && typeof args.id !== "string") {
    throw new McpToolError(`La operación '${operation.operationId}' necesita el campo 'id'.`);
  }

  const { request, id } = nativeRequestFor(operation, args, context);
  const raw = await withServiceSession(context.principal.session, () => operation.invoke({ request, id }));

  return applyPagination(raw, {
    limit: args.limit as string | number | undefined,
    offset: args.offset as string | number | undefined,
    fallbackLimit: operation.method === "GET" ? MCP_DEFAULT_PAGE_SIZE : undefined,
  });
}

/** Error de herramienta: se devuelve al modelo como resultado, no como fallo del protocolo. */
export class McpToolError extends Error {}

/**
 * Convierte la respuesta del handler en un resultado MCP.
 *
 * Un error de validación se devuelve con `isError` y el detalle completo de los
 * campos que fallaron, no como excepción del protocolo. Es lo que permite que
 * el modelo corrija y reintente en el mismo turno en vez de abandonar; ocultar
 * el detalle solo consigue que vuelva a fallar igual.
 */
async function resultFromResponse(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  const text = await response.text();
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ status: response.status, ...(body as Record<string, unknown>) }),
        },
      ],
      isError: true,
    };
  }

  return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

async function runOverview(
  args: Record<string, unknown>,
  context: McpContext,
): Promise<Record<string, unknown>> {
  const requested = Array.isArray(args.sections) ? new Set(args.sections.map(String)) : null;
  const sampleSize = typeof args.sampleSize === "number" ? Math.max(0, Math.min(20, args.sampleSize)) : 3;
  const granted = new Set<string>(context.principal.scopes);

  const summary: Record<string, unknown> = {};
  const skipped: string[] = [];

  for (const section of OVERVIEW_SECTIONS) {
    if (requested && !requested.has(section.key)) continue;
    const operation = operationById.get(section.operationId);
    if (!operation) continue;
    if (!granted.has(operation.scope)) {
      skipped.push(section.key);
      continue;
    }

    try {
      const response = await invokeOperation(operation, { limit: sampleSize }, context);
      const body = (await response.clone().json()) as { data?: unknown; pagination?: { total?: number } };
      if (!response.ok) {
        summary[section.key] = { etiqueta: section.label, error: `El módulo respondió ${response.status}.` };
        continue;
      }
      const rows = Array.isArray(body.data) ? body.data : [];
      summary[section.key] = {
        etiqueta: section.label,
        total: body.pagination?.total ?? rows.length,
        muestra: rows,
      };
    } catch (error) {
      // Que una sección falle no debe dejar al agente sin panorama: se informa
      // y se sigue con el resto.
      summary[section.key] = {
        etiqueta: section.label,
        error: error instanceof Error ? error.message : "No se pudo consultar la sección.",
      };
    }
  }

  const payload = {
    laboratorio: {
      id: context.principal.session.laboratoryId,
      nombre: context.principal.session.laboratoryName,
      perfil: context.principal.session.profileCode,
    },
    generadoEn: new Date().toISOString(),
    secciones: summary,
    seccionesSinAlcance: skipped,
  };

  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

function runWhoami(context: McpContext): Record<string, unknown> {
  const { client, session, scopes } = context.principal;
  const payload = {
    cliente: { id: client.id, nombre: client.name, clientId: client.clientId, sistema: client.systemKind },
    laboratorio: { id: session.laboratoryId, nombre: session.laboratoryName, perfil: session.profileCode },
    organizacionId: session.organizationId,
    alcances: scopes,
    permisosEfectivos: session.permissions ?? [],
    limitePorMinuto: client.rateLimitPerMinute,
    herramientasDisponibles: listTools(context.principal).map((tool) => tool.name),
  };
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

export async function callTool(
  name: string,
  args: Record<string, unknown>,
  context: McpContext,
): Promise<Record<string, unknown>> {
  if (name === WHOAMI_TOOL.name) return runWhoami(context);
  if (name === OVERVIEW_TOOL.name) return runOverview(args, context);

  const operationId = operationIdForTool(name);
  const operation = operationId ? operationById.get(operationId) : undefined;
  if (!operation) throw new McpToolError(`La herramienta '${name}' no existe en este servidor.`);

  // El alcance se comprueba aquí y no solo al listar: un cliente puede pedir una
  // herramienta que no vio en el listado, y la respuesta debe ser la misma que
  // daría el gateway REST.
  if (!context.principal.scopes.includes(operation.scope)) {
    throw new McpToolError(
      `Esta credencial no tiene el alcance '${operation.scope}' que requiere '${name}'.`,
    );
  }

  const response = await invokeOperation(operation, args, context);
  return resultFromResponse(response);
}

/** Operación del catálogo detrás de una herramienta, para la telemetría del endpoint. */
export function operationBehindTool(name: string): IntegrationOperation | undefined {
  const operationId = operationIdForTool(name);
  return operationId ? operationById.get(operationId) : undefined;
}
