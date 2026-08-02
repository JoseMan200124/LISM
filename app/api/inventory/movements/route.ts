import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { inventoryMovements } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { convertQuantity } from "@/lib/units";
import {
  isStockReducingMovement,
  missingControlledFields,
  controlledLogErrorMessage,
  authorizationState,
  authorizationRequiredMessage,
  checkAuthorizedQuantity,
  AUTHORIZATION_STATE_MESSAGE,
} from "@/lib/controlled-reagents";
import { canAuthorizeControlled, loadControlledContext } from "@/lib/controlled-usage-service";

export const schema = z.object({
  inventoryItemId: databaseIdSchema,
  movementType: z.enum(["RECEIPT", "CONSUMPTION", "ADJUSTMENT", "TRANSFER", "DISPOSAL"]),
  quantity: z.coerce.number().positive(),
  // Unidad en la que el usuario registró la cantidad. Si difiere de la unidad
  // del artículo, el servidor convierte (mL↔L, g↔kg, …) antes de descontar.
  unit: z.string().max(40).optional(),
  direction: z.enum(["IN", "OUT"]).optional(),
  reasonCode: z.string().min(2).max(80),
  note: z.string().max(1000).optional().default(""),
  referenceType: z.string().max(80).optional(),
  referenceId: databaseIdSchema.optional(),
  fromLocationId: databaseIdSchema.optional(),
  toLocationId: databaseIdSchema.optional(),
  // Registro de consumo de reactivos controlados (doble uso / precursor).
  // Obligatorios en el servidor cuando el reactivo es controlado y el
  // movimiento descuenta existencia; ignorados en el resto de casos.
  usageArea: z.string().max(200).optional(),
  usagePurpose: z.string().max(1000).optional(),
  usedByPerson: z.string().max(200).optional(),
  authorizedBy: z.string().max(200).optional(),
  // Autorización previa del responsable que ampara este consumo. Cuando viene,
  // el servidor toma de ella la trazabilidad (fuente de verdad) y la cierra.
  usageRequestId: databaseIdSchema.optional(),
}).superRefine((value, ctx) => {
  if (value.movementType === "TRANSFER" && (!value.fromLocationId || !value.toLocationId || value.fromLocationId === value.toLocationId)) {
    ctx.addIssue({ code: "custom", path: ["toLocationId"], message: "La transferencia requiere ubicaciones de origen y destino diferentes." });
  }
});

