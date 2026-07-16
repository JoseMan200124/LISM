export const EDUCATIONAL_ALERT_SOURCES = ["INVENTORY_ITEM", "EQUIPMENT", "EQUIPMENT_PLAN", "EDUCATIONAL_PRACTICE", "RESOURCE_RESERVATION", "INCIDENT"] as const;
export type EducationalAlertSource = (typeof EDUCATIONAL_ALERT_SOURCES)[number];

export const EDUCATIONAL_RULE_TEMPLATES = [
  { key: "LOW_STOCK", name: "Inventario bajo mínimo", sourceType: "INVENTORY_ITEM", triggerType: "THRESHOLD" },
  { key: "EXPIRY_DUE", name: "Artículo próximo a vencer", sourceType: "INVENTORY_ITEM", triggerType: "DATE_WINDOW" },
  { key: "CALIBRATION_OVERDUE", name: "Calibración vencida", sourceType: "EQUIPMENT_PLAN", triggerType: "DATE_OVERDUE" },
  { key: "MAINTENANCE_DUE", name: "Mantenimiento próximo", sourceType: "EQUIPMENT_PLAN", triggerType: "DATE_WINDOW" },
  { key: "OUT_OF_SERVICE", name: "Equipo fuera de servicio", sourceType: "EQUIPMENT", triggerType: "STATUS" },
  { key: "RESERVATION_UNPREPARED", name: "Reserva sin preparar", sourceType: "RESOURCE_RESERVATION", triggerType: "AGE" },
  { key: "PRACTICE_UPCOMING", name: "Práctica próxima", sourceType: "EDUCATIONAL_PRACTICE", triggerType: "DATE_WINDOW" },
  { key: "CRITICAL_INCIDENT", name: "Incidencia crítica sin atender", sourceType: "INCIDENT", triggerType: "AGE" },
] as const;

export function isEducationalAlertSource(value: string): value is EducationalAlertSource {
  return EDUCATIONAL_ALERT_SOURCES.includes(value as EducationalAlertSource);
}
