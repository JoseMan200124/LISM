import {
  JSON_RPC_ERRORS,
  LATEST_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
  McpToolError,
  callTool,
  listTools,
  type JsonRpcId,
  type JsonRpcResponse,
  type McpContext,
} from "@/lib/mcp-server";

// Capa JSON-RPC 2.0 del servidor MCP. Se implementa aquí en vez de traer el SDK
// oficial porque el transporte "Streamable HTTP" en su modo de respuesta JSON es
// exactamente esto —un POST con un mensaje y una respuesta— mientras que el
// transporte del SDK está escrito contra el `req`/`res` de Node, que no es lo
// que recibe un route handler de Next. Adaptarlo habría costado más código del
// que hay en este archivo, y una dependencia más en la imagen de producción.

const INSTRUCTIONS = [
  "NexaLab es un sistema de gestión de laboratorio (LIMS). Este servidor da acceso a los módulos del",
  "laboratorio al que pertenece la credencial: inventario y reactivos controlados, equipos y sus",
  "mantenimientos, muestras, resultados, compras, cumplimiento regulatorio, incidencias, alertas,",
  "docencia, investigación, calidad y bitácora.",
  "",
  "Empieza por 'nexalab_whoami' para saber sobre qué laboratorio trabajas y qué te permite la credencial,",
  "y por 'nexalab_overview' cuando la pregunta sea sobre el estado general.",
  "",
  "Todo lo que escribas queda en la bitácora a nombre de la persona responsable de esta credencial y pasa",
  "por las mismas validaciones y permisos que la aplicación web. Las operaciones sobre reactivos",
  "controlados, resultados y firmas tienen consecuencias regulatorias: confirma con la persona usuaria",
  "antes de ejecutarlas.",
].join("\n");

function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: data === undefined ? { code, message } : { code, message, data } };
}

/**
 * Versión del protocolo que se devuelve en `initialize`.
 *
 * Se acepta la del cliente cuando la conocemos, para no forzar a un cliente
 * antiguo a hablar una versión que no entiende. Si no la conocemos se responde
 * la más reciente y es el cliente quien decide si continúa o corta.
 */
function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;
}

export type HandledMessage = {
  /** Respuesta a enviar, o null si el mensaje era una notificación. */
  response: JsonRpcResponse | null;
  /** Herramienta invocada, para la telemetría del endpoint. */
  toolName?: string;
};

export async function handleJsonRpcMessage(
  message: unknown,
  context: McpContext,
): Promise<HandledMessage> {
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return { response: jsonRpcError(null, JSON_RPC_ERRORS.invalidRequest, "El mensaje no es un objeto JSON-RPC.") };
  }

  const { jsonrpc, method, id, params } = message as {
    jsonrpc?: unknown; method?: unknown; id?: JsonRpcId; params?: unknown;
  };

  if (jsonrpc !== "2.0" || typeof method !== "string") {
    return {
      response: jsonRpcError(id ?? null, JSON_RPC_ERRORS.invalidRequest, "Falta 'jsonrpc: \"2.0\"' o 'method'."),
    };
  }

  // Una notificación no lleva `id` y, por definición del protocolo, no se
  // responde. Se acusa recibo con un 202 en el endpoint.
  const isNotification = id === undefined || id === null;
  const args = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "initialize":
      return {
        response: ok(id ?? null, {
          protocolVersion: negotiateVersion(args.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER_NAME, title: "NexaLab", version: SERVER_VERSION },
          instructions: INSTRUCTIONS,
        }),
      };

    case "ping":
      return { response: isNotification ? null : ok(id ?? null, {}) };

    case "notifications/initialized":
    case "notifications/cancelled":
    case "notifications/progress":
      return { response: null };

    case "tools/list":
      return {
        response: ok(id ?? null, {
          // El catálogo entero cabe en una respuesta: no se pagina para no
          // obligar a cada cliente a implementar el cursor.
          tools: listTools(context.principal),
        }),
      };

    case "tools/call": {
      const name = args.name;
      if (typeof name !== "string") {
        return { response: jsonRpcError(id ?? null, JSON_RPC_ERRORS.invalidParams, "Falta el nombre de la herramienta.") };
      }
      const toolArguments = (args.arguments ?? {}) as Record<string, unknown>;

      try {
        const result = await callTool(name, toolArguments, context);
        return { response: ok(id ?? null, result), toolName: name };
      } catch (error) {
        // Un fallo al ejecutar la herramienta es un resultado con `isError`, no
        // un error de protocolo: así el modelo lo lee, lo entiende y puede
        // corregir. Un error JSON-RPC, en cambio, muchos clientes lo tratan como
        // avería del servidor y abortan la conversación.
        const text = error instanceof Error ? error.message : "Error al ejecutar la herramienta.";
        if (!(error instanceof McpToolError)) {
          console.error(`[mcp] fallo en la herramienta ${name}:`, error);
        }
        return {
          response: ok(id ?? null, { content: [{ type: "text", text }], isError: true }),
          toolName: name,
        };
      }
    }

    default:
      if (isNotification) return { response: null };
      return {
        response: jsonRpcError(
          id ?? null,
          JSON_RPC_ERRORS.methodNotFound,
          `Este servidor no implementa '${method}'. Solo expone herramientas (tools/*).`,
        ),
      };
  }
}
