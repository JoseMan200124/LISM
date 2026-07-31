import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { getSql, hasDatabase } from "@/lib/db";
import type { UserSession } from "@/lib/session";
import type { PermissionKey } from "@/lib/authorization";
import { listUserLaboratories } from "@/lib/lab-membership";
import { normalizeScopes, permissionsForScopes, type IntegrationScope } from "@/lib/integration-scopes";

// Autenticación del gateway /api/v1. Dos formas de presentar la MISMA
// credencial, porque los sistemas que se conectan no se parecen entre sí:
//
//   - Clave directa: `Authorization: Bearer nxk_live_…` o `X-API-Key: nxk_live_…`.
//     Es lo que entiende un conector personalizado de Power Apps, un iPaaS y
//     cualquier ERP que solo sepa poner una cabecera fija.
//   - OAuth2 client_credentials: POST /api/v1/oauth/token devuelve un token de
//     vida corta. Es lo que exigen SAP BTP y las plataformas corporativas que
//     no permiten guardar un secreto permanente en el cliente.
//
// Ambas terminan en la misma UserSession de servicio y pasan por los mismos
// permisos. El segundo camino no concede nada que el primero no conceda.

export const API_KEY_HEADER = "x-api-key";
export const API_KEY_LIVE_PREFIX = "nxk_live_";
export const CLIENT_ID_PREFIX = "nxc_";
const ACCESS_TOKEN_TTL_SECONDS = 3600;
// Marca el JWT como token de integración. Los de sesión web no la llevan.
const INTEGRATION_TOKEN_TYPE = "nexalab.integration.v1";

export type ApiClientRecord = {
  id: string;
  organizationId: string;
  laboratoryId: string;
  name: string;
  systemKind: string;
  clientId: string;
  scopes: IntegrationScope[];
  actorUserId: string | null;
  rateLimitPerMinute: number;
  status: string;
  expiresAt: string | null;
};

export type IntegrationPrincipal = {
  client: ApiClientRecord;
  session: UserSession;
  scopes: IntegrationScope[];
};

export type AuthFailure = {
  error:
    | "missing_credentials"
    | "invalid_credentials"
    | "revoked"
    | "expired"
    | "no_actor"
    | "actor_without_access"
    | "unconfigured";
  message: string;
};

/**
 * Secreto de firma de los tokens OAuth2, derivado del de sesión pero distinto.
 * Que sean distintos es intencional: impide que un token de integración se
 * pueda pegar en la cookie de sesión web (o al revés) y ser aceptado. Sin esta
 * derivación, la firma sería la misma y ambos mundos serían intercambiables.
 */
function accessTokenSecret(): Uint8Array {
  const base = process.env.SESSION_SECRET || "nexalab-demo-session-secret-change-before-production";
  return new Uint8Array(crypto.createHmac("sha256", base).update(INTEGRATION_TOKEN_TYPE).digest());
}

export function hashApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret.trim()).digest("hex");
}

