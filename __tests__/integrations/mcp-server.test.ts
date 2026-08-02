import { describe, expect, it } from "vitest";
import { INTEGRATION_CATALOG } from "@/lib/integration-catalog";
import { INTEGRATION_SCOPES, type IntegrationScope } from "@/lib/integration-scopes";
import { bodySchemaFor, operationsWithDeclaredBody } from "@/lib/mcp-body-schemas";
import { toolNameFor, operationIdForTool, toolsForScopes, toolForOperation } from "@/lib/mcp-tools";
import { handleJsonRpcMessage } from "@/lib/mcp-protocol";
import {
  LATEST_PROTOCOL_VERSION,
  listTools,
  overviewSectionOperationIds,
  type McpContext,
} from "@/lib/mcp-server";
import type { UserSession } from "@/lib/session";

function principal(scopes: IntegrationScope[]) {
  const session: UserSession = {
    userId: "user-1",
    name: "Responsable",
    email: "responsable@example.test",
    role: "ANALYST",
    organizationId: "org-1",
    laboratoryId: "lab-1",
    laboratoryName: "Laboratorio de pruebas",
    profileCode: "PHARMA_QC",
    sessionMode: "database",
    permissions: ["inventory.view"],
  };
  return {
    client: {
      id: "client-1",
      organizationId: "org-1",
      laboratoryId: "lab-1",
      name: "Asistente",
      systemKind: "GENERIC",
      clientId: "nxc_test",
      scopes,
      actorUserId: "user-1",
      rateLimitPerMinute: 120,
      status: "ACTIVE",
      expiresAt: null,
    },
    session,
    scopes,
  };
}

function context(scopes: IntegrationScope[]): McpContext {
  return {
    principal: principal(scopes),
    origin: "https://nexalab.test",
    userAgent: "vitest",
    forwardedFor: null,
  };
}

describe("catálogo de herramientas MCP", () => {
  it("publica una herramienta por cada operación del catálogo de integración", () => {
    const tools = toolsForScopes(INTEGRATION_SCOPES as unknown as IntegrationScope[]);
    expect(tools).toHaveLength(INTEGRATION_CATALOG.length);
  });

  it("usa nombres que todo cliente MCP acepta y que caben en el límite de la API", () => {
    for (const operation of INTEGRATION_CATALOG) {
      const name = toolNameFor(operation.operationId);
      expect(name).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(name.length).toBeLessThanOrEqual(64);
    }
  });

  it("puede volver del nombre de la herramienta a la operación que la atiende", () => {
    for (const operation of INTEGRATION_CATALOG) {
      expect(operationIdForTool(toolNameFor(operation.operationId))).toBe(operation.operationId);
    }
  });

  it("oculta las herramientas cuyo alcance no tiene la credencial", () => {
    const tools = toolsForScopes(["inventory:read"]);
    const names = tools.map((tool) => tool.name);

    expect(names).toContain("nexalab_inventory_items_list");
    expect(names).not.toContain("nexalab_inventory_items_create");
    expect(names).not.toContain("nexalab_equipment_list");
  });

  it("exige el identificador en las operaciones cuya ruta lo lleva", () => {
    const operation = INTEGRATION_CATALOG.find((op) => op.operationId === "inventory.items.get");
    const schema = toolForOperation(operation!).inputSchema as { required: string[]; properties: Record<string, unknown> };

    expect(schema.required).toContain("id");
    expect(schema.properties.id).toBeDefined();
  });

  it("marca como solo lectura las consultas y como escritura el resto", () => {
    const list = toolForOperation(INTEGRATION_CATALOG.find((op) => op.operationId === "inventory.items.list")!);
    const create = toolForOperation(INTEGRATION_CATALOG.find((op) => op.operationId === "inventory.items.create")!);

    expect(list.annotations.readOnlyHint).toBe(true);
    expect(create.annotations.readOnlyHint).toBe(false);
  });
});

describe("forma publicada de los cuerpos", () => {
  it("declara el esquema real de TODA operación que acepta cuerpo", () => {
    // Esta es la prueba que evita que el servidor MCP se degrade con el tiempo:
    // si alguien añade una operación de escritura al catálogo y no enlaza su
    // esquema Zod, el modelo tendría que adivinar los campos. Falla aquí.
    const withBody = INTEGRATION_CATALOG.filter((operation) => operation.hasBody).map((op) => op.operationId);
    const declared = new Set(operationsWithDeclaredBody());
    const missing = withBody.filter((operationId) => !declared.has(operationId));

    expect(missing).toEqual([]);
  });

  it("describe los campos que el handler valida de verdad", () => {
    // Los campos salen del mismo Zod que corre en producción, no de una copia.
    const schema = bodySchemaFor("equipment.events.create") as {
      properties: Record<string, unknown>;
      required?: string[];
    };

    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(["equipmentId", "eventType", "details"]),
    );
    expect(schema.required).toEqual(expect.arrayContaining(["equipmentId", "eventType", "details"]));
  });

  it("publica los valores admitidos de un campo enumerado", () => {
    const schema = bodySchemaFor("equipment.events.create") as {
      properties: { eventType?: { enum?: string[] } };
    };

    expect(schema.properties.eventType?.enum).toEqual(
      expect.arrayContaining(["VERIFICATION", "MAINTENANCE", "CALIBRATION"]),
    );
  });

  it("traduce las operaciones por acción a una lista de alternativas", () => {
    // research.projects.update es una unión discriminada por `action`: el modelo
    // debe poder ver qué acciones existen sin ejecutar ninguna.
    const schema = bodySchemaFor("research.projects.update") as { oneOf?: Array<Record<string, unknown>> };
    expect(Array.isArray(schema.oneOf)).toBe(true);
    expect((schema.oneOf ?? []).length).toBeGreaterThan(1);
  });

  it("no arrastra '$schema' dentro del esquema de la herramienta", () => {
    for (const operationId of operationsWithDeclaredBody()) {
      expect(bodySchemaFor(operationId)).not.toHaveProperty("$schema");
    }
  });

  it("devuelve un objeto abierto para una operación sin esquema declarado", () => {
    const schema = bodySchemaFor("operacion.que.no.existe") as { additionalProperties?: boolean };
    expect(schema.additionalProperties).toBe(true);
  });
});

