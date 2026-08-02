import { z } from "zod";
import type { ZodType } from "zod";
import { inventorySchema as inventoryItemsCreateBody } from "@/app/api/inventory/route";
import { patchSchema as inventoryItemsUpdateBody } from "@/app/api/inventory/[id]/route";
import { schema as inventoryItemsDiscardBody } from "@/app/api/inventory/[id]/discard/route";
import { schema as inventoryMovementsCreateBody } from "@/app/api/inventory/movements/route";
import { createSchema as inventoryCategoriesCreateBody } from "@/app/api/inventory/categories/route";
import { patchSchema as inventoryCategoriesUpdateBody } from "@/app/api/inventory/categories/route";
import { createSchema as inventoryControlledRequestsCreateBody } from "@/app/api/inventory/controlled/requests/route";
import { schema as inventoryControlledRequestsUpdateBody } from "@/app/api/inventory/controlled/requests/[id]/route";
import { schema as locationsCreateBody } from "@/app/api/locations/route";
import { schema as equipmentCreateBody } from "@/app/api/equipment/route";
import { patchSchema as equipmentUpdateBody } from "@/app/api/equipment/[id]/route";
import { schema as equipmentEventsCreateBody } from "@/app/api/equipment/events/route";
import { schema as equipmentPlansCreateBody } from "@/app/api/equipment/plans/route";
import { schema as equipmentPlansUpdateBody } from "@/app/api/equipment/plans/[id]/route";
import { schema as equipmentCertificatesCreateBody } from "@/app/api/equipment/certificates/route";
import { specimenSchema as specimensCreateBody } from "@/app/api/specimens/route";
import { schema as specimensTransitionBody } from "@/app/api/specimens/[id]/transitions/route";
import { resultSchema as resultsCreateBody } from "@/app/api/results/route";
import { schema as purchasingRequestsCreateBody } from "@/app/api/purchasing/route";
import { patchSchema as purchasingRequestsUpdateBody } from "@/app/api/purchasing/[id]/route";
import { createSchema as complianceCatalogCreateBody } from "@/app/api/compliance/catalog/route";
import { patchSchema as complianceCatalogUpdateBody } from "@/app/api/compliance/catalog/[id]/route";
import { createSchema as compliancePermitsCreateBody } from "@/app/api/compliance/permits/route";
import { patchSchema as compliancePermitsUpdateBody } from "@/app/api/compliance/permits/route";
import { createSchema as complianceReceiptsCreateBody } from "@/app/api/compliance/receipts/route";
import { createSchema as complianceCountsCreateBody } from "@/app/api/compliance/counts/route";
import { patchSchema as complianceCountsUpdateBody } from "@/app/api/compliance/counts/[id]/route";
import { createSchema as complianceDisposalsCreateBody } from "@/app/api/compliance/disposals/route";
import { createSchema as incidentsCreateBody } from "@/app/api/incidents/route";
import { patchSchema as incidentsUpdateBody } from "@/app/api/incidents/[id]/route";
import { schema as incidentsCommentBody } from "@/app/api/incidents/[id]/comments/route";
import { patchSchema as alertsUpdateBody } from "@/app/api/alerts/route";
import { createSchema as alertsRulesCreateBody } from "@/app/api/alerts/rules/route";
import { patchSchema as alertsRulesUpdateBody } from "@/app/api/alerts/rules/[id]/route";
import { schema as educationPracticesCreateBody } from "@/app/api/education/practices/route";
import { patchSchema as educationPracticesUpdateBody } from "@/app/api/education/practices/[id]/route";
import { createSchema as educationReservationsCreateBody } from "@/app/api/education/reservations/route";
import { schema as educationReservationsUpdateBody } from "@/app/api/education/reservations/[id]/route";
import { createSchema as educationGroupsCreateBody } from "@/app/api/education/groups/route";
import { createSchema as researchProjectsCreateBody } from "@/app/api/research/projects/route";
import { patchSchema as researchProjectsUpdateBody } from "@/app/api/research/projects/[id]/route";
import { createSchema as researchProtocolsCreateBody } from "@/app/api/research/protocols/route";
import { patchSchema as researchProtocolsUpdateBody } from "@/app/api/research/protocols/[id]/route";
import { createSchema as researchSamplesCreateBody } from "@/app/api/research/samples/route";
import { patchSchema as researchSamplesUpdateBody } from "@/app/api/research/samples/[id]/route";
import { createSchema as researchBiobankCreateBody } from "@/app/api/research/biobank/route";
import { patchSchema as researchBiobankUpdateBody } from "@/app/api/research/biobank/[id]/route";
import { createSchema as researchNotebooksCreateBody } from "@/app/api/research/notebooks/route";
import { createSchema as researchNotebooksEntriesCreateBody } from "@/app/api/research/notebooks/entries/route";
import { createSchema as researchDocumentsCreateBody } from "@/app/api/research/documents/route";

