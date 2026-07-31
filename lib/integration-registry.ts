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

import {
  INTEGRATION_CATALOG,
  matchOperationMeta,
  type IntegrationOperationMeta,
} from "@/lib/integration-catalog";

// Enlace entre el contrato y la aplicación: para cada operación del catálogo,
// el handler nativo que la atiende.
//
// La regla que hace sostenible todo esto: una operación NO reimplementa nada,
// solo apunta al handler que ya usa la interfaz web. Así el ERP pasa por la
// misma validación Zod, los mismos permisos, el mismo alcance por
// laboratory_id, los mismos flujos de reactivos controlados y la misma
// bitácora. Cuando una regla de negocio cambia, cambia para los dos a la vez;
// es imposible que la integración se quede con la versión vieja.
//
// El QUÉ (rutas, alcances, descripciones) vive en lib/integration-catalog.ts.
// Esa separación es lo que permite publicar el contrato —OpenAPI y la página
// /docs/api— sin arrastrar los handlers del servidor.

export type { HttpMethod, OperationQueryParam, IntegrationOperationMeta } from "@/lib/integration-catalog";
export { allowedMethodsFor } from "@/lib/integration-catalog";

export type OperationInvoker = (context: { request: Request; id: string | null }) => Promise<Response>;

export type IntegrationOperation = IntegrationOperationMeta & {
  invoke: OperationInvoker;
};

/** Contexto de ruta que esperan los handlers de segmento dinámico de Next. */
function idContext(id: string | null): { params: Promise<{ id: string }> } {
  if (!id) throw new Error("Esta operación requiere el identificador del registro en la ruta.");
  return { params: Promise.resolve({ id }) };
}

