import type { IntegrationScope } from "@/lib/integration-scopes";

// Contrato de la API de integración: QUÉ expone, sin decir a qué handler llama.
//
// Vive separado de lib/integration-registry.ts —que sí importa los handlers de
// la aplicación— para que el contrato se pueda leer desde cualquier sitio sin
// arrastrar consigo el servidor entero. Eso es lo que permite que la página
// pública /docs/api se genere estática: importar el registro completo traería
// `next/headers` y obligaría a renderizarla en cada petición.
//
// La correspondencia uno a uno entre este catálogo y los invocadores del
// registro está cubierta por pruebas: si se añade una operación aquí sin su
// handler, o al revés, la suite falla.

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type OperationQueryParam = {
  name: string;
  description: string;
};

export type IntegrationOperationMeta = {
  operationId: string;
  method: HttpMethod;
  /** Ruta pública relativa a /api/v1, con `{id}` donde va el identificador. */
  path: string;
  tag: string;
  summary: string;
  scope: IntegrationScope;
  hasBody: boolean;
  query?: OperationQueryParam[];
};

const PAGINATION_HINT: OperationQueryParam[] = [
  { name: "limit", description: "Máximo de registros a devolver (1-500, por omisión 100)." },
  { name: "offset", description: "Registros a omitir desde el inicio, para paginar." },
];

