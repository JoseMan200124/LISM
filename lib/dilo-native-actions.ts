import type { UserSession } from "@/lib/session";
import { withServiceSession } from "@/lib/session";
import { POST as createInventory } from "@/app/api/inventory/route";
import { PATCH as updateInventory } from "@/app/api/inventory/[id]/route";
import { GET as listInventoryMovements, POST as moveInventory } from "@/app/api/inventory/movements/route";
import { POST as discardInventory } from "@/app/api/inventory/[id]/discard/route";
import { POST as createEquipment } from "@/app/api/equipment/route";
import { PATCH as updateEquipment } from "@/app/api/equipment/[id]/route";
import { GET as listEquipmentEvents, POST as createEquipmentEvent } from "@/app/api/equipment/events/route";
import { POST as createEquipmentPlan } from "@/app/api/equipment/plans/route";
import { PATCH as updateEquipmentPlan, DELETE as deleteEquipmentPlan } from "@/app/api/equipment/plans/[id]/route";
import { POST as createSpecimen } from "@/app/api/specimens/route";
import { POST as transitionSpecimen } from "@/app/api/specimens/[id]/transitions/route";
import { GET as listResults, POST as createResult } from "@/app/api/results/route";
import { PATCH as updateAlert } from "@/app/api/alerts/route";
import { GET as listIncidents, POST as createIncident } from "@/app/api/incidents/route";
import { PATCH as updateIncident } from "@/app/api/incidents/[id]/route";
import { POST as commentIncident } from "@/app/api/incidents/[id]/comments/route";
import { GET as listPractices, POST as createPractice } from "@/app/api/education/practices/route";
import { PATCH as updatePractice } from "@/app/api/education/practices/[id]/route";
import { POST as createReservation } from "@/app/api/education/reservations/route";
import { PATCH as updateReservation, DELETE as deleteReservation } from "@/app/api/education/reservations/[id]/route";
import { GET as listAudit } from "@/app/api/audit/route";
import { GET as listCompliance } from "@/app/api/compliance/route";
import { GET as listQualityOos } from "@/app/api/quality/oos/route";

// Las escrituras de Dilo no duplican reglas del LIMS. Este adaptador llama a los
// handlers nativos dentro de una sesión de servicio aislada, de modo que aplica
// la misma validación Zod, permisos, alcance laboratory_id, flujos, firmas,
// reglas de reactivos controlados y bitácora que la interfaz web.

export const DILO_MUTATION_ACTIONS = [
  "inventory.create", "inventory.update", "inventory.move", "inventory.discard",
  "equipment.create", "equipment.update", "equipment.event.create", "equipment.plan.create", "equipment.plan.update", "equipment.plan.delete",
  "specimens.create", "specimens.transition", "results.create", "alerts.update",
  "incidents.create", "incidents.update", "incidents.comment",
  "education.practice.create", "education.practice.update", "education.reservation.create", "education.reservation.update", "education.reservation.delete",
] as const;

export type DiloMutationAction = typeof DILO_MUTATION_ACTIONS[number];

export const DILO_READ_ACTIONS = [
  "inventory.movements.list", "equipment.events.list", "results.list",
  "incidents.list", "education.practices.list", "quality.oos.list",
  "audit.list", "compliance.list",
] as const;

export type DiloReadAction = typeof DILO_READ_ACTIONS[number];

type NativeResult = {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
};

function requestFor(action: string, payload: Record<string, unknown>): Request {
  return new Request(`https://nexalab.internal/api/integrations/dilo/native/${action}`, {
    method: action.endsWith(".delete") ? "DELETE" : action.endsWith(".update") ? "PATCH" : "POST",
    headers: { "content-type": "application/json", "x-nexalab-actor-channel": "dilo-whatsapp" },
    body: JSON.stringify(payload),
  });
}

async function shape(response: Response): Promise<NativeResult> {
  let body: Record<string, unknown> = {};
  try {
    body = await response.json() as Record<string, unknown>;
  } catch {
    body = { message: "NexaLab devolvió una respuesta vacía." };
  }
  return { ok: response.ok, status: response.status, body };
}

function idContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

export async function runDiloNativeMutation(args: {
  session: UserSession;
  action: DiloMutationAction;
  id?: string | null;
  input: Record<string, unknown>;
}): Promise<NativeResult> {
  const request = requestFor(args.action, args.input);
  const id = args.id?.trim();
  const requireId = () => {
    if (!id) throw new Error("Esta acción requiere el identificador del registro.");
    return idContext(id);
  };

  return withServiceSession(args.session, async () => {
    let response: Response;
    switch (args.action) {
      case "inventory.create": response = await createInventory(request); break;
      case "inventory.update": response = await updateInventory(request, requireId()); break;
      case "inventory.move": response = await moveInventory(request); break;
      case "inventory.discard": response = await discardInventory(request, requireId()); break;
      case "equipment.create": response = await createEquipment(request); break;
      case "equipment.update": response = await updateEquipment(request, requireId()); break;
      case "equipment.event.create": response = await createEquipmentEvent(request); break;
      case "equipment.plan.create": response = await createEquipmentPlan(request); break;
      case "equipment.plan.update": response = await updateEquipmentPlan(request, requireId()); break;
      case "equipment.plan.delete": response = await deleteEquipmentPlan(request, requireId()); break;
      case "specimens.create": response = await createSpecimen(request); break;
      case "specimens.transition": response = await transitionSpecimen(request, requireId()); break;
      case "results.create": response = await createResult(request); break;
      case "alerts.update": response = await updateAlert(request); break;
      case "incidents.create": response = await createIncident(request); break;
      case "incidents.update": response = await updateIncident(request, requireId()); break;
      case "incidents.comment": response = await commentIncident(request, requireId()); break;
      case "education.practice.create": response = await createPractice(request); break;
      case "education.practice.update": response = await updatePractice(request, requireId()); break;
      case "education.reservation.create": response = await createReservation(request); break;
      case "education.reservation.update": response = await updateReservation(request, requireId()); break;
      case "education.reservation.delete": response = await deleteReservation(request, requireId()); break;
      default: throw new Error("Acción de escritura no soportada.");
    }
    return shape(response);
  });
}

export async function runDiloNativeRead(args: {
  session: UserSession;
  action: DiloReadAction;
}): Promise<NativeResult> {
  const request = new Request(`https://nexalab.internal/api/integrations/dilo/native/${args.action}`, {
    headers: { "x-nexalab-actor-channel": "dilo-whatsapp" },
  });
  return withServiceSession(args.session, async () => {
    let response: Response;
    switch (args.action) {
      case "inventory.movements.list": response = await listInventoryMovements(); break;
      case "equipment.events.list": response = await listEquipmentEvents(); break;
      case "results.list": response = await listResults(); break;
      case "incidents.list": response = await listIncidents(); break;
      case "education.practices.list": response = await listPractices(); break;
      case "quality.oos.list": response = await listQualityOos(); break;
      case "audit.list": response = await listAudit(request); break;
      case "compliance.list": response = await listCompliance(); break;
      default: throw new Error("Consulta no soportada.");
    }
    const result = await shape(response);
    const rows = Array.isArray(result.body.data) ? result.body.data.slice(0, 25) : result.body.data;
    return { ...result, body: { ...result.body, data: rows } };
  });
}