const INVOKERS: Record<string, OperationInvoker> = {
  "inventory.items.list": () => listInventory(),
  "inventory.items.create": ({ request }) => createInventory(request),
  "inventory.items.get": ({ request, id }) => getInventory(request, idContext(id)),
  "inventory.items.update": ({ request, id }) => updateInventory(request, idContext(id)),
  "inventory.items.discard": ({ request, id }) => discardInventory(request, idContext(id)),
  "inventory.movements.list": () => listInventoryMovements(),
  "inventory.movements.create": ({ request }) => createInventoryMovement(request),
  "inventory.categories.list": () => listInventoryCategories(),
  "inventory.categories.create": ({ request }) => createInventoryCategory(request),
  "inventory.categories.update": ({ request }) => updateInventoryCategory(request),
  "inventory.controlled.list": ({ request }) => listControlledInventory(request),
  "inventory.controlled.requests.list": ({ request }) => listControlledRequests(request),
  "inventory.controlled.requests.create": ({ request }) => createControlledRequest(request),
  "inventory.controlled.requests.update": ({ request, id }) => updateControlledRequest(request, idContext(id)),
  "locations.list": () => listLocations(),
  "locations.create": ({ request }) => createLocation(request),
  "equipment.list": () => listEquipment(),
  "equipment.create": ({ request }) => createEquipment(request),
  "equipment.get": ({ request, id }) => getEquipment(request, idContext(id)),
  "equipment.update": ({ request, id }) => updateEquipment(request, idContext(id)),
  "equipment.events.list": () => listEquipmentEvents(),
  "equipment.events.create": ({ request }) => createEquipmentEvent(request),
  "equipment.plans.list": () => listEquipmentPlans(),
  "equipment.plans.create": ({ request }) => createEquipmentPlan(request),
  "equipment.plans.get": ({ request, id }) => getEquipmentPlan(request, idContext(id)),
  "equipment.plans.update": ({ request, id }) => updateEquipmentPlan(request, idContext(id)),
  "equipment.plans.delete": ({ request, id }) => deleteEquipmentPlan(request, idContext(id)),
  "equipment.certificates.list": () => listEquipmentCertificates(),
  "equipment.certificates.create": ({ request }) => createEquipmentCertificate(request),
  "specimens.list": () => listSpecimens(),
  "specimens.create": ({ request }) => createSpecimen(request),
  "specimens.transition": ({ request, id }) => transitionSpecimen(request, idContext(id)),
  "results.list": () => listResults(),
  "results.create": ({ request }) => createResult(request),
  "purchasing.requests.list": () => listPurchasing(),
  "purchasing.requests.create": ({ request }) => createPurchasing(request),
  "purchasing.requests.get": ({ request, id }) => getPurchasing(request, idContext(id)),
  "purchasing.requests.update": ({ request, id }) => updatePurchasing(request, idContext(id)),
  "compliance.summary": () => listCompliance(),
  "compliance.catalog.list": ({ request }) => listComplianceCatalog(request),
  "compliance.catalog.create": ({ request }) => createComplianceCatalog(request),
  "compliance.catalog.get": ({ request, id }) => getComplianceCatalog(request, idContext(id)),
  "compliance.catalog.update": ({ request, id }) => updateComplianceCatalog(request, idContext(id)),
  "compliance.permits.list": () => listPermits(),
  "compliance.permits.create": ({ request }) => createPermit(request),
  "compliance.permits.update": ({ request }) => updatePermit(request),
  "compliance.receipts.list": ({ request }) => listReceipts(request),
  "compliance.receipts.create": ({ request }) => createReceipt(request),
  "compliance.counts.list": () => listCounts(),
  "compliance.counts.create": ({ request }) => createCount(request),
  "compliance.counts.get": ({ request, id }) => getCount(request, idContext(id)),
  "compliance.counts.update": ({ request, id }) => updateCount(request, idContext(id)),
  "compliance.disposals.list": () => listDisposals(),
  "compliance.disposals.create": ({ request }) => createDisposal(request),
  "compliance.reports": ({ request }) => complianceReports(request),
  "incidents.list": () => listIncidents(),
  "incidents.create": ({ request }) => createIncident(request),
  "incidents.get": ({ request, id }) => getIncident(request, idContext(id)),
  "incidents.update": ({ request, id }) => updateIncident(request, idContext(id)),
  "incidents.comment": ({ request, id }) => commentIncident(request, idContext(id)),
  "alerts.list": () => listAlerts(),
  "alerts.update": ({ request }) => updateAlert(request),
  "alerts.rules.list": () => listAlertRules(),
  "alerts.rules.create": ({ request }) => createAlertRule(request),
  "alerts.rules.get": ({ request, id }) => getAlertRule(request, idContext(id)),
  "alerts.rules.update": ({ request, id }) => updateAlertRule(request, idContext(id)),
  "alerts.rules.delete": ({ request, id }) => deleteAlertRule(request, idContext(id)),
  "education.practices.list": () => listPractices(),
  "education.practices.create": ({ request }) => createPractice(request),
  "education.practices.get": ({ request, id }) => getPractice(request, idContext(id)),
  "education.practices.update": ({ request, id }) => updatePractice(request, idContext(id)),
  "education.reservations.list": () => listReservations(),
  "education.reservations.create": ({ request }) => createReservation(request),
  "education.reservations.get": ({ request, id }) => getReservation(request, idContext(id)),
  "education.reservations.update": ({ request, id }) => updateReservation(request, idContext(id)),
  "education.reservations.delete": ({ request, id }) => deleteReservation(request, idContext(id)),
  "education.groups.list": () => listGroups(),
  "education.groups.create": ({ request }) => createGroup(request),
  "research.projects.list": ({ request }) => listProjects(request),
  "research.projects.create": ({ request }) => createProject(request),
  "research.projects.get": ({ request, id }) => getProject(request, idContext(id)),
  "research.projects.update": ({ request, id }) => updateProject(request, idContext(id)),
  "research.protocols.list": ({ request }) => listProtocols(request),
  "research.protocols.create": ({ request }) => createProtocol(request),
  "research.protocols.get": ({ request, id }) => getProtocol(request, idContext(id)),
  "research.protocols.update": ({ request, id }) => updateProtocol(request, idContext(id)),
  "research.samples.list": ({ request }) => listResearchSamples(request),
  "research.samples.create": ({ request }) => createResearchSample(request),
  "research.samples.get": ({ request, id }) => getResearchSample(request, idContext(id)),
  "research.samples.update": ({ request, id }) => updateResearchSample(request, idContext(id)),
  "research.biobank.list": ({ request }) => listBiobank(request),
  "research.biobank.create": ({ request }) => createBiobank(request),
  "research.biobank.get": ({ request, id }) => getBiobank(request, idContext(id)),
  "research.biobank.update": ({ request, id }) => updateBiobank(request, idContext(id)),
  "research.notebooks.list": ({ request }) => listNotebooks(request),
  "research.notebooks.create": ({ request }) => createNotebook(request),
  "research.notebooks.entries.list": ({ request }) => listNotebookEntries(request),
  "research.notebooks.entries.create": ({ request }) => createNotebookEntry(request),
  "research.documents.list": ({ request }) => listResearchDocuments(request),
  "research.documents.create": ({ request }) => createResearchDocument(request),
  "quality.oos.list": () => listQualityOos(),
  "audit.list": ({ request }) => listAudit(request),};

export const INTEGRATION_OPERATIONS: IntegrationOperation[] = INTEGRATION_CATALOG.map((meta) => {
  const invoke = INVOKERS[meta.operationId];
  if (!invoke) {
    // Rompe al cargar el módulo, no en la primera llamada del cliente: una
    // operación publicada en el contrato sin handler debe salir en el arranque
    // y en las pruebas, nunca como un 500 delante del ERP de un cliente.
    throw new Error(`La operación '${meta.operationId}' está en el catálogo pero no tiene handler asignado.`);
  }
  return { ...meta, invoke };
});

const operationsByKey = new Map<string, IntegrationOperation>(
  INTEGRATION_OPERATIONS.map((operation) => [`${operation.method} ${operation.path}`, operation]),
);

export function findOperation(method: string, path: string): IntegrationOperation | undefined {
  return operationsByKey.get(`${method.toUpperCase()} ${path}`);
}

/** Resuelve una petición a la operación que la atiende, con su handler ya enlazado. */
export function matchOperation(
  method: string,
  segments: string[],
): { operation: IntegrationOperation; id: string | null } | null {
  const matched = matchOperationMeta(method, segments);
  if (!matched) return null;
  const operation = findOperation(matched.operation.method, matched.operation.path);
  return operation ? { operation, id: matched.id } : null;
}
