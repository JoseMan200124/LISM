import { INTEGRATION_CATALOG, type IntegrationOperationMeta } from "@/lib/integration-catalog";
import { bodySchemaFor } from "@/lib/mcp-body-schemas";
import type { IntegrationScope } from "@/lib/integration-scopes";

// Traducción del catálogo de integración a herramientas MCP.
//
// Es el mismo contrato que consume el ERP por /api/v1, expuesto en el
// vocabulario que entiende un modelo de lenguaje. No hay una segunda lista de
// operaciones: si algo no está en lib/integration-catalog.ts, no existe aquí, y
// una operación nueva aparece en el MCP el mismo día que en la API REST.
//
// La única diferencia real de contenido está en los cuerpos: aquí se publica su
// forma exacta (ver lib/mcp-body-schemas.ts), porque un modelo no puede
// descubrirla probando como haría una persona.

export const TOOL_PREFIX = "nexalab_";

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: Record<string, unknown>;
};

/**
 * `inventory.items.create` → `nexalab_inventory_items_create`.
 *
 * Los puntos se cambian por guiones bajos porque varios clientes MCP restringen
 * los nombres a `[A-Za-z0-9_-]`. El prefijo evita que, en un cliente con varios
 * servidores conectados, `equipment_list` sea ambiguo.
 */
export function toolNameFor(operationId: string): string {
  return `${TOOL_PREFIX}${operationId.replace(/\./g, "_")}`;
}

const operationIdByToolName = new Map<string, string>(
  INTEGRATION_CATALOG.map((operation) => [toolNameFor(operation.operationId), operation.operationId]),
);

export function operationIdForTool(toolName: string): string | undefined {
  return operationIdByToolName.get(toolName);
}

/**
 * Texto que lee el modelo para decidir si esta es la herramienta que necesita.
 *
 * Incluye método y ruta a propósito: cuando algo falla, el usuario ve en la
 * traza el mismo `POST /inventory/movements` que aparece en la bitácora y en la
 * documentación de la API, y puede reproducirlo con curl.
 */
function describe(operation: IntegrationOperationMeta): string {
  const lines = [
    operation.summary,
    `Módulo: ${operation.tag}. Equivale a ${operation.method} /api/v1${operation.path} y requiere el alcance '${operation.scope}'.`,
  ];
  if (operation.method === "GET" && (operation.query ?? []).some((q) => q.name === "limit")) {
    lines.push("Admite 'limit' y 'offset' para no traer la colección entera.");
  }
  return lines.join("\n");
}

function inputSchemaFor(operation: IntegrationOperationMeta): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  if (operation.path.includes("{id}")) {
    properties.id = {
      type: "string",
      description: "Identificador único (UUID) del registro sobre el que se opera.",
    };
    required.push("id");
  }

  for (const query of operation.query ?? []) {
    properties[query.name] = { type: "string", description: query.description };
  }

  if (operation.hasBody) {
    // El cuerpo va anidado en vez de aplanado sobre `id` y los parámetros de
    // consulta: varias entidades tienen campos propios llamados `id` o `limit`,
    // y aplanarlos haría que el modelo sobreescribiera sin darse cuenta cuál de
    // los dos estaba rellenando.
    properties.body = bodySchemaFor(operation.operationId);
    required.push("body");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/**
 * Pistas de comportamiento del estándar MCP. Los clientes las usan para decidir
 * qué pueden encadenar sin preguntar y qué merece una confirmación del usuario:
 * marcar bien lo que escribe es lo que evita que un agente registre un consumo
 * de reactivo controlado sin que nadie lo haya pedido.
 */
function annotationsFor(operation: IntegrationOperationMeta): Record<string, unknown> {
  const readOnly = operation.method === "GET";
  return {
    title: operation.summary,
    readOnlyHint: readOnly,
    destructiveHint: operation.method === "DELETE",
    idempotentHint: ["GET", "PUT", "DELETE"].includes(operation.method),
    // Todo ocurre dentro del laboratorio de la credencial: no hay efectos sobre
    // sistemas de terceros.
    openWorldHint: false,
  };
}

export function toolForOperation(operation: IntegrationOperationMeta): McpToolDefinition {
  return {
    name: toolNameFor(operation.operationId),
    title: operation.summary,
    description: describe(operation),
    inputSchema: inputSchemaFor(operation),
    annotations: annotationsFor(operation),
  };
}

/**
 * Herramientas visibles para una credencial.
 *
 * El filtrado por alcance no es cosmético: si la credencial no puede escribir en
 * inventario, esa herramienta no aparece en el listado. El modelo no pierde
 * turnos intentando algo que terminaría en 403, y el usuario no ve al agente
 * proponer acciones que su integración tiene prohibidas.
 */
export function toolsForScopes(scopes: readonly IntegrationScope[]): McpToolDefinition[] {
  const granted = new Set<string>(scopes);
  return INTEGRATION_CATALOG.filter((operation) => granted.has(operation.scope)).map(toolForOperation);
}