export const INTEGRATION_CATALOG: IntegrationOperationMeta[] = [
  // ————————————————————————————————— Inventario
  {
    operationId: "inventory.items.list", method: "GET", path: "/inventory/items", tag: "Inventario",
    summary: "Lista los artículos de inventario activos con existencia, lote y vencimiento.",
    scope: "inventory:read", hasBody: false, query: PAGINATION_HINT,
  },
  {
    operationId: "inventory.items.create", method: "POST", path: "/inventory/items", tag: "Inventario",
    summary: "Da de alta un artículo de inventario y genera su etiqueta QR.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.items.get", method: "GET", path: "/inventory/items/{id}", tag: "Inventario",
    summary: "Obtiene el detalle completo de un artículo de inventario.",
    scope: "inventory:read", hasBody: false,
  },
  {
    operationId: "inventory.items.update", method: "PATCH", path: "/inventory/items/{id}", tag: "Inventario",
    summary: "Actualiza los datos de un artículo de inventario.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.items.discard", method: "POST", path: "/inventory/items/{id}/discard", tag: "Inventario",
    summary: "Registra la baja o descarte de un artículo de inventario.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.movements.list", method: "GET", path: "/inventory/movements", tag: "Inventario",
    summary: "Kardex de movimientos de existencia (solo anexado).",
    scope: "inventory:read", hasBody: false, query: PAGINATION_HINT,
  },
  {
    operationId: "inventory.movements.create", method: "POST", path: "/inventory/movements", tag: "Inventario",
    summary: "Registra una entrada, salida o ajuste de existencia.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.categories.list", method: "GET", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Categorías de inventario, para mapear contra las del ERP.",
    scope: "catalog:read", hasBody: false,
  },
  {
    operationId: "inventory.categories.create", method: "POST", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Crea una categoría de inventario.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.categories.update", method: "PATCH", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Actualiza una categoría de inventario.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.controlled.list", method: "GET", path: "/inventory/controlled", tag: "Inventario",
    summary: "Artículos marcados como reactivo controlado, de doble uso o precursor.",
    scope: "inventory:read", hasBody: false,
  },
  {
    operationId: "inventory.controlled.requests.list", method: "GET", path: "/inventory/controlled/requests", tag: "Inventario",
    summary: "Solicitudes de autorización de uso de reactivo controlado.",
    scope: "inventory:read", hasBody: false,
  },
  {
    operationId: "inventory.controlled.requests.create", method: "POST", path: "/inventory/controlled/requests", tag: "Inventario",
    summary: "Crea una solicitud de uso de reactivo controlado.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "inventory.controlled.requests.update", method: "PATCH", path: "/inventory/controlled/requests/{id}", tag: "Inventario",
    summary: "Resuelve (autoriza o rechaza) una solicitud de uso controlado.",
    scope: "inventory:write", hasBody: true,
  },
  {
    operationId: "locations.list", method: "GET", path: "/locations", tag: "Datos maestros",
    summary: "Ubicaciones de almacenamiento del laboratorio.",
    scope: "catalog:read", hasBody: false,
  },
  {
    operationId: "locations.create", method: "POST", path: "/locations", tag: "Datos maestros",
    summary: "Crea una ubicación de almacenamiento.",
    scope: "inventory:write", hasBody: true,
  },

  // ————————————————————————————————— Equipos
  {
    operationId: "equipment.list", method: "GET", path: "/equipment", tag: "Equipos",
    summary: "Equipos del laboratorio con estado, calibración y próximo mantenimiento.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.create", method: "POST", path: "/equipment", tag: "Equipos",
    summary: "Da de alta un equipo.",
    scope: "equipment:write", hasBody: true,
  },
  {
    operationId: "equipment.get", method: "GET", path: "/equipment/{id}", tag: "Equipos",
    summary: "Detalle de un equipo.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.update", method: "PATCH", path: "/equipment/{id}", tag: "Equipos",
    summary: "Actualiza los datos de un equipo.",
    scope: "equipment:write", hasBody: true,
  },
  {
    operationId: "equipment.events.list", method: "GET", path: "/equipment/events", tag: "Equipos",
    summary: "Eventos de equipo: calibraciones, mantenimientos y verificaciones.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.events.create", method: "POST", path: "/equipment/events", tag: "Equipos",
    summary: "Registra un evento de calibración o mantenimiento.",
    scope: "equipment:write", hasBody: true,
  },
  {
    operationId: "equipment.plans.list", method: "GET", path: "/equipment/plans", tag: "Equipos",
    summary: "Planes de mantenimiento y calibración programados.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.plans.create", method: "POST", path: "/equipment/plans", tag: "Equipos",
    summary: "Crea un plan de mantenimiento o calibración.",
    scope: "equipment:write", hasBody: true,
  },
  {
    operationId: "equipment.plans.get", method: "GET", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Detalle de un plan de mantenimiento.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.plans.update", method: "PATCH", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Actualiza un plan de mantenimiento.",
    scope: "equipment:write", hasBody: true,
  },
  {
    operationId: "equipment.plans.delete", method: "DELETE", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Elimina un plan de mantenimiento.",
    scope: "equipment:write", hasBody: false,
  },
  {
    operationId: "equipment.certificates.list", method: "GET", path: "/equipment/certificates", tag: "Equipos",
    summary: "Certificados de calibración registrados.",
    scope: "equipment:read", hasBody: false,
  },
  {
    operationId: "equipment.certificates.create", method: "POST", path: "/equipment/certificates", tag: "Equipos",
    summary: "Registra un certificado de calibración.",
    scope: "equipment:write", hasBody: true,
  },

  // ————————————————————————————————— Muestras y resultados
  {
    operationId: "specimens.list", method: "GET", path: "/specimens", tag: "Muestras",
    summary: "Muestras recibidas con su estado en el flujo de trabajo.",
    scope: "specimens:read", hasBody: false,
  },
  {
    operationId: "specimens.create", method: "POST", path: "/specimens", tag: "Muestras",
    summary: "Recibe una muestra y genera su número de acceso.",
    scope: "specimens:write", hasBody: true,
  },
  {
    operationId: "specimens.transition", method: "POST", path: "/specimens/{id}/transitions", tag: "Muestras",
    summary: "Mueve una muestra al siguiente estado del flujo configurado.",
    scope: "specimens:write", hasBody: true,
  },
  {
    operationId: "results.list", method: "GET", path: "/results", tag: "Resultados",
    summary: "Resultados registrados con su método, versión y estado.",
    scope: "results:read", hasBody: false,
  },
  {
    operationId: "results.create", method: "POST", path: "/results", tag: "Resultados",
    summary: "Registra un resultado analítico.",
    scope: "results:write", hasBody: true,
  },

  // ————————————————————————————————— Compras (el puente natural con el ERP)
  {
    operationId: "purchasing.requests.list", method: "GET", path: "/purchasing/requests", tag: "Compras",
    summary: "Solicitudes de compra con su estado de aprobación.",
    scope: "purchasing:read", hasBody: false,
  },
  {
    operationId: "purchasing.requests.create", method: "POST", path: "/purchasing/requests", tag: "Compras",
    summary: "Crea una solicitud de compra.",
    scope: "purchasing:write", hasBody: true,
  },
  {
    operationId: "purchasing.requests.get", method: "GET", path: "/purchasing/requests/{id}", tag: "Compras",
    summary: "Detalle de una solicitud de compra con sus renglones.",
    scope: "purchasing:read", hasBody: false,
  },
  {
    operationId: "purchasing.requests.update", method: "PATCH", path: "/purchasing/requests/{id}", tag: "Compras",
    summary: "Actualiza o cambia el estado de una solicitud de compra.",
    scope: "purchasing:write", hasBody: true,
  },

  // ————————————————————————————————— Cumplimiento
  {
    operationId: "compliance.summary", method: "GET", path: "/compliance", tag: "Cumplimiento",
    summary: "Resumen del estado de cumplimiento del laboratorio.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.catalog.list", method: "GET", path: "/compliance/catalog", tag: "Cumplimiento",
    summary: "Catálogo de sustancias con CAS, clasificación y requisitos.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.catalog.create", method: "POST", path: "/compliance/catalog", tag: "Cumplimiento",
    summary: "Añade una sustancia al catálogo de reactivos.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.catalog.get", method: "GET", path: "/compliance/catalog/{id}", tag: "Cumplimiento",
    summary: "Detalle de una sustancia del catálogo.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.catalog.update", method: "PATCH", path: "/compliance/catalog/{id}", tag: "Cumplimiento",
    summary: "Actualiza una sustancia del catálogo.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.permits.list", method: "GET", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Licencias y permisos vigentes del laboratorio.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.permits.create", method: "POST", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Registra una licencia o permiso.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.permits.update", method: "PATCH", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Actualiza una licencia o permiso.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.receipts.list", method: "GET", path: "/compliance/receipts", tag: "Cumplimiento",
    summary: "Recepciones con factura, orden de compra, licencia y permiso.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.receipts.create", method: "POST", path: "/compliance/receipts", tag: "Cumplimiento",
    summary: "Registra la recepción documentada de material controlado.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.counts.list", method: "GET", path: "/compliance/counts", tag: "Cumplimiento",
    summary: "Conteos físicos de existencia realizados.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.counts.create", method: "POST", path: "/compliance/counts", tag: "Cumplimiento",
    summary: "Abre un conteo físico de existencia.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.counts.get", method: "GET", path: "/compliance/counts/{id}", tag: "Cumplimiento",
    summary: "Detalle de un conteo físico y sus diferencias.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.counts.update", method: "PATCH", path: "/compliance/counts/{id}", tag: "Cumplimiento",
    summary: "Actualiza o cierra un conteo físico.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.disposals.list", method: "GET", path: "/compliance/disposals", tag: "Cumplimiento",
    summary: "Destrucciones y disposiciones registradas.",
    scope: "compliance:read", hasBody: false,
  },
  {
    operationId: "compliance.disposals.create", method: "POST", path: "/compliance/disposals", tag: "Cumplimiento",
    summary: "Registra una destrucción o disposición de material.",
    scope: "compliance:write", hasBody: true,
  },
  {
    operationId: "compliance.reports", method: "GET", path: "/compliance/reports", tag: "Cumplimiento",
    summary: "Filas ya formateadas de los reportes regulatorios.",
    scope: "compliance:read", hasBody: false,
    query: [{ name: "type", description: "Tipo de reporte a generar." }],
  },

  // ————————————————————————————————— Incidencias y alertas
  {
    operationId: "incidents.list", method: "GET", path: "/incidents", tag: "Incidencias",
    summary: "Incidencias abiertas y cerradas del laboratorio.",
    scope: "incidents:read", hasBody: false,
  },
  {
    operationId: "incidents.create", method: "POST", path: "/incidents", tag: "Incidencias",
    summary: "Reporta una incidencia.",
    scope: "incidents:write", hasBody: true,
  },
  {
    operationId: "incidents.get", method: "GET", path: "/incidents/{id}", tag: "Incidencias",
    summary: "Detalle de una incidencia con su seguimiento.",
    scope: "incidents:read", hasBody: false,
  },
  {
    operationId: "incidents.update", method: "PATCH", path: "/incidents/{id}", tag: "Incidencias",
    summary: "Actualiza el estado o los datos de una incidencia.",
    scope: "incidents:write", hasBody: true,
  },
  {
    operationId: "incidents.comment", method: "POST", path: "/incidents/{id}/comments", tag: "Incidencias",
    summary: "Añade un comentario de seguimiento a una incidencia.",
    scope: "incidents:write", hasBody: true,
  },
  {
    operationId: "alerts.list", method: "GET", path: "/alerts", tag: "Alertas",
    summary: "Alertas abiertas ordenadas por severidad.",
    scope: "alerts:read", hasBody: false,
  },
  {
    operationId: "alerts.update", method: "PATCH", path: "/alerts", tag: "Alertas",
    summary: "Atiende, asigna o cierra una alerta.",
    scope: "alerts:write", hasBody: true,
  },
  {
    operationId: "alerts.rules.list", method: "GET", path: "/alerts/rules", tag: "Alertas",
    summary: "Reglas de generación de alertas configuradas.",
    scope: "alerts:read", hasBody: false,
  },
  {
    operationId: "alerts.rules.create", method: "POST", path: "/alerts/rules", tag: "Alertas",
    summary: "Crea una regla de alerta.",
    scope: "alerts:write", hasBody: true,
  },
  {
    operationId: "alerts.rules.get", method: "GET", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Detalle de una regla de alerta.",
    scope: "alerts:read", hasBody: false,
  },
  {
    operationId: "alerts.rules.update", method: "PATCH", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Actualiza una regla de alerta.",
    scope: "alerts:write", hasBody: true,
  },
  {
    operationId: "alerts.rules.delete", method: "DELETE", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Elimina una regla de alerta.",
    scope: "alerts:write", hasBody: false,
  },

  // ————————————————————————————————— Educación
  {
    operationId: "education.practices.list", method: "GET", path: "/education/practices", tag: "Educación",
    summary: "Prácticas de laboratorio programadas.",
    scope: "education:read", hasBody: false,
  },
  {
    operationId: "education.practices.create", method: "POST", path: "/education/practices", tag: "Educación",
    summary: "Programa una práctica de laboratorio.",
    scope: "education:write", hasBody: true,
  },
  {
    operationId: "education.practices.get", method: "GET", path: "/education/practices/{id}", tag: "Educación",
    summary: "Detalle de una práctica con sus recursos.",
    scope: "education:read", hasBody: false,
  },
  {
    operationId: "education.practices.update", method: "PATCH", path: "/education/practices/{id}", tag: "Educación",
    summary: "Actualiza una práctica.",
    scope: "education:write", hasBody: true,
  },
  {
    operationId: "education.reservations.list", method: "GET", path: "/education/reservations", tag: "Educación",
    summary: "Reservas de recursos del laboratorio.",
    scope: "education:read", hasBody: false,
  },
  {
    operationId: "education.reservations.create", method: "POST", path: "/education/reservations", tag: "Educación",
    summary: "Reserva un recurso para una práctica.",
    scope: "education:write", hasBody: true,
  },
  {
    operationId: "education.reservations.get", method: "GET", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Detalle de una reserva.",
    scope: "education:read", hasBody: false,
  },
  {
    operationId: "education.reservations.update", method: "PATCH", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Actualiza una reserva.",
    scope: "education:write", hasBody: true,
  },
  {
    operationId: "education.reservations.delete", method: "DELETE", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Cancela una reserva.",
    scope: "education:write", hasBody: false,
  },
  {
    operationId: "education.groups.list", method: "GET", path: "/education/groups", tag: "Educación",
    summary: "Grupos y secciones académicas.",
    scope: "education:read", hasBody: false,
  },
  {
    operationId: "education.groups.create", method: "POST", path: "/education/groups", tag: "Educación",
    summary: "Crea un grupo académico.",
    scope: "education:write", hasBody: true,
  },

  // ————————————————————————————————— Investigación
  {
    operationId: "research.projects.list", method: "GET", path: "/research/projects", tag: "Investigación",
    summary: "Proyectos de investigación.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.projects.create", method: "POST", path: "/research/projects", tag: "Investigación",
    summary: "Crea un proyecto de investigación.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.projects.get", method: "GET", path: "/research/projects/{id}", tag: "Investigación",
    summary: "Detalle de un proyecto.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.projects.update", method: "PATCH", path: "/research/projects/{id}", tag: "Investigación",
    summary: "Actualiza un proyecto.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.protocols.list", method: "GET", path: "/research/protocols", tag: "Investigación",
    summary: "Protocolos y procedimientos normalizados.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.protocols.create", method: "POST", path: "/research/protocols", tag: "Investigación",
    summary: "Crea un protocolo.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.protocols.get", method: "GET", path: "/research/protocols/{id}", tag: "Investigación",
    summary: "Detalle de un protocolo y su versión vigente.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.protocols.update", method: "PATCH", path: "/research/protocols/{id}", tag: "Investigación",
    summary: "Actualiza un protocolo.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.samples.list", method: "GET", path: "/research/samples", tag: "Investigación",
    summary: "Muestras de investigación con su trazabilidad.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.samples.create", method: "POST", path: "/research/samples", tag: "Investigación",
    summary: "Registra una muestra de investigación.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.samples.get", method: "GET", path: "/research/samples/{id}", tag: "Investigación",
    summary: "Detalle de una muestra de investigación.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.samples.update", method: "PATCH", path: "/research/samples/{id}", tag: "Investigación",
    summary: "Actualiza una muestra de investigación.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.biobank.list", method: "GET", path: "/research/biobank", tag: "Investigación",
    summary: "Alícuotas y posiciones del biobanco.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.biobank.create", method: "POST", path: "/research/biobank", tag: "Investigación",
    summary: "Registra una alícuota en el biobanco.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.biobank.get", method: "GET", path: "/research/biobank/{id}", tag: "Investigación",
    summary: "Detalle de una alícuota del biobanco.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.biobank.update", method: "PATCH", path: "/research/biobank/{id}", tag: "Investigación",
    summary: "Actualiza una alícuota del biobanco.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.notebooks.list", method: "GET", path: "/research/notebooks", tag: "Investigación",
    summary: "Cuadernos de laboratorio.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.notebooks.create", method: "POST", path: "/research/notebooks", tag: "Investigación",
    summary: "Crea un cuaderno de laboratorio.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.notebooks.entries.list", method: "GET", path: "/research/notebooks/entries", tag: "Investigación",
    summary: "Entradas de cuaderno de laboratorio.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.notebooks.entries.create", method: "POST", path: "/research/notebooks/entries", tag: "Investigación",
    summary: "Añade una entrada al cuaderno.",
    scope: "research:write", hasBody: true,
  },
  {
    operationId: "research.documents.list", method: "GET", path: "/research/documents", tag: "Investigación",
    summary: "Repositorio documental de investigación.",
    scope: "research:read", hasBody: false,
  },
  {
    operationId: "research.documents.create", method: "POST", path: "/research/documents", tag: "Investigación",
    summary: "Registra un documento.",
    scope: "research:write", hasBody: true,
  },

  // ————————————————————————————————— Calidad y trazabilidad
  {
    operationId: "quality.oos.list", method: "GET", path: "/quality/oos", tag: "Calidad",
    summary: "Resultados fuera de especificación pendientes de investigación.",
    scope: "quality:read", hasBody: false,
  },
  {
    operationId: "audit.list", method: "GET", path: "/audit", tag: "Bitácora",
    summary: "Bitácora de auditoría: quién hizo qué, cuándo y por qué.",
    scope: "audit:read", hasBody: false,
    query: [
      { name: "action", description: "Filtra por tipo de acción." },
      { name: "entityType", description: "Filtra por tipo de registro afectado." },
      ...PAGINATION_HINT,
    ],
  },
];