/** Genera una credencial nueva. El secreto solo existe aquí y en la respuesta. */
export function generateApiCredentials(): { clientId: string; secret: string; keyPrefix: string; keyHash: string } {
  const clientId = `${CLIENT_ID_PREFIX}${crypto.randomBytes(12).toString("hex")}`;
  const secret = `${API_KEY_LIVE_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  return {
    clientId,
    secret,
    // Suficiente para reconocer la credencial en una lista, muy lejos de
    // permitir adivinar el resto.
    keyPrefix: secret.slice(0, 16),
    keyHash: hashApiKey(secret),
  };
}

export function generateWebhookSecret(): string {
  return `nxw_${crypto.randomBytes(24).toString("base64url")}`;
}

function rowToClient(row: Record<string, unknown>): ApiClientRecord {
  const rawScopes = row.scopes;
  const scopes = Array.isArray(rawScopes)
    ? normalizeScopes(rawScopes)
    : typeof rawScopes === "string"
      ? normalizeScopes(JSON.parse(rawScopes) as unknown[])
      : [];
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    laboratoryId: String(row.laboratory_id),
    name: String(row.name),
    systemKind: String(row.system_kind ?? "GENERIC"),
    clientId: String(row.client_id),
    scopes,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    rateLimitPerMinute: Number(row.rate_limit_per_minute ?? 120),
    status: String(row.status),
    expiresAt: row.expires_at ? new Date(row.expires_at as string).toISOString() : null,
  };
}

async function findClientByHash(keyHash: string): Promise<ApiClientRecord | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, organization_id, laboratory_id, name, system_kind, client_id, scopes,
           actor_user_id, rate_limit_per_minute, status, expires_at
    FROM api_clients
    WHERE key_hash = ${keyHash}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? rowToClient(row) : null;
}

async function findClientById(id: string): Promise<ApiClientRecord | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, organization_id, laboratory_id, name, system_kind, client_id, scopes,
           actor_user_id, rate_limit_per_minute, status, expires_at
    FROM api_clients
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? rowToClient(row) : null;
}

/**
 * Sesión de servicio de la credencial.
 *
 * El corazón del modelo de seguridad: los permisos son la intersección de lo
 * que el usuario responsable puede hacer HOY en ese laboratorio con lo que
 * abren los scopes concedidos. De ahí salen las dos garantías que hacen esto
 * defendible ante un auditor: una integración nunca supera a una persona
 * identificable, y revocarle el acceso a esa persona apaga la integración.
 */
async function buildClientSession(client: ApiClientRecord): Promise<{ session: UserSession } | { failure: AuthFailure }> {
  if (!client.actorUserId) {
    return { failure: { error: "no_actor", message: "La credencial no tiene un usuario responsable asignado." } };
  }

  const laboratories = await listUserLaboratories(client.actorUserId);
  const laboratory = laboratories.find((item) => item.laboratoryId === client.laboratoryId);
  if (!laboratory) {
    return {
      failure: {
        error: "actor_without_access",
        message: "El usuario responsable de la credencial ya no tiene acceso activo a este laboratorio.",
      },
    };
  }

  const scopeGranted = new Set<PermissionKey>(permissionsForScopes(client.scopes));
  const permissions = laboratory.permissions.filter((permission) => scopeGranted.has(permission));

  return {
    session: {
      userId: client.actorUserId,
      name: laboratory.role === "GUEST" ? client.name : `${client.name} (integración)`,
      email: `${client.clientId}@integrations.nexalab`,
      role: laboratory.role,
      organizationId: laboratory.organizationId,
      laboratoryId: laboratory.laboratoryId,
      laboratoryName: laboratory.laboratoryName,
      profileCode: laboratory.profileCode,
      sessionMode: "database",
      permissions,
    },
  };
}

function checkUsable(client: ApiClientRecord): AuthFailure | null {
  if (client.status !== "ACTIVE") {
    return { error: "revoked", message: "La credencial fue revocada." };
  }
  if (client.expiresAt && new Date(client.expiresAt).getTime() <= Date.now()) {
    return { error: "expired", message: "La credencial expiró." };
  }
  return null;
}

/** Marca de uso. Best-effort: no debe hacer fallar una petición válida. */
function touchClient(clientId: string): void {
  try {
    const sql = getSql();
    void Promise.resolve(sql`UPDATE api_clients SET last_used_at = now() WHERE id = ${clientId}`).catch(() => {});
  } catch {
    // Sin base de datos disponible no hay nada que marcar.
  }
}

/** Extrae la credencial de las cabeceras, en cualquiera de las formas aceptadas. */
export function readPresentedCredential(headers: Headers): { kind: "key" | "token"; value: string } | null {
  const apiKey = headers.get(API_KEY_HEADER)?.trim();
  if (apiKey) return { kind: "key", value: apiKey };

  const authorization = headers.get("authorization");
  if (!authorization) return null;
  const [scheme, ...rest] = authorization.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const value = rest.join(" ").trim();
  if (!value) return null;
  return { kind: value.startsWith(API_KEY_LIVE_PREFIX) ? "key" : "token", value };
}

export async function issueAccessToken(client: ApiClientRecord): Promise<{ accessToken: string; expiresIn: number }> {
  const accessToken = await new SignJWT({
    typ: INTEGRATION_TOKEN_TYPE,
    cid: client.id,
    scope: client.scopes.join(" "),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(accessTokenSecret());
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

/** Valida client_id + client_secret. Usado por el endpoint de token OAuth2. */
export async function authenticateClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<{ client: ApiClientRecord } | { failure: AuthFailure }> {
  if (!hasDatabase()) {
    return { failure: { error: "unconfigured", message: "La capa de integración requiere base de datos." } };
  }
  const client = await findClientByHash(hashApiKey(clientSecret));
  // El secreto ya identifica la credencial; el client_id debe coincidir para
  // no aceptar pares mezclados de dos integraciones distintas.
  if (!client || client.clientId !== clientId.trim()) {
    return { failure: { error: "invalid_credentials", message: "Credenciales inválidas." } };
  }
  const unusable = checkUsable(client);
  if (unusable) return { failure: unusable };
  return { client };
}

/**
 * Resuelve la credencial presentada en una petición al gateway, en cualquiera
 * de las dos formas, hasta una sesión de servicio lista para usar.
 */
export async function authenticateIntegrationRequest(
  headers: Headers,
): Promise<{ principal: IntegrationPrincipal } | { failure: AuthFailure }> {
  if (!hasDatabase()) {
    return { failure: { error: "unconfigured", message: "La capa de integración requiere base de datos." } };
  }

  const presented = readPresentedCredential(headers);
  if (!presented) {
    return {
      failure: {
        error: "missing_credentials",
        message: "Falta la credencial. Envía 'Authorization: Bearer <clave>' o la cabecera 'X-API-Key'.",
      },
    };
  }

  let client: ApiClientRecord | null = null;

  if (presented.kind === "key") {
    client = await findClientByHash(hashApiKey(presented.value));
  } else {
    try {
      const { payload } = await jwtVerify(presented.value, accessTokenSecret());
      if (payload.typ !== INTEGRATION_TOKEN_TYPE || typeof payload.cid !== "string") {
        return { failure: { error: "invalid_credentials", message: "El token no es un token de integración." } };
      }
      client = await findClientById(payload.cid);
    } catch {
      return { failure: { error: "invalid_credentials", message: "El token es inválido o expiró." } };
    }
  }

  if (!client) return { failure: { error: "invalid_credentials", message: "Credenciales inválidas." } };

  const unusable = checkUsable(client);
  if (unusable) return { failure: unusable };

  const built = await buildClientSession(client);
  if ("failure" in built) return built;

  touchClient(client.id);
  return { principal: { client, session: built.session, scopes: client.scopes } };
}