describe("panorama del laboratorio", () => {
  it("apunta solo a operaciones que existen en el catálogo", () => {
    // Un identificador mal escrito no rompe nada: la sección simplemente
    // desaparece del panorama sin decirlo, y el agente concluye que el
    // laboratorio no tiene compras. Se detecta aquí o no se detecta.
    const known = new Set(INTEGRATION_CATALOG.map((operation) => operation.operationId));
    const unknown = overviewSectionOperationIds().filter((operationId) => !known.has(operationId));

    expect(unknown).toEqual([]);
  });

  it("solo compone operaciones de lectura", () => {
    const byId = new Map(INTEGRATION_CATALOG.map((operation) => [operation.operationId, operation]));
    for (const operationId of overviewSectionOperationIds()) {
      expect(byId.get(operationId)?.method).toBe("GET");
    }
  });
});

describe("protocolo JSON-RPC", () => {
  const ctx = context(["inventory:read"]);

  it("responde a initialize con la versión que pide el cliente cuando la conoce", async () => {
    const { response } = await handleJsonRpcMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      ctx,
    );
    const result = response?.result as { protocolVersion: string; serverInfo: { name: string } };

    expect(result.protocolVersion).toBe("2025-03-26");
    expect(result.serverInfo.name).toBe("nexalab");
  });

  it("cae en la versión más reciente si la del cliente es desconocida", async () => {
    const { response } = await handleJsonRpcMessage(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      ctx,
    );
    expect((response?.result as { protocolVersion: string }).protocolVersion).toBe(LATEST_PROTOCOL_VERSION);
  });

  it("no responde a una notificación", async () => {
    const { response } = await handleJsonRpcMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx);
    expect(response).toBeNull();
  });

  it("lista las herramientas del alcance más las dos propias del servidor", async () => {
    const { response } = await handleJsonRpcMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, ctx);
    const tools = (response?.result as { tools: Array<{ name: string }> }).tools;

    expect(tools.map((tool) => tool.name)).toContain("nexalab_whoami");
    expect(tools.map((tool) => tool.name)).toContain("nexalab_overview");
    expect(tools).toHaveLength(listTools(ctx.principal).length);
  });

  it("rechaza un mensaje que no es JSON-RPC 2.0", async () => {
    const { response } = await handleJsonRpcMessage({ id: 3, method: "tools/list" }, ctx);
    expect(response?.error?.code).toBe(-32600);
  });

  it("informa de que no implementa métodos fuera de herramientas", async () => {
    const { response } = await handleJsonRpcMessage({ jsonrpc: "2.0", id: 4, method: "resources/list" }, ctx);
    expect(response?.error?.code).toBe(-32601);
  });

  it("responde a whoami con el laboratorio y los alcances de la credencial", async () => {
    const { response } = await handleJsonRpcMessage(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "nexalab_whoami", arguments: {} } },
      ctx,
    );
    const payload = JSON.parse((response?.result as { content: Array<{ text: string }> }).content[0].text);

    expect(payload.laboratorio.id).toBe("lab-1");
    expect(payload.alcances).toEqual(["inventory:read"]);
  });

  it("devuelve el fallo de una herramienta como resultado, no como error de protocolo", async () => {
    // Un error de protocolo hace que muchos clientes corten la conversación;
    // un resultado con isError deja que el modelo lea el motivo y corrija.
    const { response } = await handleJsonRpcMessage(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "nexalab_inexistente", arguments: {} } },
      ctx,
    );

    expect(response?.error).toBeUndefined();
    expect((response?.result as { isError: boolean }).isError).toBe(true);
  });

  it("no deja invocar una herramienta fuera del alcance de la credencial", async () => {
    const { response } = await handleJsonRpcMessage(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "nexalab_inventory_items_create", arguments: { body: {} } },
      },
      ctx,
    );
    const result = response?.result as { isError: boolean; content: Array<{ text: string }> };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("inventory:write");
  });
});
