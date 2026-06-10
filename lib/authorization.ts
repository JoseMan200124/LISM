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
  | "signatures.create";

const allPermissions: PermissionKey[] = [
  "configuration.manage", "inventory.view", "inventory.manage", "inventory.move", "equipment.view", "equipment.manage",
  "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter",
  "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view",
  "education.view", "education.manage", "signatures.create",
];

const permissionsByRole: Record<UserSession["role"], PermissionKey[]> = {
  OWNER: allPermissions,
  LAB_ADMIN: allPermissions,
  SCIENTIST: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view", "signatures.create"],
  TECHNICIAN: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view"],
  REVIEWER: ["inventory.view", "equipment.view", "specimens.view", "specimens.transition", "results.view", "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view", "signatures.create"],
  VIEWER: ["inventory.view", "equipment.view", "specimens.view", "results.view", "quality.view", "education.view"],
  HEAD_OF_LAB: ["configuration.manage", "inventory.view", "inventory.manage", "inventory.move", "equipment.view", "equipment.manage", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "results.approve", "quality.view", "quality.manage", "audit.view", "compliance.view", "education.view", "education.manage", "signatures.create"],
  ANALYST: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "quality.view", "education.view", "signatures.create"],
  ASSISTANT: ["inventory.view", "inventory.move", "equipment.view", "specimens.view", "specimens.receive", "specimens.transition", "education.view"],
  AUDITOR: ["inventory.view", "equipment.view", "specimens.view", "results.view", "quality.view", "audit.view", "compliance.view", "education.view"],
  CONSULTATION: ["inventory.view", "equipment.view", "specimens.view", "education.view"],
  PROFESSOR: ["inventory.view", "equipment.view", "education.view", "education.manage"],
  STUDENT: ["inventory.view", "equipment.view", "education.view"],
};

export function hasPermission(session: UserSession, permission: PermissionKey): boolean {
  return permissionsByRole[session.role]?.includes(permission) ?? false;
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
  equipment: ["equipment.view"],
  education: ["education.view"],
  quality: ["quality.view"],
  documents: ["quality.view"],
  logbooks: ["quality.view", "equipment.view"],
  training: ["quality.view", "compliance.view"],
  alerts: ["quality.view", "inventory.view", "equipment.view"],
  reports: ["results.view", "quality.view", "inventory.view"],
  integrations: ["configuration.manage"],
  audit: ["audit.view"],
  compliance: ["compliance.view"],
  configuration: ["configuration.manage"],
  administration: ["configuration.manage"],
};

export function canAccessModule(session: UserSession, moduleKey: ModuleKey): boolean {
  if (moduleKey === "dashboard") return true;
  const permissions = modulePermissions[moduleKey];
  return permissions ? hasAnyPermission(session, permissions) : false;
}