// Esquemas de entrada que el servidor MCP publica para cada operación que
// acepta cuerpo.
//
// La diferencia con el contrato REST es deliberada. En /api/v1 los cuerpos se
// declaran como objeto abierto (ver lib/integration-openapi.ts): al otro lado
// hay una persona integrando un ERP, que lee la documentación, prueba y corrige
// con el detalle del 400. Un modelo de lenguaje no tiene ese ciclo: si no sabe
// de antemano qué campos existen, inventa nombres plausibles y falla en la
// primera llamada. Publicar el esquema real convierte "crear un evento de
// equipo" en una llamada acertada en vez de tres intentos.
//
// Los esquemas NO se reescriben aquí: son los mismos objetos Zod que valida el
// handler de la aplicación web, importados directamente. Si alguien añade un
// campo obligatorio a un formulario, la herramienta MCP lo anuncia el mismo día
// sin tocar este archivo. Un catálogo redactado a mano habría empezado a mentir
// en la primera semana.
const BODY_SCHEMAS: Record<string, ZodType> = {
  "inventory.items.create": inventoryItemsCreateBody,
  "inventory.items.update": inventoryItemsUpdateBody,
  "inventory.items.discard": inventoryItemsDiscardBody,
  "inventory.movements.create": inventoryMovementsCreateBody,
  "inventory.categories.create": inventoryCategoriesCreateBody,
  "inventory.categories.update": inventoryCategoriesUpdateBody,
  "inventory.controlled.requests.create": inventoryControlledRequestsCreateBody,
  "inventory.controlled.requests.update": inventoryControlledRequestsUpdateBody,
  "locations.create": locationsCreateBody,
  "equipment.create": equipmentCreateBody,
  "equipment.update": equipmentUpdateBody,
  "equipment.events.create": equipmentEventsCreateBody,
  "equipment.plans.create": equipmentPlansCreateBody,
  "equipment.plans.update": equipmentPlansUpdateBody,
  "equipment.certificates.create": equipmentCertificatesCreateBody,
  "specimens.create": specimensCreateBody,
  "specimens.transition": specimensTransitionBody,
  "results.create": resultsCreateBody,
  "purchasing.requests.create": purchasingRequestsCreateBody,
  "purchasing.requests.update": purchasingRequestsUpdateBody,
  "compliance.catalog.create": complianceCatalogCreateBody,
  "compliance.catalog.update": complianceCatalogUpdateBody,
  "compliance.permits.create": compliancePermitsCreateBody,
  "compliance.permits.update": compliancePermitsUpdateBody,
  "compliance.receipts.create": complianceReceiptsCreateBody,
  "compliance.counts.create": complianceCountsCreateBody,
  "compliance.counts.update": complianceCountsUpdateBody,
  "compliance.disposals.create": complianceDisposalsCreateBody,
  "incidents.create": incidentsCreateBody,
  "incidents.update": incidentsUpdateBody,
  "incidents.comment": incidentsCommentBody,
  "alerts.update": alertsUpdateBody,
  "alerts.rules.create": alertsRulesCreateBody,
  "alerts.rules.update": alertsRulesUpdateBody,
  "education.practices.create": educationPracticesCreateBody,
  "education.practices.update": educationPracticesUpdateBody,
  "education.reservations.create": educationReservationsCreateBody,
  "education.reservations.update": educationReservationsUpdateBody,
  "education.groups.create": educationGroupsCreateBody,
  "research.projects.create": researchProjectsCreateBody,
  "research.projects.update": researchProjectsUpdateBody,
  "research.protocols.create": researchProtocolsCreateBody,
  "research.protocols.update": researchProtocolsUpdateBody,
  "research.samples.create": researchSamplesCreateBody,
  "research.samples.update": researchSamplesUpdateBody,
  "research.biobank.create": researchBiobankCreateBody,
  "research.biobank.update": researchBiobankUpdateBody,
  "research.notebooks.create": researchNotebooksCreateBody,
  "research.notebooks.entries.create": researchNotebooksEntriesCreateBody,
  "research.documents.create": researchDocumentsCreateBody,
};

/**
 * Lo que se publica cuando una operación no tiene esquema declarado: un objeto
 * abierto. Es honesto —el servidor sigue validando— y deja que el modelo
 * aprenda del error de validación, que sí detalla qué falta.
 */
const FREE_FORM: Record<string, unknown> = {
  type: "object",
  additionalProperties: true,
  description:
    "Cuerpo de la entidad. El servidor valida los campos; un error de validación detalla cuáles faltan o son inválidos.",
};

// La conversión a JSON Schema es determinista pero no gratis, y tools/list la
// pediría entera en cada llamada. Se calcula una vez por operación.
const cache = new Map<string, Record<string, unknown>>();

/**
 * JSON Schema del cuerpo de una operación, para el campo `inputSchema` de la
 * herramienta MCP.
 *
 * `io: "input"` describe lo que se acepta, no lo que sale: importa cuando un
 * campo tiene `.default()` —opcional al entrar, siempre presente al salir— y
 * publicar la forma de salida haría que el modelo lo creyera obligatorio.
 * `unrepresentable: "any"` evita que un refinamiento no traducible a JSON
 * Schema tumbe el listado completo de herramientas por una sola operación.
 */
export function bodySchemaFor(operationId: string): Record<string, unknown> {
  const cached = cache.get(operationId);
  if (cached) return cached;

  const schema = BODY_SCHEMAS[operationId];
  if (!schema) return FREE_FORM;

  let converted: Record<string, unknown>;
  try {
    const generated = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>;
    // `$schema` solo tiene sentido en la raíz de un documento; este esquema
    // viaja anidado dentro del `inputSchema` de la herramienta, y algunos
    // validadores estrictos protestan al encontrarlo ahí dentro.
    const { $schema: _discarded, ...rest } = generated;
    converted = rest;
  } catch {
    // Un esquema que no se puede describir no debe dejar la operación fuera de
    // servicio: sigue siendo invocable, solo que sin ayuda de forma.
    converted = FREE_FORM;
  }

  cache.set(operationId, converted);
  return converted;
}

/** Operaciones cuyo cuerpo se publica con su forma real. Lo usan las pruebas. */
export function operationsWithDeclaredBody(): string[] {
  return Object.keys(BODY_SCHEMAS);
}
