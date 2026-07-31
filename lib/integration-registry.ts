import type { IntegrationScope } from "@/lib/integration-scopes";

import { GET as listInventory, POST as createInventory } from "@/app/api/inventory/route";
import { GET as getInventory, PATCH as updateInventory } from "@/app/api/inventory/[id]/route";
import { POST as discardInventory } from "@/app/api/inventory/[id]/discard/route";
import { GET as listInventoryMovements, POST as createInventoryMovement } from "@/app/api/inventory/movements/route";
import { GET as listInventoryCategories, POST as createInventoryCategory, PATCH as updateInventoryCategory } from "@/app/api/inventory/categories/route";
import { GET as listControlledInventory } from "@/app/api/inventory/controlled/route";
import { GET as listControlledRequests, POST as createControlledRequest } from "@/app/api/inventory/controlled/requests/route";
import { PATCH as updateControlledRequest } from "@/app/api/inventory/controlled/requests/[id]/route";
import { GET as listLocations, POST as createLocation } from "@/app/api/locations/route";
import { GET as listEquipment, POST as createEquipment } from "@/app/api/equipment/route";
import { GET as getEquipment, PATCH as updateEquipment } from "@/app/api/equipment/[id]/route";
import { GET as listEquipmentEvents, POST as createEquipmentEvent } from "@/app/api/equipment/events/route";
import { GET as listEquipmentPlans, POST as createEquipmentPlan } from "@/app/api/equipment/plans/route";
import { GET as getEquipmentPlan, PATCH as updateEquipmentPlan, DELETE as deleteEquipmentPlan } from "@/app/api/equipment/plans/[id]/route";
import { GET as listEquipmentCertificates, POST as createEquipmentCertificate } from "@/app/api/equipment/certificates/route";
import { GET as listSpecimens, POST as createSpecimen } from "@/app/api/specimens/route";
import { POST as transitionSpecimen } from "@/app/api/specimens/[id]/transitions/route";
import { GET as listResults, POST as createResult } from "@/app/api/results/route";
import { GET as listPurchasing, POST as createPurchasing } from "@/app/api/purchasing/route";
import { GET as getPurchasing, PATCH as updatePurchasing } from "@/app/api/purchasing/[id]/route";
import { GET as listCompliance } from "@/app/api/compliance/route";
import { GET as listComplianceCatalog, POST as createComplianceCatalog } from "@/app/api/compliance/catalog/route";
import { GET as getComplianceCatalog, PATCH as updateComplianceCatalog } from "@/app/api/compliance/catalog/[id]/route";
import { GET as listPermits, POST as createPermit, PATCH as updatePermit } from "@/app/api/compliance/permits/route";
import { GET as listReceipts, POST as createReceipt } from "@/app/api/compliance/receipts/route";
import { GET as listCounts, POST as createCount } from "@/app/api/compliance/counts/route";
import { GET as getCount, PATCH as updateCount } from "@/app/api/compliance/counts/[id]/route";
import { GET as listDisposals, POST as createDisposal } from "@/app/api/compliance/disposals/route";
import { GET as complianceReports } from "@/app/api/compliance/reports/route";
import { GET as listIncidents, POST as createIncident } from "@/app/api/incidents/route";
import { GET as getIncident, PATCH as updateIncident } from "@/app/api/incidents/[id]/route";
import { POST as commentIncident } from "@/app/api/incidents/[id]/comments/route";
import { GET as listAlerts, PATCH as updateAlert } from "@/app/api/alerts/route";
import { GET as listAlertRules, POST as createAlertRule } from "@/app/api/alerts/rules/route";
import { GET as getAlertRule, PATCH as updateAlertRule, DELETE as deleteAlertRule } from "@/app/api/alerts/rules/[id]/route";
import { GET as listPractices, POST as createPractice } from "@/app/api/education/practices/route";
import { GET as getPractice, PATCH as updatePractice } from "@/app/api/education/practices/[id]/route";
import { GET as listReservations, POST as createReservation } from "@/app/api/education/reservations/route";
import { GET as getReservation, PATCH as updateReservation, DELETE as deleteReservation } from "@/app/api/education/reservations/[id]/route";
import { GET as listGroups, POST as createGroup } from "@/app/api/education/groups/route";
import { GET as listProjects, POST as createProject } from "@/app/api/research/projects/route";
import { GET as getProject, PATCH as updateProject } from "@/app/api/research/projects/[id]/route";
import { GET as listProtocols, POST as createProtocol } from "@/app/api/research/protocols/route";
import { GET as getProtocol, PATCH as updateProtocol } from "@/app/api/research/protocols/[id]/route";
import { GET as listResearchSamples, POST as createResearchSample } from "@/app/api/research/samples/route";
import { GET as getResearchSample, PATCH as updateResearchSample } from "@/app/api/research/samples/[id]/route";
import { GET as listBiobank, POST as createBiobank } from "@/app/api/research/biobank/route";
import { GET as getBiobank, PATCH as updateBiobank } from "@/app/api/research/biobank/[id]/route";
import { GET as listNotebooks, POST as createNotebook } from "@/app/api/research/notebooks/route";
import { GET as listNotebookEntries, POST as createNotebookEntry } from "@/app/api/research/notebooks/entries/route";
import { GET as listResearchDocuments, POST as createResearchDocument } from "@/app/api/research/documents/route";
import { GET as listQualityOos } from "@/app/api/quality/oos/route";
import { GET as listAudit } from "@/app/api/audit/route";

