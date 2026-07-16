export function sourceRecordHref(sourceType: string | null, sourceId: string | null, fallbackAlertId?: string): string | null {
  if (!sourceId) return fallbackAlertId ? `/app/alerts?alertId=${encodeURIComponent(fallbackAlertId)}` : null;
  const id = encodeURIComponent(sourceId);
  const routes: Record<string, string> = {
    INVENTORY: `/app/inventory?itemId=${id}`,
    INVENTORY_ITEM: `/app/inventory?itemId=${id}`,
    EQUIPMENT: `/app/equipment?equipmentId=${id}`,
    EDUCATIONAL_PRACTICE: `/app/education?tab=schedule&practiceId=${id}`,
    RESOURCE_RESERVATION: `/app/education?tab=reservations&reservationId=${id}`,
    INCIDENT: `/app/incidents?incidentId=${id}`,
    EQUIPMENT_PLAN: `/app/equipment?tab=plans&planId=${id}`,
  };
  return routes[sourceType ?? ""] ?? (fallbackAlertId ? `/app/alerts?alertId=${encodeURIComponent(fallbackAlertId)}` : null);
}
