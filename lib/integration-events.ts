// Catálogo y coincidencia de eventos de webhook. Va aparte de
// lib/integration-webhooks.ts —que abre conexiones a la base de datos— para
// que el panel de integraciones, que corre en el navegador, pueda usarlo sin
// arrastrar el driver de PostgreSQL al bundle del cliente.

/** Eventos que más piden las integraciones. La UI los ofrece como sugerencia. */
export const WEBHOOK_EVENT_SUGGESTIONS: Array<{ pattern: string; label: string }> = [
  { pattern: "*", label: "Todos los eventos" },
  { pattern: "INVENTORY_*", label: "Todo lo de inventario" },
  { pattern: "INVENTORY_ITEM_CREATED", label: "Alta de artículo de inventario" },
  { pattern: "INVENTORY_MOVEMENT_CREATED", label: "Movimiento de existencia" },
  { pattern: "INVENTORY_ITEM_DISCARDED", label: "Baja o descarte de artículo" },
  { pattern: "PURCHASE_REQUEST_*", label: "Todo lo de solicitudes de compra" },
  { pattern: "PURCHASE_REQUEST_CREATED", label: "Nueva solicitud de compra" },
  { pattern: "PURCHASE_REQUEST_UPDATED", label: "Cambio de estado de solicitud de compra" },
  { pattern: "INVENTORY_RECEIPT_REGISTERED", label: "Recepción de material documentada" },
  { pattern: "EQUIPMENT_*", label: "Todo lo de equipos" },
  { pattern: "EQUIPMENT_EVENT_CREATED", label: "Calibración o mantenimiento registrado" },
  { pattern: "CONTROLLED_USAGE_*", label: "Uso de reactivos controlados" },
  { pattern: "PHYSICAL_COUNT_*", label: "Conteos físicos de existencia" },
  { pattern: "INCIDENT_*", label: "Incidencias" },
  { pattern: "ELECTRONIC_SIGNATURE_CREATED", label: "Firma electrónica" },
];

/**
 * ¿Este endpoint quiere este evento? Se admite `*` (todo) y prefijo con
 * comodín (`INVENTORY_*`), que es lo que la gente espera al configurarlo y
 * evita tener que enumerar veinte acciones a mano.
 */
export function matchesEventPattern(pattern: string, eventType: string): boolean {
  const normalized = pattern.trim().toUpperCase();
  const event = eventType.trim().toUpperCase();
  if (!normalized) return false;
  if (normalized === "*") return true;
  if (normalized.endsWith("*")) return event.startsWith(normalized.slice(0, -1));
  return normalized === event;
}
