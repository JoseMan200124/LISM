import { getSql } from "@/lib/db";
import type { UserSession } from "@/lib/session";
import { effectivePermissions, type PermissionKey } from "@/lib/authorization";

// Membresía real de un usuario en sus laboratorios, con los mismos permisos
// efectivos que calcula el login. Vive aparte porque ya son tres los canales
// que necesitan sintetizar una sesión desde la membresía —la web, el puente de
// Dilo y el gateway de integraciones— y ninguno debe depender de otro.

export type UserLaboratory = {
  laboratoryId: string;
  laboratoryName: string;
  organizationId: string;
  role: UserSession["role"];
  profileCode: string;
  permissions: PermissionKey[];
};

/**
 * Laboratorios donde el usuario tiene membresía ACTIVA, con el mismo cálculo de
 * profile_code que hace el login (laboratory_settings > plan educativo > PHARMA_QC).
 */
export async function listUserLaboratories(userId: string): Promise<UserLaboratory[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      m.role,
      o.id AS organization_id,
      l.id AS laboratory_id,
      l.name AS laboratory_name,
      COALESCE(ls.profile_code, CASE WHEN bp.slug = 'academic_starter' OR o.plan_code = 'EDUCATIONAL' THEN 'EDUCATIONAL_SMALL_LAB' ELSE 'PHARMA_QC' END) AS profile_code
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id AND o.status = 'ACTIVE'
    JOIN laboratories  l ON l.id = m.laboratory_id   AND l.status = 'ACTIVE'
    LEFT JOIN laboratory_settings ls ON ls.laboratory_id = l.id
    LEFT JOIN billing_subscriptions bs ON bs.organization_id = o.id AND bs.status IN ('active','trialing','cancel_scheduled','payment_failed')
    LEFT JOIN billing_plans bp ON bp.id = bs.plan_id
    WHERE m.user_id = ${userId} AND m.status = 'ACTIVE'
    ORDER BY m.created_at ASC
  `;
  const laboratories = (rows as Array<Record<string, string>>).map((row) => ({
    laboratoryId: row.laboratory_id,
    laboratoryName: row.laboratory_name,
    organizationId: row.organization_id,
    role: row.role as UserSession["role"],
    profileCode: row.profile_code,
    permissions: [] as PermissionKey[],
  }));

  if (laboratories.length === 0) return laboratories;
  const laboratoryIds = laboratories.map((laboratory) => laboratory.laboratoryId);
  let overrides: Array<{ laboratory_id: string; role: string; permission: string; allowed: boolean }> = [];
  try {
    overrides = await sql`
      SELECT laboratory_id, role, permission, allowed
      FROM role_permission_overrides
      WHERE laboratory_id = ANY(${laboratoryIds})
    ` as typeof overrides;
  } catch (error) {
    // Compatibilidad durante despliegues escalonados: antes de 0017 se usa la
    // matriz base, igual que las sesiones web antiguas.
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("role_permission_overrides")) throw error;
  }

  return laboratories.map((laboratory) => ({
    ...laboratory,
    permissions: effectivePermissions(
      laboratory.role,
      overrides.filter((override) =>
        override.laboratory_id === laboratory.laboratoryId && override.role === laboratory.role),
    ),
  }));
}
