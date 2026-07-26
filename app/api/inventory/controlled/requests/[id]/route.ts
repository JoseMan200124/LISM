import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import {
  authorizationExpiry,
  clampValidityHours,
  MAX_VALIDITY_HOURS,
  MIN_VALIDITY_HOURS,
} from "@/lib/controlled-reagents";
import { canAuthorizeControlled, isMissingAuthorizationMigration, loadControlledPolicy } from "@/lib/controlled-usage-service";
import { dispatchPush } from "@/lib/push";
import { notifyControlledResolved } from "@/lib/push-events";
import { loadSignaturePolicy, signRecord } from "@/lib/signature-service";

// Resolución de una solicitud de uso de reactivo controlado: el responsable
// autoriza o rechaza (lo que antes era firmar la hoja en papel) y el solicitante
// puede cancelar la suya mientras no se haya consumido.
//
// Autorizar no descuenta existencia: solo habilita el consumo por la vigencia
// acordada. El descuento sigue ocurriendo al registrar el movimiento.

const schema = z.object({
  action: z.enum(["APPROVE", "REJECT", "CANCEL"]),
  note: z.string().max(1000).optional().default(""),
  // El responsable puede autorizar menos de lo solicitado.
  approvedQuantity: z.coerce.number().positive().optional(),
  validityHours: z.coerce.number().min(MIN_VALIDITY_HOURS).max(MAX_VALIDITY_HOURS).optional(),
  // Firma del responsable: es lo que antes era su firma manuscrita en la hoja.
  signaturePassword: z.string().max(200).optional(),
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) {
    return NextResponse.json({ message: "No tienes permiso para gestionar autorizaciones." }, { status: 403 });
  }
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });

  const sql = getSql();
  try {
    const rows = await sql`
      SELECT r.*, i.sku, i.name AS item_name, i.quantity AS item_quantity, i.unit AS item_unit
      FROM controlled_usage_requests r
      JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
      WHERE r.id = ${id} AND r.laboratory_id = ${session.laboratoryId}
      LIMIT 1
    `;
    const usageRequest = rows[0] as Record<string, unknown> | undefined;
    if (!usageRequest) return NextResponse.json({ message: "Solicitud no encontrada." }, { status: 404 });
    const status = String(usageRequest.status);
    const isRequester = String(usageRequest.requested_by) === session.userId;
    const canAuthorize = canAuthorizeControlled(session);

    if (payload.action === "CANCEL") {
      if (!isRequester && !canAuthorize) {
        return NextResponse.json({ message: "Solo quien creó la solicitud o el responsable pueden cancelarla." }, { status: 403 });
      }
      if (status !== "PENDING" && status !== "APPROVED") {
        return NextResponse.json({ message: "Esta solicitud ya no puede cancelarse." }, { status: 409 });
      }
      if (usageRequest.consumed_at) {
        return NextResponse.json({ message: "Esta autorización ya se usó en un consumo: no puede cancelarse." }, { status: 409 });
      }
      const updated = await sql`
        UPDATE controlled_usage_requests
        SET status = 'CANCELLED', review_note = ${payload.note || null}, updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "CONTROLLED_USAGE_CANCELLED",
        entityType: "controlled_usage_request",
        entityId: id,
        previousValue: usageRequest,
        newValue: updated[0],
        reason: payload.note || "Solicitud de uso cancelada",
        request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    // Autorizar o rechazar es potestad del responsable del laboratorio.
    if (!canAuthorize) {
      return NextResponse.json({ message: "Solo el responsable del laboratorio puede autorizar o rechazar el uso de reactivos controlados." }, { status: 403 });
    }
    if (status !== "PENDING") {
      return NextResponse.json({ message: "Esta solicitud ya fue resuelta." }, { status: 409 });
    }

    if (payload.action === "REJECT") {
      if (payload.note.trim().length < 3) {
        return NextResponse.json({ message: "Indica el motivo del rechazo para que quede en la trazabilidad." }, { status: 400 });
      }
      const updated = await sql`
        UPDATE controlled_usage_requests
        SET status = 'REJECTED', reviewed_by = ${session.userId}, reviewed_at = now(),
          review_note = ${payload.note.trim()}, updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "CONTROLLED_USAGE_REJECTED",
        entityType: "controlled_usage_request",
        entityId: id,
        previousValue: usageRequest,
        newValue: updated[0],
        reason: payload.note.trim(),
        metadata: { sku: usageRequest.sku },
        request,
      });

      dispatchPush(notifyControlledResolved(session, {
        requestId: id,
        requestedBy: String(usageRequest.requested_by ?? ""),
        itemName: String(usageRequest.item_name ?? usageRequest.name ?? "reactivo controlado"),
        approved: false,
        note: payload.note.trim(),
      }));

      return NextResponse.json({ data: updated[0] });
    }

    // APPROVE
    const requestedQuantity = Number(usageRequest.quantity);
    const approvedQuantity = payload.approvedQuantity ?? requestedQuantity;
    const itemUnit = String(usageRequest.item_unit ?? usageRequest.unit ?? "unidades");
    if (approvedQuantity > requestedQuantity + 1e-6) {
      return NextResponse.json({ message: `No puedes autorizar más de lo solicitado (${requestedQuantity} ${itemUnit}).` }, { status: 400 });
    }
    const available = Number(usageRequest.item_quantity);
    if (approvedQuantity > available) {
      return NextResponse.json({ message: `La cantidad autorizada (${approvedQuantity} ${itemUnit}) supera la existencia disponible (${available} ${itemUnit}).` }, { status: 400 });
    }
    const policy = await loadControlledPolicy(session.laboratoryId);
    const validityHours = clampValidityHours(payload.validityHours ?? policy.validityHours);
    const expiresAt = authorizationExpiry(new Date(), validityHours);

    // La autorización se firma antes de aplicarse: si la firma falla, la
    // solicitud sigue pendiente y nadie puede consumir el reactivo.
    const signaturePolicy = await loadSignaturePolicy(session.laboratoryId);
    let reviewSignatureId: string | null = null;
    if (signaturePolicy.controlledApproval) {
      if (!payload.signaturePassword) {
        return NextResponse.json(
          { success: false, error: "SIGNATURE_REQUIRED", message: "La autorización debe ir firmada. Confirma tu contraseña para autorizar." },
          { status: 400 },
        );
      }
      const signature = await signRecord(session, {
        password: payload.signaturePassword,
        entityType: "controlled_usage_request",
        entityId: id,
        meaning: "AUTHORIZATION",
        content: {
          requestCode: usageRequest.request_code, sku: usageRequest.sku, approvedQuantity, unit: itemUnit,
          usedByPerson: usageRequest.used_by_person, usagePurpose: usageRequest.usage_purpose, expiresAt: expiresAt.toISOString(),
        },
        request,
      });
      if (!signature.ok) return NextResponse.json({ success: false, error: "SIGNATURE_FAILED", message: signature.message }, { status: signature.status });
      reviewSignatureId = signature.signatureId;
    }

    const updated = await sql`
      UPDATE controlled_usage_requests
      SET status = 'APPROVED', reviewed_by = ${session.userId}, reviewed_at = now(),
        review_note = ${payload.note.trim() || null}, approved_quantity = ${approvedQuantity},
        expires_at = ${expiresAt.toISOString()}, review_signature_id = COALESCE(${reviewSignatureId}, review_signature_id),
        updated_at = now()
      WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
      RETURNING *
    `;
    await writeAuditEvent(session, {
      action: "CONTROLLED_USAGE_APPROVED",
      entityType: "controlled_usage_request",
      entityId: id,
      previousValue: usageRequest,
      newValue: updated[0],
      reason: payload.note.trim() || "Uso de reactivo controlado autorizado",
      metadata: { sku: usageRequest.sku, approvedQuantity, validityHours, expiresAt: expiresAt.toISOString() },
      request,
    });

    dispatchPush(notifyControlledResolved(session, {
      requestId: id,
      requestedBy: String(usageRequest.requested_by ?? ""),
      itemName: String(usageRequest.item_name ?? usageRequest.name ?? "reactivo controlado"),
      approved: true,
      quantity: approvedQuantity,
      unit: itemUnit,
    }));

    return NextResponse.json({ data: updated[0] });
  } catch (error) {
    if (isMissingAuthorizationMigration(error)) {
      return NextResponse.json({ message: "La autorización digital de reactivos controlados estará disponible al aplicar la actualización de base de datos (migración 0020)." }, { status: 503 });
    }
    throw error;
  }
}
