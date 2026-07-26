// Notificaciones push para la app móvil (NexaLab Móvil).
//
// La app replica los mismos módulos, roles y permisos que la web. Lo único
// distinto es el canal: en la web las notificaciones se leen en la campana
// (lib/notifications.ts) y en el móvil llegan además como push.
//
// Reglas de diseño:
//  - El envío NUNCA interrumpe la operación que lo dispara. Si el push falla,
//    la solicitud principal (crear un aviso, autorizar un reactivo…) sigue su
//    curso: la notificación se sigue viendo en la campana al abrir la app.
//  - Los destinatarios se resuelven con la misma matriz de permisos que la web,
//    incluidas las anulaciones por laboratorio (role_permission_overrides).
//  - Si la migración 0021 aún no se aplicó, todo queda inerte.

import { getSql, hasDatabase } from "@/lib/db";
import {
  allPermissions,
  effectivePermissions,
  permissionsByRole,
  type PermissionKey,
} from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export type PushPlatform = "ios" | "android" | "web" | "unknown";

export type PushMessage = {
  title: string;
  body: string;
  /** Ruta interna de la app a la que navega el toque sobre la notificación. */
  targetUrl?: string;
  /** Canal de Android; determina la importancia y el sonido. */
  channelId?: "alerts" | "education" | "controlled" | "general";
  data?: Record<string, unknown>;
};

type DeviceRow = { id: string; push_token: string };

/** true cuando el error viene de que la migración 0021 todavía no se aplicó. */
export function isMissingPushMigration(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("push_devices") || text.includes("42P01");
}

async function pushTableExists(): Promise<boolean> {
  if (!hasDatabase()) return false;
  try {
    const sql = getSql();
    const rows = await sql`SELECT to_regclass('public.push_devices') IS NOT NULL AS ok`;
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

// ─── Registro de dispositivos ────────────────────────────────────────────────

export function isExpoPushToken(value: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(value.trim());
}

export async function registerPushDevice(
  session: UserSession,
  input: { token: string; platform?: string; deviceName?: string; appVersion?: string },
): Promise<{ registered: boolean; reason?: string }> {
  if (!(await pushTableExists())) return { registered: false, reason: "MIGRATION_PENDING" };

  const platform: PushPlatform =
    input.platform === "ios" || input.platform === "android" || input.platform === "web"
      ? input.platform
      : "unknown";

  const sql = getSql();
  // ON CONFLICT sobre el token: si el teléfono cambia de usuario, el registro
  // se reasigna en lugar de duplicarse (evita enviar avisos al dueño anterior).
  await sql`
    INSERT INTO push_devices (user_id, laboratory_id, push_token, platform, device_name, app_version, status)
    VALUES (
      ${session.userId}, ${session.laboratoryId}, ${input.token.trim()}, ${platform},
      ${input.deviceName ?? null}, ${input.appVersion ?? null}, 'ACTIVE'
    )
    ON CONFLICT (push_token) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      laboratory_id = EXCLUDED.laboratory_id,
      platform = EXCLUDED.platform,
      device_name = EXCLUDED.device_name,
      app_version = EXCLUDED.app_version,
      status = 'ACTIVE',
      last_seen_at = now(),
      updated_at = now()
  `;
  return { registered: true };
}

export async function unregisterPushDevice(session: UserSession, token: string): Promise<void> {
  if (!(await pushTableExists())) return;
  const sql = getSql();
  await sql`
    DELETE FROM push_devices
    WHERE push_token = ${token.trim()} AND user_id = ${session.userId}
  `;
}

async function deactivateTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    const sql = getSql();
    await sql`
      UPDATE push_devices SET status = 'INACTIVE', updated_at = now()
      WHERE push_token = ANY(${tokens})
    `;
  } catch {
    // Sin efecto sobre la operación en curso.
  }
}

// ─── Resolución de destinatarios ─────────────────────────────────────────────

/**
 * Roles del laboratorio que conservan el permiso indicado una vez aplicadas las
 * anulaciones del administrador. Es la misma resolución que hace el login para
 * firmar los permisos efectivos de cada sesión.
 */
