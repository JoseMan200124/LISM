import { INTEGRATION_CATALOG, type IntegrationOperationMeta } from "@/lib/integration-catalog";
import { INTEGRATION_SCOPES, scopeLabels, type IntegrationScope } from "@/lib/integration-scopes";

// Contrato publicado de la API, generado desde el mismo registro que atiende
// las llamadas. Escribirlo a mano habría garantizado que tarde o temprano
// mintiera; así, si una operación no existe, tampoco aparece en el documento.
//
// Se emiten DOS formatos porque el mundo real los pide distintos:
//
//   - OpenAPI 3.1: lo que consumen SAP, Azure API Management, Postman y
//     cualquier generador de clientes moderno.
//   - Swagger 2.0: lo ÚNICO que acepta el importador de conectores
//     personalizados de Power Apps y Power Automate. No es una preferencia
//     nuestra; es el límite de esa plataforma.

const API_TITLE = "NexaLab Integration API";
const API_VERSION = "1.0.0";

const DESCRIPTION = [
  "API de integración de NexaLab para conectar los módulos del laboratorio con",
  "sistemas externos: ERP, SAP, Power Apps, Power Automate y plataformas de",
  "integración.",
  "",
  "**Autenticación.** Toda llamada necesita una credencial emitida desde",
  "NexaLab (módulo Integraciones). Se puede presentar de dos formas:",
  "",
  "- Cabecera `X-API-Key: nxk_live_…` o `Authorization: Bearer nxk_live_…`.",
  "- Token OAuth2 de vida corta, pidiéndolo a `POST /api/v1/oauth/token` con",
  "  `grant_type=client_credentials`.",
  "",
  "**Alcance.** Cada credencial pertenece a un laboratorio y lleva scopes. Los",
  "permisos efectivos son la intersección de esos scopes con lo que puede el",
  "usuario responsable de la credencial: una integración nunca supera a una",
  "persona identificable, y todo lo que hace queda en la bitácora.",
  "",
  "**Empieza por** `GET /api/v1/me`: confirma la credencial y devuelve la lista",
  "exacta de operaciones disponibles para ella.",
].join("\n");

function tagsFrom(operations: IntegrationOperationMeta[]): Array<{ name: string; description: string }> {
  const seen = new Map<string, string>();
  for (const operation of operations) {
    if (!seen.has(operation.tag)) seen.set(operation.tag, `Operaciones del módulo ${operation.tag.toLowerCase()}.`);
  }
  return [...seen].map(([name, description]) => ({ name, description }));
}

/**
 * Los cuerpos se declaran como objeto abierto a propósito. Las entidades del
 * LIMS se validan con Zod en el handler nativo y varían por perfil de
 * laboratorio y por campos personalizados de cada institución: congelar aquí
 * una lista de propiedades produciría un contrato que miente en cuanto un
 * laboratorio añade un campo. El error de validación sí es explícito y dice
 * qué campo falta.
 */
const FREE_FORM_OBJECT = {
  type: "object" as const,
  additionalProperties: true,
  description: "Cuerpo de la entidad. Los campos aceptados se validan en el servidor; un 400 detalla cuáles faltan o son inválidos.",
};

function scopeDescriptions(): Record<string, string> {
  return Object.fromEntries(
    INTEGRATION_SCOPES.map((scope) => [scope, scopeLabels[scope as IntegrationScope]]),
  );
}

function pathParameters(operation: IntegrationOperationMeta, style: "v3" | "v2"): Array<Record<string, unknown>> {
  const parameters: Array<Record<string, unknown>> = [];

  if (operation.path.includes("{id}")) {
    const base = { name: "id", in: "path", required: true, description: "Identificador único del registro (UUID)." };
    parameters.push(style === "v3" ? { ...base, schema: { type: "string" } } : { ...base, type: "string" });
  }

  for (const query of operation.query ?? []) {
    const base = { name: query.name, in: "query", required: false, description: query.description };
    parameters.push(style === "v3" ? { ...base, schema: { type: "string" } } : { ...base, type: "string" });
  }

  return parameters;
}

const ERROR_SHAPE = {
  type: "object" as const,
  properties: {
    error: { type: "string", description: "Código estable del error, apto para ramificar en el cliente." },
    message: { type: "string", description: "Explicación legible del error." },
  },
};

const SUCCESS_SHAPE = {
  type: "object" as const,
  properties: {
    data: { description: "Registro o colección devuelta." },
    pagination: {
      type: "object",
      description: "Presente solo cuando se envían 'limit' u 'offset'.",
      properties: {
        total: { type: "integer" },
        offset: { type: "integer" },
        limit: { type: "integer" },
        returned: { type: "integer" },
      },
    },
  },
};