// Catálogo único de lo que el gateway /api/v1 expone al exterior.
//
// La regla que hace sostenible todo esto: una operación NO reimplementa nada,
// solo apunta al handler que ya usa la aplicación web. Así el ERP pasa por la
// misma validación Zod, los mismos permisos, el mismo alcance por
// laboratory_id, los mismos flujos de reactivos controlados y la misma
// bitácora. Cuando una regla de negocio cambia, cambia para los dos a la vez;
// es imposible que la integración se quede con la versión vieja.
//
// De esta misma tabla sale el OpenAPI (lib/integration-openapi.ts), de modo
// que el contrato publicado nunca puede divergir de lo que de verdad responde.

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type OperationQueryParam = {
  name: string;
  description: string;
};

export type IntegrationOperation = {
  operationId: string;
  method: HttpMethod;
  /** Ruta pública relativa a /api/v1, con `{id}` donde va el identificador. */
  path: string;
  tag: string;
  summary: string;
  scope: IntegrationScope;
  hasBody: boolean;
  query?: OperationQueryParam[];
  invoke: (context: { request: Request; id: string | null }) => Promise<Response>;
};

/** Contexto de ruta que esperan los handlers de segmento dinámico de Next. */
function idContext(id: string | null): { params: Promise<{ id: string }> } {
  if (!id) throw new Error("Esta operación requiere el identificador del registro en la ruta.");
  return { params: Promise.resolve({ id }) };
}

const PAGINATION_HINT: OperationQueryParam[] = [
  { name: "limit", description: "Máximo de registros a devolver (1-500, por omisión 100)." },
  { name: "offset", description: "Registros a omitir desde el inicio, para paginar." },
];

