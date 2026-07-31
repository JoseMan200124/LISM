import crypto from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";
import {
  INTEGRATION_SCOPES,
  normalizeScopes,
  permissionsForScopes,
  isIntegrationScope,
} from "@/lib/integration-scopes";
import { matchesEventPattern } from "@/lib/integration-events";
import { validateWebhookTarget, sanitizeCustomHeaders } from "@/lib/integration-admin";
import { consumeRateLimit, resetRateLimits } from "@/lib/integration-telemetry";
import { matchOperation, allowedMethodsFor, INTEGRATION_OPERATIONS } from "@/lib/integration-registry";
import { INTEGRATION_CATALOG, matchOperationMeta } from "@/lib/integration-catalog";
import { buildOpenApiDocument, buildSwagger2Document } from "@/lib/integration-openapi";
import { generateApiCredentials, hashApiKey, API_KEY_LIVE_PREFIX, readPresentedCredential } from "@/lib/integration-auth";
import { signWebhookPayload } from "@/lib/integration-webhooks";

describe("alcances de integración", () => {
  it("un alcance de escritura incluye siempre su lectura", () => {
    expect(permissionsForScopes(["inventory:write"])).toContain("inventory.view");
    expect(permissionsForScopes(["purchasing:write"])).toContain("purchasing.view");
  });

  it("descarta alcances inventados sin romper los válidos", () => {
    expect(normalizeScopes(["inventory:read", "inventory:destroy", 42])).toEqual(["inventory:read"]);
    expect(isIntegrationScope("inventory:destroy")).toBe(false);
  });

  it("no concede ningún permiso cuando no hay alcances", () => {
    expect(permissionsForScopes([])).toEqual([]);
  });

  it("todo alcance del catálogo abre al menos un permiso", () => {
    for (const scope of INTEGRATION_SCOPES) {
      expect(permissionsForScopes([scope]).length).toBeGreaterThan(0);
    }
  });
});

