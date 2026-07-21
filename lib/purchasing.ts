// Lógica pura y datos compartidos del módulo de compras. Se mantiene separada de
// las rutas para poder probarla sin base de datos y reutilizar las etiquetas
// tanto en el servidor como en el cliente.

/**
 * Calcula el siguiente código correlativo de solicitud de compra
 * (OC-<año>-NNN) a partir de los códigos existentes del laboratorio para ese
 * año. Ignora cualquier código que no siga el formato del año en curso.
 */
export function computeNextPurchaseCode(existingCodes: readonly string[], year: number): string {
  const prefix = `OC-${year}-`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(prefix)) continue;
    const suffix = code.slice(prefix.length);
    if (!/^\d+$/.test(suffix)) continue;
    const value = Number(suffix);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export const PURCHASE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PENDING: "Por aprobar",
  APPROVED: "Aprobada",
  ORDERED: "Pedida",
  RECEIVED: "Recibida",
  CANCELLED: "Cancelada",
};

export const PURCHASE_PRIORITY_LABEL: Record<string, string> = {
  LOW: "Baja",
  NORMAL: "Normal",
  HIGH: "Alta",
  URGENT: "Urgente",
};

// Datos demostrativos para el modo sin base de datos (DEMO_MODE / sin DATABASE_URL).
export const demoPurchaseRequests = [
  { id: "demo-oc-1", request_code: "OC-2026-001", title: "Reposición de reactivos de microbiología", supplier: "Merck", status: "PENDING", priority: "HIGH", currency: "GTQ", needed_by: "2026-08-05", created_at: "2026-07-18T14:00:00.000Z", item_count: 4, estimated_total: 3850 },
  { id: "demo-oc-2", request_code: "OC-2026-002", title: "Material de vidrio para laboratorio B", supplier: "Kalstein", status: "APPROVED", priority: "NORMAL", currency: "GTQ", needed_by: "2026-08-20", created_at: "2026-07-15T09:30:00.000Z", item_count: 6, estimated_total: 2120 },
  { id: "demo-oc-3", request_code: "OC-2026-003", title: "Guantes y consumibles de bioseguridad", supplier: "3M", status: "ORDERED", priority: "URGENT", currency: "GTQ", needed_by: "2026-07-30", created_at: "2026-07-12T11:15:00.000Z", item_count: 3, estimated_total: 1490 },
] as const;