function signedQuantity(quantity: number, payload: z.infer<typeof schema>) {
  if (payload.movementType === "RECEIPT") return quantity;
  if (payload.movementType === "ADJUSTMENT") return payload.direction === "IN" ? quantity : -quantity;
  if (payload.movementType === "TRANSFER") return 0;
  return -quantity;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar movimientos." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: inventoryMovements, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT m.id, i.sku, i.name, i.lot_number, i.unit, m.movement_type, m.quantity_delta,
      m.previous_quantity, m.resulting_quantity, m.reason_code, m.note,
      COALESCE(u.full_name, gs.display_name || ' (invitado)') AS performed_by, m.performed_at
    FROM inventory_movements m
    JOIN inventory_items i ON i.id = m.inventory_item_id AND i.laboratory_id = m.laboratory_id
    LEFT JOIN users u ON u.id = m.performed_by
    LEFT JOIN guest_access_sessions gs ON gs.id = m.guest_session_id
    WHERE m.laboratory_id = ${session.laboratoryId}
    ORDER BY m.performed_at DESC LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.move")) return NextResponse.json({ message: "No tienes permiso para registrar movimientos." }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Movimiento inválido.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  // El invitado con alcance de consumo solo puede descontar lo que usó en la
  // práctica: no da entradas, no ajusta, no transfiere y no descarta.
  const guest = session.guest ?? null;
  if (guest && payload.movementType !== "CONSUMPTION") {
    return NextResponse.json({ message: "Con un acceso de invitado solo puedes registrar consumos." }, { status: 403 });
  }

  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, quantityDelta: signedQuantity(payload.quantity, payload) }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const items = await sql`SELECT id, sku, name, quantity, unit, requires_usage_log, is_controlled, storage_location_id FROM inventory_items WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'`;
  const item = items[0] as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ message: "Artículo no encontrado." }, { status: 404 });

  // Regla clave: un reactivo controlado (doble uso o precursor) no puede
  // descontarse del inventario sin un registro de consumo con trazabilidad
  // completa (área/proyecto, finalidad y quién lo utilizó). Desde la migración
  // 0020 ese registro puede venir de una autorización previa del responsable:
  // el usuario ya no llena nada al consumir, solo elige su autorización.
  const reducesStock = isStockReducingMovement(payload.movementType, payload.direction);
  let trace = {
    usageArea: payload.usageArea?.trim() || null,
    usagePurpose: payload.usagePurpose?.trim() || null,
    usedByPerson: payload.usedByPerson?.trim() || null,
    authorizedBy: payload.authorizedBy?.trim() || null,
  };
  let authorization: Record<string, unknown> | null = null;

  // Un reactivo controlado exige autorización nominal de un responsable: eso no
  // puede resolverse con un código de aula compartido.
  if (guest && item.is_controlled) {
    return NextResponse.json({ message: "Los reactivos controlados no pueden consumirse con un acceso de invitado. Pide a tu docente que registre el consumo." }, { status: 403 });
  }

  if (item.is_controlled && reducesStock) {
    const { policy, available } = await loadControlledContext(session.laboratoryId);

    if (payload.usageRequestId) {
      if (!available) {
        return NextResponse.json({ message: "La autorización digital estará disponible al aplicar la actualización de base de datos (migración 0020)." }, { status: 503 });
      }
      const found = await sql`
        SELECT r.*, rv.full_name AS reviewed_by_name
        FROM controlled_usage_requests r
        LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.id = ${payload.usageRequestId} AND r.laboratory_id = ${session.laboratoryId}
        LIMIT 1
      `;
      const candidate = found[0] as Record<string, unknown> | undefined;
      if (!candidate) return NextResponse.json({ message: "Autorización no encontrada." }, { status: 404 });
      if (String(candidate.inventory_item_id) !== payload.inventoryItemId) {
        return NextResponse.json({ message: "La autorización corresponde a otro reactivo." }, { status: 400 });
      }
      // Solo puede usarla quien la solicitó o el responsable del laboratorio.
      if (String(candidate.requested_by) !== session.userId && !canAuthorizeControlled(session)) {
        return NextResponse.json({ message: "Esta autorización pertenece a otra persona." }, { status: 403 });
      }
      const state = authorizationState({
        status: String(candidate.status),
        quantity: Number(candidate.quantity),
        approved_quantity: candidate.approved_quantity as number | null,
        expires_at: candidate.expires_at as string | null,
        consumed_at: candidate.consumed_at as string | null,
      });
      if (state !== "USABLE") {
        return NextResponse.json(
          { success: false, error: "AUTHORIZATION_NOT_USABLE", message: AUTHORIZATION_STATE_MESSAGE[state] },
          { status: 409 },
        );
      }
      authorization = candidate;
      // La trazabilidad la manda la autorización, no el formulario.
      trace = {
        usageArea: String(candidate.usage_area),
        usagePurpose: String(candidate.usage_purpose),
        usedByPerson: String(candidate.used_by_person),
        authorizedBy: `${String(candidate.reviewed_by_name ?? "Responsable del laboratorio")} · ${String(candidate.request_code)}`,
      };
    } else if (available && policy.requirePreapproval && !canAuthorizeControlled(session)) {
      // Sin autorización previa y sin potestad para autorizar: es exactamente el
      // caso que antes obligaba a llevar la hoja firmada al responsable.
      return NextResponse.json(
        { success: false, error: "CONTROLLED_AUTHORIZATION_REQUIRED", message: authorizationRequiredMessage(String(item.name ?? "")) },
        { status: 400 },
      );
    } else if (!trace.authorizedBy && canAuthorizeControlled(session)) {
      // El responsable autoriza en el acto: queda registrado como tal.
      trace.authorizedBy = `${session.name} (autorizado en el acto)`;
    }

    const missing = missingControlledFields(trace);
    if (missing.length > 0) {
      return NextResponse.json(
        { success: false, error: "CONTROLLED_LOG_REQUIRED", message: controlledLogErrorMessage(missing), fields: missing },
        { status: 400 },
      );
    }
  } else if (item.requires_usage_log && payload.movementType === "CONSUMPTION" && payload.note.trim().length < 3) {
    return NextResponse.json({ message: "Este reactivo requiere indicar el uso o práctica relacionada." }, { status: 400 });
  }

  // Conversión de unidades: la cantidad puede venir en otra unidad compatible.
  const itemUnit = String(item.unit ?? "unidades");
  let quantity = payload.quantity;
  if (payload.unit && payload.unit.trim()) {
    const converted = convertQuantity(payload.quantity, payload.unit, itemUnit);
    if (converted === null) {
      return NextResponse.json({ message: `La unidad "${payload.unit}" no es compatible con la unidad del artículo (${itemUnit}).` }, { status: 400 });
    }
    if (converted <= 0) {
      return NextResponse.json({ message: `La cantidad convertida a ${itemUnit} es demasiado pequeña para registrarse.` }, { status: 400 });
    }
    quantity = converted;
  }
  const quantityDelta = signedQuantity(quantity, payload);

  // La cantidad a descontar debe caber en lo que el responsable autorizó.
  if (authorization) {
    const overLimit = checkAuthorizedQuantity(
      { status: String(authorization.status), quantity: Number(authorization.quantity), approved_quantity: authorization.approved_quantity as number | null },
      quantity,
      itemUnit,
    );
    if (overLimit) {
      return NextResponse.json({ success: false, error: "OVER_AUTHORIZED_QUANTITY", message: overLimit }, { status: 400 });
    }
  }

  // Validación amistosa de saldo: el trigger de la base también lo impide,
  // pero aquí se explica cuánto hay disponible y en qué unidad.
  const available = Number(item.quantity);
  if (quantityDelta < 0 && Math.abs(quantityDelta) > available) {
    return NextResponse.json({ message: `La cantidad supera la existencia disponible (${available} ${itemUnit}).` }, { status: 400 });
  }
  if (payload.movementType === "TRANSFER") {
    const locations = await sql`SELECT id FROM storage_locations WHERE laboratory_id = ${session.laboratoryId} AND id = ANY(${[payload.fromLocationId!, payload.toLocationId!]})`;
    if (locations.length !== 2 || String(item.storage_location_id ?? "") !== payload.fromLocationId) return NextResponse.json({ message: "Verifica la ubicación actual y la ubicación de destino." }, { status: 400 });
    if (quantity > available) return NextResponse.json({ message: `La cantidad a transferir supera la existencia (${available} ${itemUnit}).` }, { status: 400 });
  }
  const conversionNote = payload.unit && payload.unit.trim() && quantity !== payload.quantity
    ? `${payload.note ? `${payload.note} ` : ""}[Registrado: ${payload.quantity} ${payload.unit} = ${quantity} ${itemUnit}]`
    : payload.note;
  // El consumo de un invitado se firma con el nombre que declaró al entrar: la
  // bitácora no puede quedar sin responsable identificable.
  const guestNote = guest ? `${conversionNote ? `${conversionNote} ` : ""}[Invitado: ${session.name} · ${guest.grantLabel}]` : conversionNote;
  const rows = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
      performed_by, responsible_user_id, reference_type, reference_id, reason_code, from_location_id, to_location_id, transferred_quantity,
      usage_area, usage_purpose, used_by_person, authorized_by, guest_session_id
    ) VALUES (
      ${session.laboratoryId}, ${payload.inventoryItemId}, ${payload.movementType}, ${quantityDelta}, ${guestNote},
      ${guest ? null : session.userId}, ${guest ? null : session.userId}, ${payload.referenceType ?? null}, ${payload.referenceId ?? null}, ${payload.reasonCode}, ${payload.fromLocationId ?? null}, ${payload.toLocationId ?? null}, ${payload.movementType === "TRANSFER" ? quantity : null},
      ${trace.usageArea}, ${trace.usagePurpose}, ${guest ? session.name : trace.usedByPerson}, ${trace.authorizedBy}, ${guest?.sessionId ?? null}
    ) RETURNING *
  `;
  if (payload.movementType === "TRANSFER") await sql`UPDATE inventory_items SET storage_location_id = ${payload.toLocationId!}, updated_at = now() WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId}`;

  // Cierra la autorización: queda consumida y ligada al movimiento, de modo que
  // no puede reutilizarse y el historial muestra su folio.
  if (authorization) {
    await sql`
      UPDATE controlled_usage_requests
      SET status = 'CONSUMED', consumed_movement_id = ${String(rows[0].id)}, consumed_quantity = ${quantity},
        consumed_at = now(), updated_at = now()
      WHERE id = ${String(authorization.id)} AND laboratory_id = ${session.laboratoryId} AND consumed_at IS NULL
    `;
    await sql`
      UPDATE inventory_movements SET usage_request_id = ${String(authorization.id)}
      WHERE id = ${String(rows[0].id)} AND laboratory_id = ${session.laboratoryId}
    `;
    await writeAuditEvent(session, {
      action: "CONTROLLED_USAGE_CONSUMED",
      entityType: "controlled_usage_request",
      entityId: String(authorization.id),
      previousValue: { status: authorization.status },
      newValue: { status: "CONSUMED", movementId: rows[0].id, quantity },
      reason: `Consumo amparado por la autorización ${String(authorization.request_code)}`,
      metadata: { itemId: payload.inventoryItemId, sku: item.sku },
      request,
    });
  }
  await writeAuditEvent(session, { action: "INVENTORY_MOVEMENT_CREATED", entityType: "inventory_item", entityId: payload.inventoryItemId, previousValue: { quantity: rows[0].previous_quantity }, newValue: { quantity: rows[0].resulting_quantity }, reason: payload.note || payload.reasonCode, metadata: { movementId: rows[0].id, movementType: payload.movementType }, request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
