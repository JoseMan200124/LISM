import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession, type UserSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { allPermissions, effectivePermissions, hasPermission, permissionsByRole, type PermissionKey } from "@/lib/authorization";

// Matriz de permisos editable por laboratorio (retro cliente: "el admin tiene
// que poder editar los roles y permisos por completo"). Cada rol parte de la
// matriz base y el administrador puede activar o desactivar permisos; los
// cambios aplican en el siguiente inicio de sesión de cada usuario.

const EDITABLE_ROLES: Array<UserSession["role"]> = [
  "LAB_ADMIN", "HEAD_OF_LAB", "SCIENTIST", "TECHNICIAN", "REVIEWER", "VIEWER",
  "ANALYST", "ASSISTANT", "AUDITOR", "CONSULTATION", "PROFESSOR", "STUDENT",
];

const putSchema = z.object({
  role: z.enum(EDITABLE_ROLES as [UserSession["role"], ...Array<UserSession["role"]>]),
  permissions: z.array(z.enum(allPermissions as [PermissionKey, ...PermissionKey[]])).max(allPermissions.length),
});

function isMissingTable(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("role_permission_overrides");
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para consultar la matriz de permisos." }, { status: 403 });

  let overrides: Array<{ role: string; permission: string; allowed: boolean }> = [];
  let mode = "database";
  if (hasDatabase()) {
    const sql = getSql();
    try {
      overrides = await sql`
        SELECT role, permission, allowed FROM role_permission_overrides
        WHERE laboratory_id = ${session.laboratoryId}
      ` as Array<{ role: string; permission: string; allowed: boolean }>;
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      mode = "pending-migration";
    }
  } else {
    mode = "demo";
  }

  const matrix = EDITABLE_ROLES.map((role) => ({
    role,
    defaults: permissionsByRole[role],
    effective: effectivePermissions(role, overrides.filter((override) => override.role === role)),
  }));
  return NextResponse.json({ data: { roles: matrix, permissions: allPermissions }, mode });
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para editar la matriz de permisos." }, { status: 403 });
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const { role, permissions } = parsed.data;

  // Salvaguarda: quien administra no puede quitarse a sí mismo la capacidad de
  // administrar (evita perder el acceso a esta pantalla por accidente).
  if (role === session.role && !permissions.includes("configuration.manage")) {
    return NextResponse.json({ message: "No puedes quitar el permiso de administración a tu propio rol." }, { status: 400 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: { role, permissions }, mode: "demo" });

  const sql = getSql();
  try {
    const desired = new Set(permissions);
    const defaults = new Set(permissionsByRole[role]);
    // Guarda solo las diferencias contra la matriz base; lo igual se limpia.
    await sql`DELETE FROM role_permission_overrides WHERE laboratory_id = ${session.laboratoryId} AND role = ${role}`;
    for (const permission of allPermissions) {
      const wanted = desired.has(permission);
      if (wanted === defaults.has(permission)) continue;
      await sql`
        INSERT INTO role_permission_overrides (laboratory_id, role, permission, allowed, updated_by)
        VALUES (${session.laboratoryId}, ${role}, ${permission}, ${wanted}, ${session.userId})
        ON CONFLICT (laboratory_id, role, permission)
        DO UPDATE SET allowed = EXCLUDED.allowed, updated_by = EXCLUDED.updated_by, updated_at = now()
      `;
    }
    await writeAuditEvent(session, {
      action: "ROLE_PERMISSIONS_UPDATED",
      entityType: "role_permission",
      entityId: null,
      previousValue: { role, defaults: [...defaults] },
      newValue: { role, permissions },
      reason: `Matriz de permisos del rol ${role} actualizada`,
      request,
    });
    return NextResponse.json({ data: { role, permissions } });
  } catch (error) {
    if (isMissingTable(error)) return NextResponse.json({ message: "La edición de permisos estará disponible al aplicar la actualización de base de datos (migración 0017)." }, { status: 503 });
    throw error;
  }
}