export const INTEGRATION_OPERATIONS: IntegrationOperation[] = [
  // ————————————————————————————————— Inventario
  {
    operationId: "inventory.items.list", method: "GET", path: "/inventory/items", tag: "Inventario",
    summary: "Lista los artículos de inventario activos con existencia, lote y vencimiento.",
    scope: "inventory:read", hasBody: false, query: PAGINATION_HINT,
    invoke: () => listInventory(),
  },
  {
    operationId: "inventory.items.create", method: "POST", path: "/inventory/items", tag: "Inventario",
    summary: "Da de alta un artículo de inventario y genera su etiqueta QR.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => createInventory(request),
  },
  {
    operationId: "inventory.items.get", method: "GET", path: "/inventory/items/{id}", tag: "Inventario",
    summary: "Obtiene el detalle completo de un artículo de inventario.",
    scope: "inventory:read", hasBody: false,
    invoke: ({ request, id }) => getInventory(request, idContext(id)),
  },
  {
    operationId: "inventory.items.update", method: "PATCH", path: "/inventory/items/{id}", tag: "Inventario",
    summary: "Actualiza los datos de un artículo de inventario.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request, id }) => updateInventory(request, idContext(id)),
  },
  {
    operationId: "inventory.items.discard", method: "POST", path: "/inventory/items/{id}/discard", tag: "Inventario",
    summary: "Registra la baja o descarte de un artículo de inventario.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request, id }) => discardInventory(request, idContext(id)),
  },
  {
    operationId: "inventory.movements.list", method: "GET", path: "/inventory/movements", tag: "Inventario",
    summary: "Kardex de movimientos de existencia (solo anexado).",
    scope: "inventory:read", hasBody: false, query: PAGINATION_HINT,
    invoke: () => listInventoryMovements(),
  },
  {
    operationId: "inventory.movements.create", method: "POST", path: "/inventory/movements", tag: "Inventario",
    summary: "Registra una entrada, salida o ajuste de existencia.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => createInventoryMovement(request),
  },
  {
    operationId: "inventory.categories.list", method: "GET", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Categorías de inventario, para mapear contra las del ERP.",
    scope: "catalog:read", hasBody: false,
    invoke: () => listInventoryCategories(),
  },
  {
    operationId: "inventory.categories.create", method: "POST", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Crea una categoría de inventario.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => createInventoryCategory(request),
  },
  {
    operationId: "inventory.categories.update", method: "PATCH", path: "/inventory/categories", tag: "Datos maestros",
    summary: "Actualiza una categoría de inventario.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => updateInventoryCategory(request),
  },
  {
    operationId: "inventory.controlled.list", method: "GET", path: "/inventory/controlled", tag: "Inventario",
    summary: "Artículos marcados como reactivo controlado, de doble uso o precursor.",
    scope: "inventory:read", hasBody: false,
    invoke: ({ request }) => listControlledInventory(request),
  },
  {
    operationId: "inventory.controlled.requests.list", method: "GET", path: "/inventory/controlled/requests", tag: "Inventario",
    summary: "Solicitudes de autorización de uso de reactivo controlado.",
    scope: "inventory:read", hasBody: false,
    invoke: ({ request }) => listControlledRequests(request),
  },
  {
    operationId: "inventory.controlled.requests.create", method: "POST", path: "/inventory/controlled/requests", tag: "Inventario",
    summary: "Crea una solicitud de uso de reactivo controlado.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => createControlledRequest(request),
  },
  {
    operationId: "inventory.controlled.requests.update", method: "PATCH", path: "/inventory/controlled/requests/{id}", tag: "Inventario",
    summary: "Resuelve (autoriza o rechaza) una solicitud de uso controlado.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request, id }) => updateControlledRequest(request, idContext(id)),
  },
  {
    operationId: "locations.list", method: "GET", path: "/locations", tag: "Datos maestros",
    summary: "Ubicaciones de almacenamiento del laboratorio.",
    scope: "catalog:read", hasBody: false,
    invoke: () => listLocations(),
  },
  {
    operationId: "locations.create", method: "POST", path: "/locations", tag: "Datos maestros",
    summary: "Crea una ubicación de almacenamiento.",
    scope: "inventory:write", hasBody: true,
    invoke: ({ request }) => createLocation(request),
  },

  // ————————————————————————————————— Equipos
  {
    operationId: "equipment.list", method: "GET", path: "/equipment", tag: "Equipos",
    summary: "Equipos del laboratorio con estado, calibración y próximo mantenimiento.",
    scope: "equipment:read", hasBody: false,
    invoke: () => listEquipment(),
  },
  {
    operationId: "equipment.create", method: "POST", path: "/equipment", tag: "Equipos",
    summary: "Da de alta un equipo.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request }) => createEquipment(request),
  },
  {
    operationId: "equipment.get", method: "GET", path: "/equipment/{id}", tag: "Equipos",
    summary: "Detalle de un equipo.",
    scope: "equipment:read", hasBody: false,
    invoke: ({ request, id }) => getEquipment(request, idContext(id)),
  },
  {
    operationId: "equipment.update", method: "PATCH", path: "/equipment/{id}", tag: "Equipos",
    summary: "Actualiza los datos de un equipo.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request, id }) => updateEquipment(request, idContext(id)),
  },
  {
    operationId: "equipment.events.list", method: "GET", path: "/equipment/events", tag: "Equipos",
    summary: "Eventos de equipo: calibraciones, mantenimientos y verificaciones.",
    scope: "equipment:read", hasBody: false,
    invoke: () => listEquipmentEvents(),
  },
  {
    operationId: "equipment.events.create", method: "POST", path: "/equipment/events", tag: "Equipos",
    summary: "Registra un evento de calibración o mantenimiento.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request }) => createEquipmentEvent(request),
  },
  {
    operationId: "equipment.plans.list", method: "GET", path: "/equipment/plans", tag: "Equipos",
    summary: "Planes de mantenimiento y calibración programados.",
    scope: "equipment:read", hasBody: false,
    invoke: () => listEquipmentPlans(),
  },
  {
    operationId: "equipment.plans.create", method: "POST", path: "/equipment/plans", tag: "Equipos",
    summary: "Crea un plan de mantenimiento o calibración.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request }) => createEquipmentPlan(request),
  },
  {
    operationId: "equipment.plans.get", method: "GET", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Detalle de un plan de mantenimiento.",
    scope: "equipment:read", hasBody: false,
    invoke: ({ request, id }) => getEquipmentPlan(request, idContext(id)),
  },
  {
    operationId: "equipment.plans.update", method: "PATCH", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Actualiza un plan de mantenimiento.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request, id }) => updateEquipmentPlan(request, idContext(id)),
  },
  {
    operationId: "equipment.plans.delete", method: "DELETE", path: "/equipment/plans/{id}", tag: "Equipos",
    summary: "Elimina un plan de mantenimiento.",
    scope: "equipment:write", hasBody: false,
    invoke: ({ request, id }) => deleteEquipmentPlan(request, idContext(id)),
  },
  {
    operationId: "equipment.certificates.list", method: "GET", path: "/equipment/certificates", tag: "Equipos",
    summary: "Certificados de calibración registrados.",
    scope: "equipment:read", hasBody: false,
    invoke: () => listEquipmentCertificates(),
  },
  {
    operationId: "equipment.certificates.create", method: "POST", path: "/equipment/certificates", tag: "Equipos",
    summary: "Registra un certificado de calibración.",
    scope: "equipment:write", hasBody: true,
    invoke: ({ request }) => createEquipmentCertificate(request),
  },

  // ————————————————————————————————— Muestras y resultados
  {
    operationId: "specimens.list", method: "GET", path: "/specimens", tag: "Muestras",
    summary: "Muestras recibidas con su estado en el flujo de trabajo.",
    scope: "specimens:read", hasBody: false,
    invoke: () => listSpecimens(),
  },
  {
    operationId: "specimens.create", method: "POST", path: "/specimens", tag: "Muestras",
    summary: "Recibe una muestra y genera su número de acceso.",
    scope: "specimens:write", hasBody: true,
    invoke: ({ request }) => createSpecimen(request),
  },
  {
    operationId: "specimens.transition", method: "POST", path: "/specimens/{id}/transitions", tag: "Muestras",
    summary: "Mueve una muestra al siguiente estado del flujo configurado.",
    scope: "specimens:write", hasBody: true,
    invoke: ({ request, id }) => transitionSpecimen(request, idContext(id)),
  },
  {
    operationId: "results.list", method: "GET", path: "/results", tag: "Resultados",
    summary: "Resultados registrados con su método, versión y estado.",
    scope: "results:read", hasBody: false,
    invoke: () => listResults(),
  },
  {
    operationId: "results.create", method: "POST", path: "/results", tag: "Resultados",
    summary: "Registra un resultado analítico.",
    scope: "results:write", hasBody: true,
    invoke: ({ request }) => createResult(request),
  },

  // ————————————————————————————————— Compras (el puente natural con el ERP)
  {
    operationId: "purchasing.requests.list", method: "GET", path: "/purchasing/requests", tag: "Compras",
    summary: "Solicitudes de compra con su estado de aprobación.",
    scope: "purchasing:read", hasBody: false,
    invoke: () => listPurchasing(),
  },
  {
    operationId: "purchasing.requests.create", method: "POST", path: "/purchasing/requests", tag: "Compras",
    summary: "Crea una solicitud de compra.",
    scope: "purchasing:write", hasBody: true,
    invoke: ({ request }) => createPurchasing(request),
  },
  {
    operationId: "purchasing.requests.get", method: "GET", path: "/purchasing/requests/{id}", tag: "Compras",
    summary: "Detalle de una solicitud de compra con sus renglones.",
    scope: "purchasing:read", hasBody: false,
    invoke: ({ request, id }) => getPurchasing(request, idContext(id)),
  },
  {
    operationId: "purchasing.requests.update", method: "PATCH", path: "/purchasing/requests/{id}", tag: "Compras",
    summary: "Actualiza o cambia el estado de una solicitud de compra.",
    scope: "purchasing:write", hasBody: true,
    invoke: ({ request, id }) => updatePurchasing(request, idContext(id)),
  },

  // ————————————————————————————————— Cumplimiento
  {
    operationId: "compliance.summary", method: "GET", path: "/compliance", tag: "Cumplimiento",
    summary: "Resumen del estado de cumplimiento del laboratorio.",
    scope: "compliance:read", hasBody: false,
    invoke: () => listCompliance(),
  },
  {
    operationId: "compliance.catalog.list", method: "GET", path: "/compliance/catalog", tag: "Cumplimiento",
    summary: "Catálogo de sustancias con CAS, clasificación y requisitos.",
    scope: "compliance:read", hasBody: false,
    invoke: ({ request }) => listComplianceCatalog(request),
  },
  {
    operationId: "compliance.catalog.create", method: "POST", path: "/compliance/catalog", tag: "Cumplimiento",
    summary: "Añade una sustancia al catálogo de reactivos.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => createComplianceCatalog(request),
  },
  {
    operationId: "compliance.catalog.get", method: "GET", path: "/compliance/catalog/{id}", tag: "Cumplimiento",
    summary: "Detalle de una sustancia del catálogo.",
    scope: "compliance:read", hasBody: false,
    invoke: ({ request, id }) => getComplianceCatalog(request, idContext(id)),
  },
  {
    operationId: "compliance.catalog.update", method: "PATCH", path: "/compliance/catalog/{id}", tag: "Cumplimiento",
    summary: "Actualiza una sustancia del catálogo.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request, id }) => updateComplianceCatalog(request, idContext(id)),
  },
  {
    operationId: "compliance.permits.list", method: "GET", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Licencias y permisos vigentes del laboratorio.",
    scope: "compliance:read", hasBody: false,
    invoke: () => listPermits(),
  },
  {
    operationId: "compliance.permits.create", method: "POST", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Registra una licencia o permiso.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => createPermit(request),
  },
  {
    operationId: "compliance.permits.update", method: "PATCH", path: "/compliance/permits", tag: "Cumplimiento",
    summary: "Actualiza una licencia o permiso.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => updatePermit(request),
  },
  {
    operationId: "compliance.receipts.list", method: "GET", path: "/compliance/receipts", tag: "Cumplimiento",
    summary: "Recepciones con factura, orden de compra, licencia y permiso.",
    scope: "compliance:read", hasBody: false,
    invoke: ({ request }) => listReceipts(request),
  },
  {
    operationId: "compliance.receipts.create", method: "POST", path: "/compliance/receipts", tag: "Cumplimiento",
    summary: "Registra la recepción documentada de material controlado.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => createReceipt(request),
  },
  {
    operationId: "compliance.counts.list", method: "GET", path: "/compliance/counts", tag: "Cumplimiento",
    summary: "Conteos físicos de existencia realizados.",
    scope: "compliance:read", hasBody: false,
    invoke: () => listCounts(),
  },
  {
    operationId: "compliance.counts.create", method: "POST", path: "/compliance/counts", tag: "Cumplimiento",
    summary: "Abre un conteo físico de existencia.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => createCount(request),
  },
  {
    operationId: "compliance.counts.get", method: "GET", path: "/compliance/counts/{id}", tag: "Cumplimiento",
    summary: "Detalle de un conteo físico y sus diferencias.",
    scope: "compliance:read", hasBody: false,
    invoke: ({ request, id }) => getCount(request, idContext(id)),
  },
  {
    operationId: "compliance.counts.update", method: "PATCH", path: "/compliance/counts/{id}", tag: "Cumplimiento",
    summary: "Actualiza o cierra un conteo físico.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request, id }) => updateCount(request, idContext(id)),
  },
  {
    operationId: "compliance.disposals.list", method: "GET", path: "/compliance/disposals", tag: "Cumplimiento",
    summary: "Destrucciones y disposiciones registradas.",
    scope: "compliance:read", hasBody: false,
    invoke: () => listDisposals(),
  },
  {
    operationId: "compliance.disposals.create", method: "POST", path: "/compliance/disposals", tag: "Cumplimiento",
    summary: "Registra una destrucción o disposición de material.",
    scope: "compliance:write", hasBody: true,
    invoke: ({ request }) => createDisposal(request),
  },
  {
    operationId: "compliance.reports", method: "GET", path: "/compliance/reports", tag: "Cumplimiento",
    summary: "Filas ya formateadas de los reportes regulatorios.",
    scope: "compliance:read", hasBody: false,
    query: [{ name: "type", description: "Tipo de reporte a generar." }],
    invoke: ({ request }) => complianceReports(request),
  },

  // ————————————————————————————————— Incidencias y alertas
  {
    operationId: "incidents.list", method: "GET", path: "/incidents", tag: "Incidencias",
    summary: "Incidencias abiertas y cerradas del laboratorio.",
    scope: "incidents:read", hasBody: false,
    invoke: () => listIncidents(),
  },
  {
    operationId: "incidents.create", method: "POST", path: "/incidents", tag: "Incidencias",
    summary: "Reporta una incidencia.",
    scope: "incidents:write", hasBody: true,
    invoke: ({ request }) => createIncident(request),
  },
  {
    operationId: "incidents.get", method: "GET", path: "/incidents/{id}", tag: "Incidencias",
    summary: "Detalle de una incidencia con su seguimiento.",
    scope: "incidents:read", hasBody: false,
    invoke: ({ request, id }) => getIncident(request, idContext(id)),
  },
  {
    operationId: "incidents.update", method: "PATCH", path: "/incidents/{id}", tag: "Incidencias",
    summary: "Actualiza el estado o los datos de una incidencia.",
    scope: "incidents:write", hasBody: true,
    invoke: ({ request, id }) => updateIncident(request, idContext(id)),
  },
  {
    operationId: "incidents.comment", method: "POST", path: "/incidents/{id}/comments", tag: "Incidencias",
    summary: "Añade un comentario de seguimiento a una incidencia.",
    scope: "incidents:write", hasBody: true,
    invoke: ({ request, id }) => commentIncident(request, idContext(id)),
  },
  {
    operationId: "alerts.list", method: "GET", path: "/alerts", tag: "Alertas",
    summary: "Alertas abiertas ordenadas por severidad.",
    scope: "alerts:read", hasBody: false,
    invoke: () => listAlerts(),
  },
  {
    operationId: "alerts.update", method: "PATCH", path: "/alerts", tag: "Alertas",
    summary: "Atiende, asigna o cierra una alerta.",
    scope: "alerts:write", hasBody: true,
    invoke: ({ request }) => updateAlert(request),
  },
  {
    operationId: "alerts.rules.list", method: "GET", path: "/alerts/rules", tag: "Alertas",
    summary: "Reglas de generación de alertas configuradas.",
    scope: "alerts:read", hasBody: false,
    invoke: () => listAlertRules(),
  },
  {
    operationId: "alerts.rules.create", method: "POST", path: "/alerts/rules", tag: "Alertas",
    summary: "Crea una regla de alerta.",
    scope: "alerts:write", hasBody: true,
    invoke: ({ request }) => createAlertRule(request),
  },
  {
    operationId: "alerts.rules.get", method: "GET", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Detalle de una regla de alerta.",
    scope: "alerts:read", hasBody: false,
    invoke: ({ request, id }) => getAlertRule(request, idContext(id)),
  },
  {
    operationId: "alerts.rules.update", method: "PATCH", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Actualiza una regla de alerta.",
    scope: "alerts:write", hasBody: true,
    invoke: ({ request, id }) => updateAlertRule(request, idContext(id)),
  },
  {
    operationId: "alerts.rules.delete", method: "DELETE", path: "/alerts/rules/{id}", tag: "Alertas",
    summary: "Elimina una regla de alerta.",
    scope: "alerts:write", hasBody: false,
    invoke: ({ request, id }) => deleteAlertRule(request, idContext(id)),
  },

  // ————————————————————————————————— Educación
  {
    operationId: "education.practices.list", method: "GET", path: "/education/practices", tag: "Educación",
    summary: "Prácticas de laboratorio programadas.",
    scope: "education:read", hasBody: false,
    invoke: () => listPractices(),
  },
  {
    operationId: "education.practices.create", method: "POST", path: "/education/practices", tag: "Educación",
    summary: "Programa una práctica de laboratorio.",
    scope: "education:write", hasBody: true,
    invoke: ({ request }) => createPractice(request),
  },
  {
    operationId: "education.practices.get", method: "GET", path: "/education/practices/{id}", tag: "Educación",
    summary: "Detalle de una práctica con sus recursos.",
    scope: "education:read", hasBody: false,
    invoke: ({ request, id }) => getPractice(request, idContext(id)),
  },
  {
    operationId: "education.practices.update", method: "PATCH", path: "/education/practices/{id}", tag: "Educación",
    summary: "Actualiza una práctica.",
    scope: "education:write", hasBody: true,
    invoke: ({ request, id }) => updatePractice(request, idContext(id)),
  },
  {
    operationId: "education.reservations.list", method: "GET", path: "/education/reservations", tag: "Educación",
    summary: "Reservas de recursos del laboratorio.",
    scope: "education:read", hasBody: false,
    invoke: () => listReservations(),
  },
  {
    operationId: "education.reservations.create", method: "POST", path: "/education/reservations", tag: "Educación",
    summary: "Reserva un recurso para una práctica.",
    scope: "education:write", hasBody: true,
    invoke: ({ request }) => createReservation(request),
  },
  {
    operationId: "education.reservations.get", method: "GET", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Detalle de una reserva.",
    scope: "education:read", hasBody: false,
    invoke: ({ request, id }) => getReservation(request, idContext(id)),
  },
  {
    operationId: "education.reservations.update", method: "PATCH", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Actualiza una reserva.",
    scope: "education:write", hasBody: true,
    invoke: ({ request, id }) => updateReservation(request, idContext(id)),
  },
  {
    operationId: "education.reservations.delete", method: "DELETE", path: "/education/reservations/{id}", tag: "Educación",
    summary: "Cancela una reserva.",
    scope: "education:write", hasBody: false,
    invoke: ({ request, id }) => deleteReservation(request, idContext(id)),
  },
  {
    operationId: "education.groups.list", method: "GET", path: "/education/groups", tag: "Educación",
    summary: "Grupos y secciones académicas.",
    scope: "education:read", hasBody: false,
    invoke: () => listGroups(),
  },
  {
    operationId: "education.groups.create", method: "POST", path: "/education/groups", tag: "Educación",
    summary: "Crea un grupo académico.",
    scope: "education:write", hasBody: true,
    invoke: ({ request }) => createGroup(request),
  },

  // ————————————————————————————————— Investigación
  {
    operationId: "research.projects.list", method: "GET", path: "/research/projects", tag: "Investigación",
    summary: "Proyectos de investigación.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listProjects(request),
  },
  {
    operationId: "research.projects.create", method: "POST", path: "/research/projects", tag: "Investigación",
    summary: "Crea un proyecto de investigación.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createProject(request),
  },
  {
    operationId: "research.projects.get", method: "GET", path: "/research/projects/{id}", tag: "Investigación",
    summary: "Detalle de un proyecto.",
    scope: "research:read", hasBody: false,
    invoke: ({ request, id }) => getProject(request, idContext(id)),
  },
  {
    operationId: "research.projects.update", method: "PATCH", path: "/research/projects/{id}", tag: "Investigación",
    summary: "Actualiza un proyecto.",
    scope: "research:write", hasBody: true,
    invoke: ({ request, id }) => updateProject(request, idContext(id)),
  },
  {
    operationId: "research.protocols.list", method: "GET", path: "/research/protocols", tag: "Investigación",
    summary: "Protocolos y procedimientos normalizados.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listProtocols(request),
  },
  {
    operationId: "research.protocols.create", method: "POST", path: "/research/protocols", tag: "Investigación",
    summary: "Crea un protocolo.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createProtocol(request),
  },
  {
    operationId: "research.protocols.get", method: "GET", path: "/research/protocols/{id}", tag: "Investigación",
    summary: "Detalle de un protocolo y su versión vigente.",
    scope: "research:read", hasBody: false,
    invoke: ({ request, id }) => getProtocol(request, idContext(id)),
  },
  {
    operationId: "research.protocols.update", method: "PATCH", path: "/research/protocols/{id}", tag: "Investigación",
    summary: "Actualiza un protocolo.",
    scope: "research:write", hasBody: true,
    invoke: ({ request, id }) => updateProtocol(request, idContext(id)),
  },
  {
    operationId: "research.samples.list", method: "GET", path: "/research/samples", tag: "Investigación",
    summary: "Muestras de investigación con su trazabilidad.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listResearchSamples(request),
  },
  {
    operationId: "research.samples.create", method: "POST", path: "/research/samples", tag: "Investigación",
    summary: "Registra una muestra de investigación.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createResearchSample(request),
  },
  {
    operationId: "research.samples.get", method: "GET", path: "/research/samples/{id}", tag: "Investigación",
    summary: "Detalle de una muestra de investigación.",
    scope: "research:read", hasBody: false,
    invoke: ({ request, id }) => getResearchSample(request, idContext(id)),
  },
  {
    operationId: "research.samples.update", method: "PATCH", path: "/research/samples/{id}", tag: "Investigación",
    summary: "Actualiza una muestra de investigación.",
    scope: "research:write", hasBody: true,
    invoke: ({ request, id }) => updateResearchSample(request, idContext(id)),
  },
  {
    operationId: "research.biobank.list", method: "GET", path: "/research/biobank", tag: "Investigación",
    summary: "Alícuotas y posiciones del biobanco.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listBiobank(request),
  },
  {
    operationId: "research.biobank.create", method: "POST", path: "/research/biobank", tag: "Investigación",
    summary: "Registra una alícuota en el biobanco.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createBiobank(request),
  },
  {
    operationId: "research.biobank.get", method: "GET", path: "/research/biobank/{id}", tag: "Investigación",
    summary: "Detalle de una alícuota del biobanco.",
    scope: "research:read", hasBody: false,
    invoke: ({ request, id }) => getBiobank(request, idContext(id)),
  },
  {
    operationId: "research.biobank.update", method: "PATCH", path: "/research/biobank/{id}", tag: "Investigación",
    summary: "Actualiza una alícuota del biobanco.",
    scope: "research:write", hasBody: true,
    invoke: ({ request, id }) => updateBiobank(request, idContext(id)),
  },
  {
    operationId: "research.notebooks.list", method: "GET", path: "/research/notebooks", tag: "Investigación",
    summary: "Cuadernos de laboratorio.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listNotebooks(request),
  },
  {
    operationId: "research.notebooks.create", method: "POST", path: "/research/notebooks", tag: "Investigación",
    summary: "Crea un cuaderno de laboratorio.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createNotebook(request),
  },
  {
    operationId: "research.notebooks.entries.list", method: "GET", path: "/research/notebooks/entries", tag: "Investigación",
    summary: "Entradas de cuaderno de laboratorio.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listNotebookEntries(request),
  },
  {
    operationId: "research.notebooks.entries.create", method: "POST", path: "/research/notebooks/entries", tag: "Investigación",
    summary: "Añade una entrada al cuaderno.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createNotebookEntry(request),
  },
  {
    operationId: "research.documents.list", method: "GET", path: "/research/documents", tag: "Investigación",
    summary: "Repositorio documental de investigación.",
    scope: "research:read", hasBody: false,
    invoke: ({ request }) => listResearchDocuments(request),
  },
  {
    operationId: "research.documents.create", method: "POST", path: "/research/documents", tag: "Investigación",
    summary: "Registra un documento.",
    scope: "research:write", hasBody: true,
    invoke: ({ request }) => createResearchDocument(request),
  },

  // ————————————————————————————————— Calidad y trazabilidad
  {
    operationId: "quality.oos.list", method: "GET", path: "/quality/oos", tag: "Calidad",
    summary: "Resultados fuera de especificación pendientes de investigación.",
    scope: "quality:read", hasBody: false,
    invoke: () => listQualityOos(),
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
    invoke: ({ request }) => listAudit(request),
  },
];

const operationsByKey = new Map<string, IntegrationOperation>(
  INTEGRATION_OPERATIONS.map((operation) => [`${operation.method} ${operation.path}`, operation]),
);

export function findOperation(method: string, path: string): IntegrationOperation | undefined {
  return operationsByKey.get(`${method.toUpperCase()} ${path}`);
}

/**
 * Resuelve los segmentos de una petición contra el catálogo.
 *
 * Las rutas concretas ganan sobre las que llevan `{id}`: sin ese desempate,
 * `/inventory/movements` podría resolverse como `/inventory/{id}` y el ERP
 * recibiría el artículo llamado "movements" en vez del kardex.
 */
export function matchOperation(
  method: string,
  segments: string[],
): { operation: IntegrationOperation; id: string | null } | null {
  const upperMethod = method.toUpperCase();
  const candidates = INTEGRATION_OPERATIONS.filter((operation) => {
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
  for (const operation of INTEGRATION_OPERATIONS) {
    const template = operation.path.split("/").filter(Boolean);
    if (template.length !== segments.length) continue;
    if (template.every((part, index) => part === "{id}" || part === segments[index])) {
      methods.add(operation.method);
    }
  }
  return [...methods];
}
