import type { ModuleKey } from "@/lib/navigation";
import type { UserSession } from "@/lib/session";

export type PermissionKey =
  | "configuration.manage"
  | "inventory.view"
  | "inventory.manage"
  | "inventory.move"
  | "equipment.view"
  | "equipment.manage"
  | "specimens.view"
  | "specimens.receive"
  | "specimens.transition"
  | "results.view"
  | "results.enter"
  | "results.approve"
  | "quality.view"
  | "quality.manage"
  | "audit.view"
  | "compliance.view"
  | "education.view"
  | "education.manage"
  | "incidents.view"
  | "incidents.manage"
  | "alerts.view"
  | "alerts.manage"
  | "purchasing.view"
  | "purchasing.manage"
  | "signatures.create";

export const allPermissions: PermissionKey[] = [
  "configuration.manage", "inventory.view", "inventory.manage", "inventory.move", "equipment.view", "equipment.manage",
  "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter",
  "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view",
  "education.view", "education.manage", "incidents.view", "incidents.manage", "alerts.view", "alerts.manage",
  "purchasing.view", "purchasing.manage", "signatures.create",
];

export const permissionLabels: Record<PermissionKey, string> = {
  "configuration.manage": "Administrar configuración, usuarios y marca",
  "inventory.view": "Ver inventario",
  "inventory.manage": "Crear y editar inventario",
  "inventory.move": "Registrar movimientos de inventario",
  "equipment.view": "Ver equipos",
  "equipment.manage": "Crear y editar equipos, planes y certificados",
  "specimens.view": "Ver muestras",
  "specimens.receive": "Recibir muestras",
  "specimens.transition": "Cambiar estado de muestras",
  "results.view": "Ver resultados",
  "results.enter": "Registrar resultados",
  "results.approve": "Aprobar resultados",
  "quality.view": "Ver calidad",
  "quality.manage": "Gestionar calidad (OOS, CAPA, documentos)",
  "audit.view": "Consultar la bitácora",
  "compliance.view": "Ver cumplimiento",
  "education.view": "Ver programa educativo",
  "education.manage": "Gestionar prácticas y reservas",
  "incidents.view": "Ver incidencias",
  "incidents.manage": "Gestionar incidencias",
  "alerts.view": "Ver alertas",
  "alerts.manage": "Atender alertas, reglas y escalamientos",
  "purchasing.view": "Ver compras y solicitudes",
  "purchasing.manage": "Crear y gestionar solicitudes de compra",
  "signatures.create": "Firmar electrónicamente",
};

export const permissionsByRole: Record<UserSession["role"], PermissionKey[]> = {
  OWNER: allPermissions,
  LAB_ADMIN: allPermissions,
  SCIENTIST: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view", "purchasing.view", "purchasing.manage", "signatures.create"],
  TECHNICIAN: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view", "purchasing.view"],
  REVIEWER: ["inventory.view", "equipment.view", "specimens.view", "specimens.transition", "results.view", "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view", "purchasing.view", "signatures.create"],
  VIEWER: ["inventory.view", "equipment.view", "specimens.view", "results.view", "quality.view", "education.view", "purchasing.view"],
  HEAD_OF_LAB: ["configuration.manage", "inventory.view", "inventory.manage", "inventory.move", "equipment.view", "equipment.manage", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view", "education.view", "education.manage", "incidents.view", "incidents.manage", "purchasing.view", "purchasing.manage", "signatures.create"],
  ANALYST: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view", "purchasing.view", "signatures.create"],
  ASSISTANT: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "education.view", "purchasing.view"],
  AUDITOR: ["inventory.view", "equipment.view", "specimens.view", "results.view", "quality.view", "audit.view", "compliance.view", "education.view", "incidents.view", "purchasing.view"],
  CONSULTATION: ["inventory.view", "equipment.view", "specimens.view", "education.view"],
  PROFESSOR: ["inventory.view", "equipment.view", "education.view", "education.manage", "incidents.view", "incidents.manage", "alerts.view", "purchasing.view", "purchasing.manage"],
  STUDENT: ["inventory.view", "equipment.view", "education.view"],
};

export function hasPermission(session: UserSession, permission: PermissionKey): boolean {
  // Si la sesión trae permisos efectivos (matriz editada por el administrador,
  // resuelta al iniciar sesión), esos mandan. Si no, aplica la matriz base.
  if (Array.isArray(session.permissions)) return session.permissions.includes(permission);
  return permissionsByRole[session.role]?.includes(permission) ?? false;
}

/**
 * Permisos efectivos de un rol combinando la matriz base con las anulaciones
 * del laboratorio (tabla role_permission_overrides).
 */
export function effectivePermissions(
  role: UserSession["role"],
  overrides: ReadonlyArray<{ permission: string; allowed: boolean }>,
): PermissionKey[] {
  const base = new Set<PermissionKey>(permissionsByRole[role] ?? []);
  for (const override of overrides) {
    if (!allPermissions.includes(override.permission as PermissionKey)) continue;
    if (override.allowed) base.add(override.permission as PermissionKey);
    else base.delete(override.permission as PermissionKey);
  }
  return [...base];
}

export function hasAnyPermission(session: UserSession, permissions: PermissionKey[]): boolean {
  return permissions.some((permission) => hasPermission(session, permission));
}

const modulePermissions: Partial<Record<ModuleKey, PermissionKey[]>> = {
  workbench: ["specimens.view"],
  accessioning: ["specimens.view"],
  orders: ["specimens.view"],
  results: ["results.view"],
  patients: ["specimens.view"],
  providers: ["specimens.view"],
  catalog: ["results.view", "specimens.view"],
  inventory: ["inventory.view"],
  controlled: ["inventory.view"],
  equipment: ["equipment.view"],
  education: ["education.view"],
  incidents: ["incidents.view"],
  quality: ["quality.view"],
  documents: ["quality.view"],
  logbooks: ["quality.view", "equipment.view"],
  training: ["quality.view", "compliance.view"],
  alerts: ["alerts.view"],
  purchasing: ["purchasing.view"],
  reports: ["results.view", "quality.view", "inventory.view"],
  integrations: ["configuration.manage"],
  audit: ["audit.view"],
  compliance: ["compliance.view"],
  configuration: ["configuration.manage"],
  administration: ["configuration.manage"],
  billing: ["configuration.manage"],
};

export function canAccessModule(session: UserSession, moduleKey: ModuleKey): boolean {
  if (moduleKey === "dashboard") return true;
  const permissions = modulePermissions[moduleKey];
  return permissions ? hasAnyPermission(session, permissions) : false;
}