/** OpenAPI 3.1 — el documento principal. */
export function buildOpenApiDocument(baseUrl: string): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of INTEGRATION_CATALOG) {
    const item = (paths[operation.path] ??= {});
    item[operation.method.toLowerCase()] = {
      operationId: operation.operationId,
      summary: operation.summary,
      tags: [operation.tag],
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }, { OAuth2: [operation.scope] }],
      parameters: pathParameters(operation, "v3"),
      ...(operation.hasBody
        ? { requestBody: { required: true, content: { "application/json": { schema: FREE_FORM_OBJECT } } } }
        : {}),
      responses: {
        "200": { description: "Operación exitosa.", content: { "application/json": { schema: SUCCESS_SHAPE } } },
        "201": { description: "Registro creado.", content: { "application/json": { schema: SUCCESS_SHAPE } } },
        "400": { description: "Datos inválidos.", content: { "application/json": { schema: ERROR_SHAPE } } },
        "401": { description: "Credencial ausente o inválida.", content: { "application/json": { schema: ERROR_SHAPE } } },
        "403": { description: `Falta el alcance '${operation.scope}' o el permiso correspondiente.`, content: { "application/json": { schema: ERROR_SHAPE } } },
        "429": { description: "Se superó el límite de llamadas por minuto.", content: { "application/json": { schema: ERROR_SHAPE } } },
      },
    };
  }

  paths["/me"] = {
    get: {
      operationId: "integration.me",
      summary: "Verifica la credencial y lista sus operaciones disponibles.",
      tags: ["Diagnóstico"],
      security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
      responses: {
        "200": { description: "Credencial válida.", content: { "application/json": { schema: SUCCESS_SHAPE } } },
        "401": { description: "Credencial ausente o inválida.", content: { "application/json": { schema: ERROR_SHAPE } } },
      },
    },
  };

  paths["/oauth/token"] = {
    post: {
      operationId: "integration.oauth.token",
      summary: "Obtiene un token de acceso con client_credentials.",
      tags: ["Diagnóstico"],
      security: [],
      requestBody: {
        required: true,
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              required: ["grant_type", "client_id", "client_secret"],
              properties: {
                grant_type: { type: "string", enum: ["client_credentials"] },
                client_id: { type: "string" },
                client_secret: { type: "string" },
              },
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Token emitido.",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  access_token: { type: "string" },
                  token_type: { type: "string" },
                  expires_in: { type: "integer" },
                  scope: { type: "string" },
                },
              },
            },
          },
        },
        "401": { description: "Credenciales inválidas.", content: { "application/json": { schema: ERROR_SHAPE } } },
      },
    },
  };

  return {
    openapi: "3.1.0",
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description: DESCRIPTION,
      contact: { name: "NexaLab", url: baseUrl },
    },
    servers: [{ url: `${baseUrl}/api/v1`, description: "Servidor de la institución" }],
    tags: [...tagsFrom(INTEGRATION_CATALOG), { name: "Diagnóstico", description: "Verificación de credenciales y emisión de tokens." }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "X-API-Key", description: "Clave de integración emitida en NexaLab." },
        BearerAuth: { type: "http", scheme: "bearer", description: "La misma clave, o un token OAuth2 de vida corta." },
        OAuth2: {
          type: "oauth2",
          flows: {
            clientCredentials: {
              tokenUrl: `${baseUrl}/api/v1/oauth/token`,
              scopes: scopeDescriptions(),
            },
          },
        },
      },
    },
    paths,
  };
}

/**
 * Swagger 2.0 para el importador de conectores personalizados de Power Apps y
 * Power Automate.
 *
 * Diferencias que impone esa plataforma y que aquí se respetan: host y
 * basePath separados en vez de `servers`, el cuerpo como parámetro `in: body`
 * en vez de `requestBody`, y un único esquema de seguridad de tipo apiKey —
 * el selector de conexión de Power Apps pide una sola clave, que es
 * exactamente lo que el usuario final pega al crear la conexión.
 */
export function buildSwagger2Document(host: string, scheme: "https" | "http"): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const operation of INTEGRATION_CATALOG) {
    const item = (paths[operation.path] ??= {});
    const parameters = pathParameters(operation, "v2");
    if (operation.hasBody) {
      parameters.push({ name: "body", in: "body", required: true, schema: FREE_FORM_OBJECT });
    }

    item[operation.method.toLowerCase()] = {
      operationId: operation.operationId,
      summary: operation.summary,
      // Power Apps muestra la descripción al usuario que arma el flujo; repetir
      // el resumen es preferible a dejarla vacía, que la plataforma marca.
      description: `${operation.summary} Requiere el alcance '${operation.scope}'.`,
      tags: [operation.tag],
      consumes: operation.hasBody ? ["application/json"] : undefined,
      produces: ["application/json"],
      parameters,
      responses: {
        "200": { description: "Operación exitosa.", schema: SUCCESS_SHAPE },
        "201": { description: "Registro creado.", schema: SUCCESS_SHAPE },
        "400": { description: "Datos inválidos.", schema: ERROR_SHAPE },
        "401": { description: "Credencial ausente o inválida.", schema: ERROR_SHAPE },
        "403": { description: "Alcance o permiso insuficiente.", schema: ERROR_SHAPE },
        "429": { description: "Límite de llamadas superado.", schema: ERROR_SHAPE },
      },
    };
  }

  paths["/me"] = {
    get: {
      operationId: "integration.me",
      summary: "Verifica la credencial.",
      description: "Confirma que la clave funciona y devuelve el laboratorio y los alcances concedidos.",
      tags: ["Diagnóstico"],
      produces: ["application/json"],
      parameters: [],
      responses: {
        "200": { description: "Credencial válida.", schema: SUCCESS_SHAPE },
        "401": { description: "Credencial inválida.", schema: ERROR_SHAPE },
      },
    },
  };

  return {
    swagger: "2.0",
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description: DESCRIPTION,
    },
    host,
    basePath: "/api/v1",
    schemes: [scheme],
    consumes: ["application/json"],
    produces: ["application/json"],
    securityDefinitions: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "Clave de integración emitida en NexaLab (módulo Integraciones).",
      },
    },
    security: [{ ApiKeyAuth: [] }],
    tags: [...tagsFrom(INTEGRATION_CATALOG), { name: "Diagnóstico", description: "Verificación de credenciales." }],
    paths,
  };
}