describe("resolución de rutas del gateway", () => {
  it("prefiere la ruta concreta sobre la que lleva identificador", () => {
    // Sin este desempate, /inventory/movements se resolvería como el artículo
    // cuyo id es "movements" y el ERP recibiría la entidad equivocada.
    const matched = matchOperation("GET", ["inventory", "movements"]);
    expect(matched?.operation.operationId).toBe("inventory.movements.list");
    expect(matched?.id).toBeNull();
  });

  it("extrae el identificador de la ruta", () => {
    const matched = matchOperation("GET", ["inventory", "items", "abc-123"]);
    expect(matched?.operation.operationId).toBe("inventory.items.get");
    expect(matched?.id).toBe("abc-123");
  });

  it("distingue el método", () => {
    expect(matchOperation("POST", ["inventory", "items"])?.operation.operationId).toBe("inventory.items.create");
    expect(matchOperation("GET", ["inventory", "items"])?.operation.operationId).toBe("inventory.items.list");
  });

  it("devuelve nada para rutas desconocidas", () => {
    expect(matchOperation("GET", ["no", "existe"])).toBeNull();
  });

  it("informa qué métodos acepta una ruta existente", () => {
    const allowed = allowedMethodsFor(["inventory", "items"]);
    expect(allowed).toContain("GET");
    expect(allowed).toContain("POST");
    expect(allowed).not.toContain("DELETE");
  });

  it("no hay dos operaciones con el mismo identificador", () => {
    const ids = INTEGRATION_OPERATIONS.map((operation) => operation.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no hay dos operaciones con el mismo método y ruta", () => {
    const keys = INTEGRATION_OPERATIONS.map((operation) => `${operation.method} ${operation.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("catálogo y handlers no se desincronizan", () => {
  // El contrato (lib/integration-catalog.ts) y los handlers
  // (lib/integration-registry.ts) viven en archivos distintos para que la
  // documentación pública no arrastre el servidor. El precio de esa separación
  // es que podrían divergir; esto lo impide.
  it("toda operación del catálogo tiene handler", () => {
    expect(INTEGRATION_OPERATIONS.length).toBe(INTEGRATION_CATALOG.length);
    for (const meta of INTEGRATION_CATALOG) {
      const operation = INTEGRATION_OPERATIONS.find((item) => item.operationId === meta.operationId);
      expect(operation, meta.operationId).toBeDefined();
      expect(typeof operation?.invoke, meta.operationId).toBe("function");
    }
  });

  it("el registro no inventa operaciones que el contrato no publica", () => {
    const publicados = new Set(INTEGRATION_CATALOG.map((meta) => meta.operationId));
    for (const operation of INTEGRATION_OPERATIONS) {
      expect(publicados.has(operation.operationId), operation.operationId).toBe(true);
    }
  });

  it("el enrutado da el mismo resultado con y sin handlers", () => {
    const conHandler = matchOperation("GET", ["inventory", "items", "abc"]);
    const soloMeta = matchOperationMeta("GET", ["inventory", "items", "abc"]);
    expect(conHandler?.operation.operationId).toBe(soloMeta?.operation.operationId);
    expect(conHandler?.id).toBe(soloMeta?.id);
  });
});

describe("credenciales", () => {
  it("genera un secreto con el prefijo esperado y guarda solo su huella", () => {
    const credentials = generateApiCredentials();
    expect(credentials.secret.startsWith(API_KEY_LIVE_PREFIX)).toBe(true);
    expect(credentials.keyHash).toBe(hashApiKey(credentials.secret));
    expect(credentials.keyHash).not.toContain(credentials.secret);
    expect(credentials.keyPrefix.length).toBeLessThan(credentials.secret.length);
  });

  it("no repite secretos", () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateApiCredentials().secret));
    expect(secrets.size).toBe(50);
  });

  it("lee la credencial de cualquiera de las cabeceras aceptadas", () => {
    expect(readPresentedCredential(new Headers({ "x-api-key": "nxk_live_abc" })))
      .toEqual({ kind: "key", value: "nxk_live_abc" });
    expect(readPresentedCredential(new Headers({ authorization: "Bearer nxk_live_abc" })))
      .toEqual({ kind: "key", value: "nxk_live_abc" });
    // Lo que no empieza por el prefijo de clave se trata como token OAuth2.
    expect(readPresentedCredential(new Headers({ authorization: "Bearer eyJhbGciOi" })))
      .toEqual({ kind: "token", value: "eyJhbGciOi" });
    expect(readPresentedCredential(new Headers())).toBeNull();
  });
});

describe("eventos de webhook", () => {
  it("acepta comodín total y por prefijo", () => {
    expect(matchesEventPattern("*", "INVENTORY_ITEM_CREATED")).toBe(true);
    expect(matchesEventPattern("INVENTORY_*", "INVENTORY_ITEM_CREATED")).toBe(true);
    expect(matchesEventPattern("INVENTORY_*", "PURCHASE_REQUEST_CREATED")).toBe(false);
  });

  it("hace coincidencia exacta cuando no hay comodín", () => {
    expect(matchesEventPattern("INVENTORY_ITEM_CREATED", "INVENTORY_ITEM_CREATED")).toBe(true);
    expect(matchesEventPattern("INVENTORY_ITEM_CREATED", "INVENTORY_ITEM_DISCARDED")).toBe(false);
  });

  it("ignora un patrón vacío", () => {
    expect(matchesEventPattern("", "INVENTORY_ITEM_CREATED")).toBe(false);
  });

  it("firma de forma verificable por el receptor", () => {
    const secret = "nxw_secreto_de_pruebas";
    const timestamp = "1753900000";
    const body = JSON.stringify({ type: "INVENTORY_ITEM_CREATED" });
    const signature = signWebhookPayload(secret, timestamp, body);
    const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
    expect(signature).toBe(expected);
  });
});

describe("destino de los webhooks", () => {
  it("acepta un destino público por HTTPS", () => {
    expect(validateWebhookTarget("https://erp.institucion.com/hooks").ok).toBe(true);
  });

  it("rechaza HTTP en claro", () => {
    expect(validateWebhookTarget("http://erp.institucion.com/hooks").ok).toBe(false);
  });

  it("rechaza direcciones internas y de metadatos de la nube", () => {
    // Sin este filtro, un webhook sería una vía para leer las credenciales de
    // la instancia desde el propio servidor de NexaLab.
    for (const url of [
      "https://169.254.169.254/metadata",
      "https://localhost/hooks",
      "https://127.0.0.1/hooks",
      "https://10.0.0.5/hooks",
      "https://192.168.1.10/hooks",
      "https://172.16.4.4/hooks",
      "https://metadata.google.internal/x",
    ]) {
      expect(validateWebhookTarget(url).ok, url).toBe(false);
    }
  });

  it("rechaza lo que no es una URL", () => {
    expect(validateWebhookTarget("no-es-una-url").ok).toBe(false);
  });

  it("no deja sobrescribir las cabeceras de firma", () => {
    const headers = sanitizeCustomHeaders({
      "x-nexalab-signature": "falsificada",
      "content-type": "text/plain",
      "x-erp-tenant": "acme",
    });
    expect(headers).toEqual({ "x-erp-tenant": "acme" });
  });
});

describe("límite de llamadas", () => {
  beforeEach(() => resetRateLimits());

  it("deja pasar hasta el límite y luego frena", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(consumeRateLimit("cliente-a", 3).allowed).toBe(true);
    }
    expect(consumeRateLimit("cliente-a", 3).allowed).toBe(false);
  });

  it("cuenta por credencial, no de forma global", () => {
    expect(consumeRateLimit("cliente-b", 1).allowed).toBe(true);
    expect(consumeRateLimit("cliente-b", 1).allowed).toBe(false);
    expect(consumeRateLimit("cliente-c", 1).allowed).toBe(true);
  });
});

describe("contrato publicado", () => {
  it("describe todas las operaciones del registro en OpenAPI 3.1", () => {
    const document = buildOpenApiDocument("https://lab.example.com") as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(document.openapi).toBe("3.1.0");
    for (const operation of INTEGRATION_OPERATIONS) {
      expect(document.paths[operation.path]?.[operation.method.toLowerCase()], operation.operationId).toBeDefined();
    }
  });

  it("emite Swagger 2.0 con la seguridad que exige Power Apps", () => {
    const document = buildSwagger2Document("lab.example.com", "https") as {
      swagger: string;
      basePath: string;
      securityDefinitions: Record<string, { type: string; in: string; name: string }>;
      paths: Record<string, Record<string, unknown>>;
    };
    // El importador de conectores personalizados solo admite Swagger 2.0.
    expect(document.swagger).toBe("2.0");
    expect(document.basePath).toBe("/api/v1");
    expect(document.securityDefinitions.ApiKeyAuth).toMatchObject({ type: "apiKey", in: "header", name: "X-API-Key" });
    for (const operation of INTEGRATION_OPERATIONS) {
      expect(document.paths[operation.path]?.[operation.method.toLowerCase()], operation.operationId).toBeDefined();
    }
  });

  it("declara el cuerpo como parámetro body en Swagger 2.0", () => {
    const document = buildSwagger2Document("lab.example.com", "https") as {
      paths: Record<string, Record<string, { parameters?: Array<{ in: string }> }>>;
    };
    const create = document.paths["/inventory/items"].post;
    expect(create.parameters?.some((parameter) => parameter.in === "body")).toBe(true);
  });

  it("toda operación exige un alcance declarado", () => {
    for (const operation of INTEGRATION_OPERATIONS) {
      expect(INTEGRATION_SCOPES, operation.operationId).toContain(operation.scope);
    }
  });
});
