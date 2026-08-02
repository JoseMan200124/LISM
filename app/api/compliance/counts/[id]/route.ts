import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { countDifference, requiresJustification } from "@/lib/compliance-reagents";
import { signRecord } from "@/lib/signature-service";

// Conteo de un inventario físico: registrar lo contado, cerrarlo y aprobar los
// ajustes. Aprobar exige firma y genera un movimiento de ajuste por cada
// diferencia: el saldo no se corrige a mano en ningún punto.

export const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("COUNT"),
    itemId: databaseIdSchema,
    countedQuantity: z.coerce.number().nonnegative(),
    justification: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal("CLOSE") }),
  z.object({ action: z.literal("APPROVE"), signaturePassword: z.string().min(8).max(200), note: z.string().max(2000).optional() }),
  z.object({ action: z.literal("CANCEL"), note: z.string().max(2000).optional() }),
]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const counts = await sql`
    SELECT c.*, s.full_name AS started_by_name, a.full_name AS approved_by_name
    FROM physical_counts c
    LEFT JOIN users s ON s.id = c.started_by
    LEFT JOIN users a ON a.id = c.approved_by
    WHERE c.id = ${id} AND c.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!counts.length) return NextResponse.json({ message: "Conteo no encontrado." }, { status: 404 });

  const items = await sql`
    SELECT ci.id, ci.inventory_item_id, ci.system_quantity, ci.counted_quantity, ci.unit,
           ci.difference, ci.justification, ci.counted_at, ci.adjustment_movement_id,
           i.sku, i.name, i.lot_number, i.is_controlled,
           COALESCE(l.name, 'Sin ubicación') AS location,
           u.full_name AS counted_by_name
    FROM physical_count_items ci
    JOIN inventory_items i ON i.id = ci.inventory_item_id
    LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
    LEFT JOIN users u ON u.id = ci.counted_by
    WHERE ci.count_id = ${id} AND ci.laboratory_id = ${session.laboratoryId}
    ORDER BY (ci.counted_quantity IS NULL) DESC, i.name
  `;
  return NextResponse.json({ data: { ...counts[0], items } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Acción inválida.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`SELECT * FROM physical_counts WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!rows.length) return NextResponse.json({ message: "Conteo no encontrado." }, { status: 404 });
  const count = rows[0] as Record<string, unknown>;

  switch (payload.action) {
    case "COUNT": {
      if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "Sin permiso para contar." }, { status: 403 });
      if (count.status !== "IN_PROGRESS") return NextResponse.json({ message: "Este conteo ya no admite registros." }, { status: 409 });

      const lines = await sql`
        SELECT * FROM physical_count_items WHERE id = ${payload.itemId} AND count_id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1
      `;
      if (!lines.length) return NextResponse.json({ message: "Ese envase no pertenece al conteo." }, { status: 404 });

      const difference = countDifference(Number(lines[0].system_quantity), payload.countedQuantity);
      if (requiresJustification(difference) && !payload.justification?.trim()) {
        return NextResponse.json(
          { success: false, error: "JUSTIFICATION_REQUIRED", message: "Hay diferencia con el sistema: escribe la justificación antes de guardar." },
          { status: 400 },
        );
      }

      const updated = await sql`
        UPDATE physical_count_items SET
          counted_quantity = ${payload.countedQuantity},
          difference = ${difference},
          justification = ${payload.justification?.trim() || null},
          counted_by = ${session.userId},
          counted_at = now()
        WHERE id = ${payload.itemId} AND laboratory_id = ${session.laboratoryId}
        RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "PHYSICAL_COUNT_LINE_RECORDED",
        entityType: "physical_count",
        entityId: id,
        previousValue: { counted: lines[0].counted_quantity, difference: lines[0].difference },
        newValue: { counted: payload.countedQuantity, difference },
        reason: payload.justification?.trim() || "Conteo registrado",
        metadata: { inventoryItemId: String(lines[0].inventory_item_id) },
        request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    case "CLOSE": {
      if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
      if (count.status !== "IN_PROGRESS") return NextResponse.json({ message: "Este conteo ya está cerrado." }, { status: 409 });
      const pending = await sql`
        SELECT count(*)::int AS total FROM physical_count_items
        WHERE count_id = ${id} AND laboratory_id = ${session.laboratoryId} AND counted_quantity IS NULL
      `;
      if (Number(pending[0]?.total ?? 0) > 0) {
        return NextResponse.json({ message: `Faltan ${pending[0].total} envases por contar.` }, { status: 409 });
      }
      const updated = await sql`
        UPDATE physical_counts SET status = 'CLOSED', closed_at = now(), updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "PHYSICAL_COUNT_CLOSED", entityType: "physical_count", entityId: id,
        reason: "Conteo cerrado, pendiente de aprobación", request,
      });
      return NextResponse.json({ data: updated[0] });
    }

    case "APPROVE": {
      if (!hasPermission(session, "compliance.manage")) {
        return NextResponse.json({ message: "Solo el responsable de cumplimiento puede aprobar los ajustes." }, { status: 403 });
      }
      if (count.status !== "CLOSED") return NextResponse.json({ message: "El conteo debe estar cerrado antes de aprobarlo." }, { status: 409 });

      const differences = await sql`
        SELECT ci.*, i.unit AS item_unit, i.name AS item_name
        FROM physical_count_items ci JOIN inventory_items i ON i.id = ci.inventory_item_id
        WHERE ci.count_id = ${id} AND ci.laboratory_id = ${session.laboratoryId}
          AND ci.difference IS NOT NULL AND ci.difference <> 0
      `;

      const signature = await signRecord(session, {
        password: payload.signaturePassword,
        entityType: "physical_count",
        entityId: id,
        meaning: "APPROVAL",
        content: {
          code: count.code,
          title: count.title,
          differences: (differences as Array<Record<string, unknown>>).map((line) => ({
            item: line.item_name, system: line.system_quantity, counted: line.counted_quantity,
            difference: line.difference, justification: line.justification,
          })),
        },
        request,
      });
      if (!signature.ok) return NextResponse.json({ message: signature.message }, { status: signature.status });

      // Cada diferencia se corrige con un movimiento de ajuste, nunca tocando
      // el saldo: así el kardex explica por qué cambió la existencia.
      for (const line of differences as Array<Record<string, unknown>>) {
        const delta = Number(line.difference);
        const movements = await sql`
          INSERT INTO inventory_movements (
            laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
            performed_by, responsible_user_id, reason_code, reference_type, reference_id
          ) VALUES (
            ${session.laboratoryId}, ${String(line.inventory_item_id)}, 'ADJUSTMENT', ${delta},
            ${`Ajuste por inventario físico ${String(count.code)}: ${String(line.justification ?? "sin justificación")}`},
            ${session.userId}, ${session.userId}, 'INVENTARIO_FISICO', 'physical_count', ${id}
          ) RETURNING id
        `;
        await sql`
          UPDATE physical_count_items SET adjustment_movement_id = ${String(movements[0].id)}
          WHERE id = ${String(line.id)} AND laboratory_id = ${session.laboratoryId}
        `;
      }

      const updated = await sql`
        UPDATE physical_counts SET status = 'APPROVED', approved_by = ${session.userId}, approved_at = now(),
          approval_signature_id = ${signature.signatureId}, notes = COALESCE(${payload.note ?? null}, notes), updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "PHYSICAL_COUNT_APPROVED", entityType: "physical_count", entityId: id,
        newValue: { adjustments: differences.length, signatureId: signature.signatureId },
        reason: payload.note || `Ajustes aprobados: ${differences.length} diferencia(s)`, request,
      });
      return NextResponse.json({ data: updated[0], adjustments: differences.length });
    }

    case "CANCEL": {
      if (!hasPermission(session, "compliance.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
      if (count.status === "APPROVED") return NextResponse.json({ message: "Un conteo aprobado no se cancela." }, { status: 409 });
      const updated = await sql`
        UPDATE physical_counts SET status = 'CANCELLED', notes = COALESCE(${payload.note ?? null}, notes), updated_at = now()
        WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} RETURNING *
      `;
      await writeAuditEvent(session, {
        action: "PHYSICAL_COUNT_CANCELLED", entityType: "physical_count", entityId: id,
        reason: payload.note || "Conteo cancelado", request,
      });
      return NextResponse.json({ data: updated[0] });
    }
  }
}
