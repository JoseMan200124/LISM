import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { COMPLIANCE_CODE_PREFIX, DISPOSAL_METHODS, DISPOSAL_REASONS } from "@/lib/compliance-reagents";
import { computeNextCode } from "@/lib/research";
import { signRecord } from "@/lib/signature-service";

// Disposición final: qué se destruyó, cuánto, por qué, con qué método, quién lo
// autorizó y quién lo presenció. Va firmada y descuenta la existencia con un
// movimiento de descarte, de modo que el kardex cuadra con el acta.

const createSchema = z.object({
  inventoryItemId: databaseIdSchema,
  quantity: z.coerce.number().positive(),
  method: z.enum(DISPOSAL_METHODS).default("AUTHORIZED_MANAGER"),
  reason: z.enum(DISPOSAL_REASONS).default("EXPIRED"),
  detail: z.string().max(2000).optional(),
  disposalProvider: z.string().max(200).optional(),
  manifestNumber: z.string().max(120).optional(),
  disposedOn: z.string().date().optional(),
  witnessedBy: z.string().max(200).optional(),
  signaturePassword: z.string().min(8).max(200),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT d.id, d.code, d.quantity, d.unit, d.method, d.reason, d.detail,
           d.disposal_provider, d.manifest_number, d.disposed_on, d.witnessed_by, d.created_at,
           i.sku, i.name AS item_name, i.lot_number, i.is_controlled,
           u.full_name AS authorized_by_name,
           (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'reagent_disposal' AND a.entity_id = d.id) AS document_count
    FROM reagent_disposals d
    JOIN inventory_items i ON i.id = d.inventory_item_id
    LEFT JOIN users u ON u.id = d.authorized_by
    WHERE d.laboratory_id = ${session.laboratoryId}
    ORDER BY d.disposed_on DESC, d.created_at DESC
    LIMIT 300
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) {
    return NextResponse.json({ message: "No tienes permiso para registrar destrucciones." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos de la disposición.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const items = await sql`
    SELECT id, sku, name, quantity, unit, is_controlled FROM inventory_items
    WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE' LIMIT 1
  `;
  const item = items[0] as Record<string, unknown> | undefined;
  if (!item) return NextResponse.json({ message: "El envase no existe o ya está archivado." }, { status: 404 });

  const available = Number(item.quantity);
  if (payload.quantity > available) {
    return NextResponse.json({ message: `La cantidad a destruir supera la existencia (${available} ${String(item.unit)}).` }, { status: 400 });
  }

  const year = new Date().getFullYear();
  const existing = await sql`
    SELECT code FROM reagent_disposals WHERE laboratory_id = ${session.laboratoryId} AND code LIKE ${`${COMPLIANCE_CODE_PREFIX.disposal}-${year}-%`}
  `;
  const code = computeNextCode((existing as Array<{ code: string }>).map((row) => String(row.code)), COMPLIANCE_CODE_PREFIX.disposal, year, 3);
  const disposedOn = payload.disposedOn ?? new Date().toISOString().slice(0, 10);

  // La firma se toma antes de descontar: si no se puede confirmar la identidad,
  // no se destruye nada en el registro.
  const signature = await signRecord(session, {
    password: payload.signaturePassword,
    entityType: "reagent_disposal",
    entityId: code,
    meaning: "APPROVAL",
    content: {
      code, sku: item.sku, name: item.name, quantity: payload.quantity, unit: item.unit,
      method: payload.method, reason: payload.reason, disposedOn, manifest: payload.manifestNumber ?? null,
    },
    request,
  });
  if (!signature.ok) return NextResponse.json({ message: signature.message }, { status: signature.status });

  const movements = await sql`
    INSERT INTO inventory_movements (
      laboratory_id, inventory_item_id, movement_type, quantity_delta, note,
      performed_by, responsible_user_id, reason_code, reference_type,
      usage_area, usage_purpose, used_by_person, authorized_by
    ) VALUES (
      ${session.laboratoryId}, ${payload.inventoryItemId}, 'DISPOSAL', ${-payload.quantity},
      ${`Disposición final ${code} · ${payload.method}${payload.manifestNumber ? ` · manifiesto ${payload.manifestNumber}` : ""}`},
      ${session.userId}, ${session.userId}, 'DISPOSICION_FINAL', 'reagent_disposal',
      ${payload.disposalProvider ?? "Gestión de residuos"}, ${payload.detail ?? `Destrucción por ${payload.reason}`},
      ${session.name}, ${session.name}
    ) RETURNING id, previous_quantity, resulting_quantity
  `;

  const rows = await sql`
    INSERT INTO reagent_disposals (
      laboratory_id, code, inventory_item_id, quantity, unit, method, reason, detail,
      disposal_provider, manifest_number, disposed_on, authorized_by, witnessed_by,
      movement_id, signature_id, created_by
    ) VALUES (
      ${session.laboratoryId}, ${code}, ${payload.inventoryItemId}, ${payload.quantity}, ${String(item.unit)},
      ${payload.method}, ${payload.reason}, ${payload.detail ?? null}, ${payload.disposalProvider ?? null},
      ${payload.manifestNumber ?? null}, ${disposedOn}, ${session.userId}, ${payload.witnessedBy ?? null},
      ${String(movements[0].id)}, ${signature.signatureId}, ${session.userId}
    ) RETURNING *
  `;

  // Si el envase queda en cero, se archiva: un frasco vacío no debe seguir
  // apareciendo como existencia disponible.
  if (Number(movements[0].resulting_quantity) <= 0) {
    await sql`
      UPDATE inventory_items SET status = 'ARCHIVED', discarded_at = now(), updated_at = now()
      WHERE id = ${payload.inventoryItemId} AND laboratory_id = ${session.laboratoryId}
    `;
  }

  await writeAuditEvent(session, {
    action: "REAGENT_DISPOSAL_REGISTERED",
    entityType: "reagent_disposal",
    entityId: String(rows[0].id),
    previousValue: { quantity: movements[0].previous_quantity },
    newValue: { ...rows[0], resultingQuantity: movements[0].resulting_quantity },
    reason: `Disposición final ${code}: ${payload.quantity} ${String(item.unit)} de ${String(item.name)} (${payload.reason})`,
    request,
  });

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
