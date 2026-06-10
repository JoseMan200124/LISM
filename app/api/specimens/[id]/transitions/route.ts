import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const legacyStatusSchema = z.enum(["RECEIVED", "PREPARING", "ANALYZING", "PENDING_VALIDATION", "RELEASED", "REJECTED", "ARCHIVED"]);
const stateKeySchema = z.string().min(2).max(80).regex(/^[A-Z0-9_]+$/);
const schema = z.object({
  toStateKey: stateKeySchema.optional(),
  /** Compatibilidad con integraciones creadas antes del motor configurable. */
  toStatus: legacyStatusSchema.optional(),
  reason: z.string().max(1000).optional().default(""),
  conditionText: z.string().max(1000).optional(),
  fromLocationId: databaseIdSchema.optional(),
  toLocationId: databaseIdSchema.optional(),
  receivedBy: databaseIdSchema.optional(),
  signatureId: databaseIdSchema.optional(),
}).refine((value) => Boolean(value.toStateKey || value.toStatus), { message: "Indica el estado destino." });

const legacyAllowed: Record<z.infer<typeof legacyStatusSchema>, Array<z.infer<typeof legacyStatusSchema>>> = {
  RECEIVED: ["PREPARING", "REJECTED"],
  PREPARING: ["ANALYZING", "REJECTED"],
  ANALYZING: ["PENDING_VALIDATION", "REJECTED"],
  PENDING_VALIDATION: ["RELEASED", "ANALYZING", "REJECTED"],
  RELEASED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  ARCHIVED: [],
};

const stateToLegacyStatus: Record<string, z.infer<typeof legacyStatusSchema>> = {
  REGISTERED: "RECEIVED",
  RECEIVED: "RECEIVED",
  PREPARING: "PREPARING",
  ANALYZING: "ANALYZING",
  IN_REVIEW: "PENDING_VALIDATION",
  PENDING_VALIDATION: "PENDING_VALIDATION",
  APPROVED: "RELEASED",
  RELEASED: "RELEASED",
  REJECTED: "REJECTED",
  CLOSED: "ARCHIVED",
  ARCHIVED: "ARCHIVED",
};

function jsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "specimens.transition")) return NextResponse.json({ message: "No tienes permiso para cambiar el estado de la muestra." }, { status: 403 });
  const { id } = await params;
  const parsedId = databaseIdSchema.safeParse(id);
  if (!parsedId.success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Transición inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  const requestedState = payload.toStateKey ?? payload.toStatus ?? "";

  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload, workflowStateKey: requestedState }, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT id, status::text AS legacy_status, workflow_state_key, workflow_version_id,
      current_location_id, condition_on_receipt
    FROM specimens
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    LIMIT 1
  `;
  const specimen = rows[0] as Record<string, unknown> | undefined;
  if (!specimen) return NextResponse.json({ message: "Muestra no encontrada." }, { status: 404 });

  const currentState = String(specimen.workflow_state_key || specimen.legacy_status);
  const legacyCurrent = String(specimen.legacy_status) as z.infer<typeof legacyStatusSchema>;
  const workflowVersionId = specimen.workflow_version_id ? String(specimen.workflow_version_id) : null;
  let requiresSignature = false;
  let transitionId: string | null = null;

  if (workflowVersionId) {
    const transitions = await sql`
      SELECT id, allowed_roles, required_fields, requires_signature, requires_reason
      FROM workflow_transitions
      WHERE workflow_version_id = ${workflowVersionId}
        AND from_state_key = ${currentState}
        AND to_state_key = ${requestedState}
      LIMIT 1
    `;
    const transition = transitions[0] as Record<string, unknown> | undefined;
    if (!transition) return NextResponse.json({ message: `No se permite pasar de ${currentState} a ${requestedState} en el flujo vigente.` }, { status: 409 });
    transitionId = String(transition.id);
    const roles = jsonArray(transition.allowed_roles);
    if (roles.length > 0 && session.role !== "OWNER" && !roles.includes(session.role)) {
      return NextResponse.json({ message: "Tu rol no puede ejecutar esta transición." }, { status: 403 });
    }
    if (Boolean(transition.requires_reason) && payload.reason.trim().length < 3) {
      return NextResponse.json({ message: "Indica el motivo de esta transición." }, { status: 400 });
    }
    requiresSignature = Boolean(transition.requires_signature);
    const requiredFields = jsonArray(transition.required_fields);
    if (requiredFields.includes("condition_on_receipt") && !payload.conditionText?.trim() && !String(specimen.condition_on_receipt ?? "").trim()) {
      return NextResponse.json({ message: "Registra las condiciones de recepción antes de continuar." }, { status: 400 });
    }
    if (requiredFields.includes("result_records")) {
      const results = await sql`
        SELECT COUNT(*)::int AS total
        FROM result_records r
        JOIN order_tests ot ON ot.id = r.order_test_id AND ot.laboratory_id = r.laboratory_id
        WHERE r.laboratory_id = ${session.laboratoryId} AND ot.specimen_id = ${id}
      `;
      if (Number(results[0]?.total ?? 0) < 1) return NextResponse.json({ message: "Registra al menos un resultado antes de enviar la muestra a revisión." }, { status: 400 });
    }
  } else {
    const requestedLegacy = legacyStatusSchema.safeParse(requestedState);
    if (!requestedLegacy.success || !legacyAllowed[legacyCurrent]?.includes(requestedLegacy.data)) {
      return NextResponse.json({ message: `No se permite pasar de ${legacyCurrent} a ${requestedState}.` }, { status: 409 });
    }
  }

  if ((requestedState === "REJECTED" || currentState === "PENDING_VALIDATION" && requestedState === "ANALYZING" || currentState === "IN_REVIEW" && requestedState === "ANALYZING") && payload.reason.trim().length < 3) {
    return NextResponse.json({ message: "Indica el motivo para rechazar o regresar una muestra." }, { status: 400 });
  }
  if (requiresSignature && !payload.signatureId) {
    return NextResponse.json({ message: "Esta transición requiere una firma electrónica vigente." }, { status: 400 });
  }
  if (payload.signatureId) {
    const signatures = await sql`
      SELECT id FROM electronic_signatures
      WHERE id = ${payload.signatureId} AND laboratory_id = ${session.laboratoryId}
      LIMIT 1
    `;
    if (!signatures[0]) return NextResponse.json({ message: "La firma indicada no pertenece a este laboratorio." }, { status: 400 });
  }

  const nextLegacy = stateToLegacyStatus[requestedState] ?? legacyCurrent;
  const updated = await sql`
    UPDATE specimens SET
      status = ${nextLegacy},
      workflow_state_key = ${requestedState},
      condition_on_receipt = COALESCE(${payload.conditionText ?? null}, condition_on_receipt),
      current_location_id = COALESCE(${payload.toLocationId ?? null}, current_location_id),
      received_by = COALESCE(${payload.receivedBy ?? null}, received_by),
      rejection_reason = CASE WHEN ${requestedState} = 'REJECTED' THEN ${payload.reason} ELSE rejection_reason END
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *
  `;
  if (payload.fromLocationId || payload.toLocationId) {
    await sql`
      INSERT INTO specimen_transfers (laboratory_id, specimen_id, from_location_id, to_location_id, transferred_by, received_by, condition_text, note)
      VALUES (${session.laboratoryId}, ${id}, ${payload.fromLocationId ?? null}, ${payload.toLocationId ?? null}, ${session.userId}, ${payload.receivedBy ?? null}, ${payload.conditionText ?? null}, ${payload.reason})
    `;
  }
  await writeAuditEvent(session, {
    action: "SPECIMEN_STATUS_CHANGED",
    entityType: "specimen",
    entityId: id,
    previousValue: { workflowStateKey: currentState, legacyStatus: legacyCurrent },
    newValue: { workflowStateKey: requestedState, legacyStatus: nextLegacy },
    reason: payload.reason || "Transición operativa",
    metadata: { workflowVersionId, transitionId, signatureId: payload.signatureId ?? null },
    request,
  });
  return NextResponse.json({ data: updated[0] });
}