const metaByKey = new Map<string, IntegrationOperationMeta>(
  INTEGRATION_CATALOG.map((operation) => [`${operation.method} ${operation.path}`, operation]),
);

export function findOperationMeta(method: string, path: string): IntegrationOperationMeta | undefined {
  return metaByKey.get(`${method.toUpperCase()} ${path}`);
}

/**
 * Resuelve los segmentos de una petición contra el catálogo.
 *
 * Las rutas concretas ganan sobre las que llevan `{id}`: sin ese desempate,
 * `/inventory/movements` podría resolverse como `/inventory/{id}` y el ERP
 * recibiría el artículo llamado "movements" en vez del kardex.
 */
export function matchOperationMeta(
  method: string,
  segments: string[],
): { operation: IntegrationOperationMeta; id: string | null } | null {
  const upperMethod = method.toUpperCase();
  const candidates = INTEGRATION_CATALOG.filter((operation) => {
    if (operation.method !== upperMethod) return false;
    const template = operation.path.split("/").filter(Boolean);
    if (template.length !== segments.length) return false;
    return template.every((part, index) => part === "{id}" || part === segments[index]);
  });
  if (candidates.length === 0) return null;

  const exact = candidates.find((operation) => !operation.path.includes("{id}"));
  const operation = exact ?? candidates[0];
  const template = operation.path.split("/").filter(Boolean);
  const idIndex = template.indexOf("{id}");
  return { operation, id: idIndex >= 0 ? decodeURIComponent(segments[idIndex]) : null };
}

/** Métodos aceptados para una ruta, para poder responder un 405 honesto. */
export function allowedMethodsFor(segments: string[]): HttpMethod[] {
  const methods = new Set<HttpMethod>();
  for (const operation of INTEGRATION_CATALOG) {
    const template = operation.path.split("/").filter(Boolean);
    if (template.length !== segments.length) continue;
    if (template.every((part, index) => part === "{id}" || part === segments[index])) {
      methods.add(operation.method);
    }
  }
  return [...methods];
}
