// Presentación de la bitácora: a qué módulo pertenece cada entidad auditada y
// cómo se lee cada acción en lenguaje claro. Compartido entre el API de
// bitácora (export a Excel) y la pantalla del módulo.

export const AUDIT_MODULE_BY_ENTITY: Record<string, string> = {
  inventory_item: "Inventario",
  inventory_category: "Inventario",
  inventory_restore_request: "Inventario",
  storage_location: "Inventario",
  equipment: "Equipos",
  equipment_plan: "Equipos",
  equipment_certificate: "Equipos",
  educational_practice: "Programa",
  educational_group: "Programa",
  educational_notification: "Programa",
  resource_reservation: "Programa",
  incident: "Incidencias",
  alert: "Alertas",
  alert_rule: "Alertas",
  alert_escalation: "Alertas",
  custom_field_definition: "Configuración",
  laboratory_settings: "Configuración",
  organization: "Configuración",
  user_preferences: "Configuración",
  user: "Usuarios",
  user_session: "Usuarios",
  role_permission: "Usuarios",
  qr_identifier: "QR y etiquetas",
  billing_subscription: "Mi Plan",
  billing_checkout: "Mi Plan",
  specimen: "Muestras",
  result_record: "Resultados",
};

export function auditModuleLabel(entityType: unknown): string {
  return AUDIT_MODULE_BY_ENTITY[String(entityType ?? "")] ?? "Sistema";
}

const ACTION_LABELS: Record<string, string> = {
  INVENTORY_ITEM_CREATED: "Artículo creado",
  INVENTORY_ITEM_UPDATED: "Artículo actualizado",
  INVENTORY_ITEM_DISCARDED: "Descarte de inventario",
  INVENTORY_ITEM_ARCHIVED: "Artículo archivado",
  INVENTORY_MOVEMENT_CREATED: "Movimiento de inventario",
  INVENTORY_RESTORE_REQUESTED: "Solicitud de recuperación",
  INVENTORY_RESTORE_APPROVED: "Recuperación aprobada",
  INVENTORY_RESTORE_REJECTED: "Recuperación rechazada",
  EQUIPMENT_CREATED: "Equipo registrado",
  EQUIPMENT_UPDATED: "Equipo actualizado",
  EQUIPMENT_EVENT_CREATED: "Evento de equipo",
  EQUIPMENT_PLAN_CREATED: "Plan de equipo creado",
  EQUIPMENT_PLAN_UPDATE: "Plan de equipo actualizado",
  EQUIPMENT_PLAN_PAUSE: "Plan de equipo pausado",
  EQUIPMENT_PLAN_REACTIVATE: "Plan de equipo reactivado",
  EQUIPMENT_PLAN_ARCHIVE: "Plan de equipo archivado",
  EQUIPMENT_PLAN_DUPLICATED: "Plan de equipo duplicado",
  EQUIPMENT_PLAN_DELETED: "Plan de equipo eliminado",
  EQUIPMENT_CERTIFICATE_CREATED: "Certificado registrado",
  EQUIPMENT_CERTIFICATE_UPDATED: "Certificado actualizado",
  CUSTOM_FIELD_CREATED: "Campo personalizado creado",
  CUSTOM_FIELD_UPDATED: "Campo personalizado editado",
  CUSTOM_FIELD_ARCHIVED: "Campo personalizado archivado",
  CUSTOM_FIELD_DELETED: "Campo personalizado eliminado",
  ORGANIZATION_LOGO_UPDATED: "Logo institucional actualizado",
  ORGANIZATION_LOGO_REMOVED: "Logo institucional eliminado",
  QR_LABEL_ISSUED: "Etiqueta QR generada",
  ROLE_PERMISSIONS_UPDATED: "Permisos de rol actualizados",
  USER_ROLE_UPDATED: "Rol de usuario actualizado",
  USER_STATUS_UPDATED: "Estado de usuario actualizado",
  USER_INVITED: "Usuario invitado",
};

export function auditActionLabel(action: unknown): string {
  const key = String(action ?? "");
  if (ACTION_LABELS[key]) return ACTION_LABELS[key];
  const pretty = key.replaceAll("_", " ").toLowerCase();
  return pretty ? pretty.charAt(0).toUpperCase() + pretty.slice(1) : "—";
}
