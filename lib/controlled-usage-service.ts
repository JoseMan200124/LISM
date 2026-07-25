// Acceso a datos del flujo de autorización de reactivos controlados.
// Se mantiene separado de lib/controlled-reagents.ts para que las reglas de
// negocio sigan siendo puras y probables sin base de datos.

import { getSql } from "@/lib/db";
import { hasPermission } from "@/lib/authorization";
import {
  DEFAULT_CONTROLLED_POLICY,
  resolveControlledPolicy,
  type ControlledUsagePolicy,
} from "@/lib/controlled-reagents";
import type { UserSession } from "@/lib/session";

// Quien puede crear y editar inventario es el responsable que autoriza el uso
// de reactivos controlados (jefe de laboratorio, administrador, propietario).
// Se reutiliza un permiso existente a propósito: introducir uno nuevo dejaría
// sin autorizar a las sesiones ya abiertas, que llevan sus permisos firmados.
export function canAuthorizeControlled(session: UserSession): boolean {
  return hasPermission(session, "inventory.manage");
}

// true cuando el error viene de que la migración 0020 aún no se aplicó.
export function isMissingAuthorizationMigration(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text.includes("controlled_usage_requests") ||
    text.includes("controlled_usage_policy") ||
    text.includes("usage_request_id") ||
    text.includes("42P01") || // undefined_table
    text.includes("42703") // undefined_column
  );
}

// Contexto del flujo de autorización para un laboratorio.
// available = false cuando la migración 0020 todavía no se aplicó: en ese caso
// el consumo de reactivos controlados conserva exactamente el comportamiento
// anterior (registro de trazabilidad obligatorio, sin autorización previa) en
// lugar de bloquearse por una tabla que aún no existe.
export async function loadControlledContext(
  laboratoryId: string,
): Promise<{ policy: ControlledUsagePolicy; available: boolean }> {
  const sql = getSql();
  const rows = await sql`SELECT to_regclass('public.controlled_usage_requests') IS NOT NULL AS ok`;
  if (!rows[0]?.ok) return { policy: { ...DEFAULT_CONTROLLED_POLICY }, available: false };
  return { policy: await loadControlledPolicy(laboratoryId), available: true };
}

// Política del laboratorio. Si la columna todavía no existe (migración
// pendiente) se devuelven los valores por defecto en lugar de fallar.
export async function loadControlledPolicy(laboratoryId: string): Promise<ControlledUsagePolicy> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT controlled_usage_policy FROM laboratory_settings
      WHERE laboratory_id = ${laboratoryId} LIMIT 1
    `;
    if (rows.length === 0) return { ...DEFAULT_CONTROLLED_POLICY };
    return resolveControlledPolicy(rows[0].controlled_usage_policy);
  } catch (error) {
    if (isMissingAuthorizationMigration(error)) return { ...DEFAULT_CONTROLLED_POLICY };
    throw error;
  }
}