export async function rolesWithPermission(
  laboratoryId: string,
  permission: PermissionKey,
): Promise<Array<UserSession["role"]>> {
  let overridesByRole = new Map<string, Array<{ permission: string; allowed: boolean }>>();
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT role, permission, allowed FROM role_permission_overrides
      WHERE laboratory_id = ${laboratoryId}
    `) as Array<{ role: string; permission: string; allowed: boolean }>;
    overridesByRole = rows.reduce((map, row) => {
      const list = map.get(row.role) ?? [];
      list.push({ permission: row.permission, allowed: row.allowed });
      map.set(row.role, list);
      return map;
    }, new Map<string, Array<{ permission: string; allowed: boolean }>>());
  } catch {
    // Tabla no migrada: aplica la matriz base.
  }

  return (Object.keys(permissionsByRole) as Array<UserSession["role"]>).filter((role) =>
    effectivePermissions(role, overridesByRole.get(role) ?? []).includes(permission),
  );
}

async function tokensForUsers(userIds: string[]): Promise<DeviceRow[]> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const sql = getSql();
  return (await sql`
    SELECT id, push_token FROM push_devices
    WHERE status = 'ACTIVE' AND user_id = ANY(${unique})
  `) as DeviceRow[];
}

async function tokensForRoles(
  laboratoryId: string,
  roles: Array<UserSession["role"]>,
  excludeUserId?: string,
): Promise<DeviceRow[]> {
  if (roles.length === 0) return [];
  const sql = getSql();
  return (await sql`
    SELECT d.id, d.push_token
    FROM push_devices d
    JOIN memberships m ON m.user_id = d.user_id AND m.laboratory_id = ${laboratoryId} AND m.status = 'ACTIVE'
    WHERE d.status = 'ACTIVE'
      AND d.laboratory_id = ${laboratoryId}
      AND m.role = ANY(${roles})
      AND (${excludeUserId ?? null}::uuid IS NULL OR d.user_id <> ${excludeUserId ?? null}::uuid)
  `) as DeviceRow[];
}

// ─── Envío ───────────────────────────────────────────────────────────────────

type ExpoTicket = { status: string; message?: string; details?: { error?: string } };

async function deliver(tokens: string[], message: PushMessage): Promise<void> {
  if (tokens.length === 0) return;

  const payloadBase = {
    sound: "default" as const,
    priority: "high" as const,
    channelId: message.channelId ?? "general",
    title: message.title,
    body: message.body,
    data: { targetUrl: message.targetUrl ?? null, ...(message.data ?? {}) },
  };

  for (let index = 0; index < tokens.length; index += EXPO_BATCH_SIZE) {
    const batch = tokens.slice(index, index + EXPO_BATCH_SIZE);
    const messages = batch.map((to) => ({ to, ...payloadBase }));

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
    };
    // Solo necesario si el proyecto de Expo exige credenciales de envío.
    if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
    });
    if (!response.ok) continue;

    const payload = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
    const tickets = payload?.data ?? [];
    const dead = tickets
      .map((ticket, position) => ({ ticket, token: batch[position] }))
      .filter(({ ticket }) => ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered")
      .map(({ token }) => token);
    await deactivateTokens(dead);
  }
}

/** Envía a usuarios concretos. Silencioso ante cualquier fallo. */
export async function sendPushToUsers(userIds: string[], message: PushMessage): Promise<void> {
  try {
    if (!(await pushTableExists())) return;
    const devices = await tokensForUsers(userIds);
    await deliver(devices.map((device) => device.push_token), message);
  } catch (error) {
    if (!isMissingPushMigration(error)) console.error("[push] sendPushToUsers", error);
  }
}

/** Envía a todos los usuarios activos del laboratorio con esos roles. */
export async function sendPushToRoles(
  laboratoryId: string,
  roles: Array<UserSession["role"]>,
  message: PushMessage,
  options: { excludeUserId?: string } = {},
): Promise<void> {
  try {
    if (!(await pushTableExists())) return;
    const devices = await tokensForRoles(laboratoryId, roles, options.excludeUserId);
    await deliver(devices.map((device) => device.push_token), message);
  } catch (error) {
    if (!isMissingPushMigration(error)) console.error("[push] sendPushToRoles", error);
  }
}

/**
 * Envía a quien tenga el permiso indicado en ese laboratorio. Es la forma
 * preferida: mantiene el push alineado con lo que cada persona puede ver.
 */
export async function sendPushToPermission(
  laboratoryId: string,
  permission: PermissionKey,
  message: PushMessage,
  options: { excludeUserId?: string } = {},
): Promise<void> {
  try {
    if (!(await pushTableExists())) return;
    if (!allPermissions.includes(permission)) return;
    const roles = await rolesWithPermission(laboratoryId, permission);
    const devices = await tokensForRoles(laboratoryId, roles, options.excludeUserId);
    await deliver(devices.map((device) => device.push_token), message);
  } catch (error) {
    if (!isMissingPushMigration(error)) console.error("[push] sendPushToPermission", error);
  }
}

/**
 * Lanza el envío sin bloquear la respuesta HTTP. El resultado del push no debe
 * condicionar el éxito de la operación que lo originó.
 */
export function dispatchPush(task: Promise<void>): void {
  void task.catch(() => undefined);
}
