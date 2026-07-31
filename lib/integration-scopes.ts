import type { PermissionKey } from "@/lib/authorization";

// Vocabulario que ve quien integra. Deliberadamente NO son los PermissionKey
// internos: el ERP razona en "puedo leer inventario", no en la matriz de roles
// del LIMS. Traducir en un solo sitio permite que la matriz interna evolucione
// sin romper contratos ya firmados con terceros.
//
// Un scope concede permisos; nunca los inventa. Los permisos efectivos de una
// credencial son la INTERSECCIÓN de los permisos del usuario responsable con
// los que abren sus scopes (ver lib/integration-auth.ts). Conceder
// `inventory:write` a una credencial cuyo responsable solo puede ver
// inventario no habilita nada.

export const INTEGRATION_SCOPES = [
  "inventory:read", "inventory:write",
  "equipment:read", "equipment:write",
  "specimens:read", "specimens:write",
  "results:read", "results:write", "results:approve",
  "purchasing:read", "purchasing:write",
  "compliance:read", "compliance:write",
  "incidents:read", "incidents:write",
  "alerts:read", "alerts:write",
  "education:read", "education:write",
  "research:read", "research:write",
  "quality:read", "quality:write",
  "audit:read",
  "catalog:read",
] as const;

export type IntegrationScope = typeof INTEGRATION_SCOPES[number];

export function isIntegrationScope(value: unknown): value is IntegrationScope {
  return typeof value === "string" && (INTEGRATION_SCOPES as readonly string[]).includes(value);
}

/**
 * Permisos internos que abre cada scope. Un scope de escritura incluye siempre
 * la lectura correspondiente: ningún sistema externo escribe a ciegas, y pedir
 * los dos por separado solo produce integraciones mal configuradas.
 */
export const scopePermissions: Record<IntegrationScope, PermissionKey[]> = {
  "inventory:read": ["inventory.view"],
  "inventory:write": ["inventory.view", "inventory.manage", "inventory.move"],
  "equipment:read": ["equipment.view"],
  "equipment:write": ["equipment.view", "equipment.manage"],
  "specimens:read": ["specimens.view"],
  "specimens:write": ["specimens.view", "specimens.receive", "specimens.transition"],
  "results:read": ["results.view"],
  "results:write": ["results.view", "results.enter"],
  "results:approve": ["results.view", "results.approve"],
  "purchasing:read": ["purchasing.view"],
  "purchasing:write": ["purchasing.view", "purchasing.manage"],
  "compliance:read": ["compliance.view"],
  "compliance:write": ["compliance.view", "compliance.manage"],
  "incidents:read": ["incidents.view"],
  "incidents:write": ["incidents.view", "incidents.manage"],
  "alerts:read": ["alerts.view"],
  "alerts:write": ["alerts.view", "alerts.manage"],
  "education:read": ["education.view"],
  "education:write": ["education.view", "education.manage"],
  "research:read": ["research.view"],
  "research:write": ["research.view", "research.manage"],
  "quality:read": ["quality.view"],
  "quality:write": ["quality.view", "quality.manage"],
  "audit:read": ["audit.view"],
  // Catálogos de apoyo (categorías, ubicaciones, unidades): son datos maestros
  // que casi toda integración necesita para mapear contra los del ERP.
  "catalog:read": ["inventory.view"],
};

export const scopeLabels: Record<IntegrationScope, string> = {
  "inventory:read": "Leer inventario y existencias",
  "inventory:write": "Crear artículos y registrar movimientos",
  "equipment:read": "Leer equipos, planes y eventos",
  "equipment:write": "Crear y actualizar equipos y mantenimientos",
  "specimens:read": "Leer muestras",
  "specimens:write": "Recibir muestras y cambiar su estado",
  "results:read": "Leer resultados",
  "results:write": "Registrar resultados",
  "results:approve": "Aprobar resultados",
  "purchasing:read": "Leer solicitudes de compra",
  "purchasing:write": "Crear y actualizar solicitudes de compra",
  "compliance:read": "Leer cumplimiento, licencias y permisos",
  "compliance:write": "Registrar recepciones, conteos y destrucciones",
  "incidents:read": "Leer incidencias",
  "incidents:write": "Crear y gestionar incidencias",
  "alerts:read": "Leer alertas",
  "alerts:write": "Atender alertas y reglas",
  "education:read": "Leer prácticas y reservas",
  "education:write": "Gestionar prácticas y reservas",
  "research:read": "Leer proyectos, protocolos y biobancos",
  "research:write": "Gestionar proyectos, muestras y cuadernos",
  "quality:read": "Leer calidad y desviaciones",
  "quality:write": "Gestionar calidad",
  "audit:read": "Consultar la bitácora",
  "catalog:read": "Leer catálogos y datos maestros",
};

/** Permisos internos que abre un conjunto de scopes, sin duplicados. */
export function permissionsForScopes(scopes: readonly string[]): PermissionKey[] {
  const granted = new Set<PermissionKey>();
  for (const scope of scopes) {
    if (!isIntegrationScope(scope)) continue;
    for (const permission of scopePermissions[scope]) granted.add(permission);
  }
  return [...granted];
}

/** Descarta lo que no exista y quita repetidos, conservando el orden del catálogo. */
export function normalizeScopes(scopes: readonly unknown[]): IntegrationScope[] {
  const requested = new Set(scopes.filter(isIntegrationScope));
  return INTEGRATION_SCOPES.filter((scope) => requested.has(scope));
}
