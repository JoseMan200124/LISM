import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { dispatchPush } from "@/lib/push";
import { notifyPurchaseStatus } from "@/lib/push-events";
import { loadSignaturePolicy, loadSignatures, signRecord } from "@/lib/signature-service";

const STATUSES = ["DRAFT", "PENDING", "APPROVED", "ORDERED", "RECEIVED", "CANCELLED"] as const;
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  supplier: z.string().max(200).optional().nullable(),
  neededBy: z.string().date().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // Contraseña de quien autoriza. Obligatoria al aprobar si la política del
  // laboratorio exige firma (lo es por omisión).
  signaturePassword: z.string().max(200).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "purchasing.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Detalle no disponible en modo demostración." }, { status: 404 });

  const sql = getSql();
  const headers = await sql`
    SELECT pr.*, u.full_name AS requested_by_name, a.full_name AS approved_by_name
    FROM purchase_requests pr
    LEFT JOIN users u ON u.id = pr.requested_by
    LEFT JOIN users a ON a.id = pr.approved_by
    WHERE pr.id = ${id} AND pr.laboratory_id = ${session.laboratoryId}
    LIMIT 1
  `;
  if (!headers.length) return NextResponse.json({ message: "Solicitud no encontrada." }, { status: 404 });
  const items = await sql`
    SELECT pri.id, pri.inventory_item_id, pri.description, pri.quantity, pri.unit, pri.estimated_unit_price, pri.notes,
      ii.name AS inventory_item_name, ii.sku AS inventory_sku
    FROM purchase_request_items pri
    LEFT JOIN inventory_items ii ON ii.id = pri.inventory_item_id
    WHERE pri.purchase_request_id = ${id} AND pri.laboratory_id = ${session.laboratoryId}
    ORDER BY pri.created_at ASC
  `;
  const signatures = await loadSignatures(session.laboratoryId, "purchase_request", [id]).catch(() => new Map());
  return NextResponse.json({ data: { ...headers[0], items, signatures: signatures.get(id) ?? [] } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "purchasing.manage")) return NextResponse.json({ message: "No tienes permiso para actualizar compras." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id, ...payload }, mode: "demo" });

  const sql = getSql();
  const existing = await sql`SELECT * FROM purchase_requests WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!existing.length) return NextResponse.json({ message: "Solicitud no encontrada." }, { status: 404 });

  // Al pasar a APROBADA se registra quién y cuándo aprobó, con su firma.
  const approve = payload.status === "APPROVED" && existing[0].status !== "APPROVED";
  const policy = await loadSignaturePolicy(session.laboratoryId);
  let approvalSignatureId: string | null = null;
  if (approve && policy.purchaseApproval) {
    if (!payload.signaturePassword) {
      return NextResponse.json(
        { success: false, error: "SIGNATURE_REQUIRED", message: "La autorización debe ir firmada. Confirma tu contraseña para autorizar." },
        { status: 400 },
      );
    }
    const signature = await signRecord(session, {
      password: payload.signaturePassword,
      entityType: "purchase_request",
      entityId: id,
      meaning: "AUTHORIZATION",
      content: {
        requestCode: existing[0].request_code,
        title: existing[0].title,
        supplier: payload.supplier === undefined ? existing[0].supplier : payload.supplier,
        neededBy: payload.neededBy === undefined ? existing[0].needed_by : payload.neededBy,
        approvedBy: session.userId,
      },
      request,
    });
    if (!signature.ok) return NextResponse.json({ success: false, error: "SIGNATURE_FAILED", message: signature.message }, { status: signature.status });
    approvalSignatureId = signature.signatureId;
  }

  const rows = await sql`
    UPDATE purchase_requests SET
      status = COALESCE(${payload.status ?? null}, status),
      priority = COALESCE(${payload.priority ?? null}, priority),
      supplier = ${payload.supplier === undefined ? existing[0].supplier : payload.supplier},
      needed_by = ${payload.neededBy === undefined ? existing[0].needed_by : payload.neededBy},
      notes = ${payload.notes === undefined ? existing[0].notes : payload.notes},
      approved_by = ${approve ? session.userId : (existing[0].approved_by ?? null)},
      approved_at = ${approve ? new Date().toISOString() : (existing[0].approved_at ?? null)},
      approval_signature_id = COALESCE(${approvalSignatureId}, approval_signature_id),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *
  `;
  await writeAuditEvent(session, { action: "PURCHASE_REQUEST_UPDATED", entityType: "purchase_request", entityId: id, previousValue: existing[0], newValue: rows[0], reason: "Actualización de solicitud de compra", request });
  if (payload.status && payload.status !== existing[0].status) {
    dispatchPush(notifyPurchaseStatus(session, {
      requestId: id,
      code: String(rows[0].request_code ?? ""),
      title: String(rows[0].title ?? ""),
      status: payload.status,
      requestedBy: existing[0].requested_by ? String(existing[0].requested_by) : null,
    }));
  }
  return NextResponse.json({ data: rows[0] });
}
