import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { educationalReservations } from "@/lib/compliance-data";

const createSchema = z.object({
  practiceId: databaseIdSchema.optional().nullable(),
  practiceCode: z.string().max(80).optional(),
  resourceType: z.enum(["INVENTORY_ITEM", "EQUIPMENT", "OTHER"]),
  resourceId: databaseIdSchema.optional().nullable(),
  resourceName: z.string().min(2).max(180).optional(),
  quantity: z.coerce.number().positive().optional(),
  unit: z.string().max(40).optional(),
  neededAt: z.string().datetime({ offset: true }).optional().nullable(),
  notes: z.string().max(1000).optional(),
});

const patchSchema = z.object({
  id: databaseIdSchema,
  status: z.enum(["APPROVED", "PREPARING", "READY", "PARTIAL", "REJECTED", "CONSUMED", "RETURNED", "CANCELLED"]),
  note: z.string().max(1000).optional(),
  approvedQuantity: z.coerce.number().nonnegative().optional(),
});

function nextReservationCode(count: number): string {
  return `RES-2026-${String(count + 89).padStart(3, "0")}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.view")) return NextResponse.json({ message: "No tienes permiso para consultar reservas." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: educationalReservations, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      r.id, r.reservation_code, r.resource_type, r.resource_id, r.quantity, r.unit,
      r.needed_at, r.status, r.created_at,
      ep.title AS practice_title, ep.practice_code,
      u.full_name AS requester_name,
      ua.full_name AS approver_name,
      COALESCE(i.name, eq.name, 'Sin recurso') AS resource_name
    FROM resource_reservations r
    LEFT JOIN educational_practices ep ON ep.id = r.practice_id
    LEFT JOIN users u ON u.id = r.requested_by
    LEFT JOIN users ua ON ua.id = r.approved_by
    LEFT JOIN inventory_items i ON i.id = r.resource_id AND r.resource_type = 'INVENTORY_ITEM'
    LEFT JOIN equipment eq ON eq.id = r.resource_id AND r.resource_type = 'EQUIPMENT'
    WHERE r.laboratory_id = ${session.laboratoryId}
    ORDER BY r.needed_at ASC NULLS LAST, r.created_at DESC
    LIMIT 250
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para crear reservas." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de reserva inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) {
    const id = crypto.randomUUID();
    return NextResponse.json({
      data: {
        id,
        reservationCode: nextReservationCode(Math.floor(Math.random() * 10)),
        ...payload,
        requestedBy: session.userId,
        status: "PENDING",
        mode: "demo",
      },
    }, { status: 201 });
  }

  const sql = getSql();
  const countRows = await sql`SELECT COUNT(*) AS total FROM resource_reservations WHERE laboratory_id = ${session.laboratoryId}`;
  const reservationCode = nextReservationCode(Number(countRows[0].total));

  const rows = await sql`
    INSERT INTO resource_reservations (
      laboratory_id, reservation_code, practice_id, resource_type,
      resource_id, quantity, unit, needed_at, requested_by
    ) VALUES (
      ${session.laboratoryId}, ${reservationCode},
      ${payload.practiceId ?? null}, ${payload.resourceType},
      ${payload.resourceId ?? null}, ${payload.quantity ?? null},
      ${payload.unit ?? null}, ${payload.neededAt ?? null}, ${session.userId}
    )
    RETURNING id, reservation_code, resource_type, quantity, unit, needed_at, status, created_at
  `;
  await writeAuditEvent(session, {
    action: "RESOURCE_RESERVATION_CREATED",
    entityType: "resource_reservation",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Reserva de recurso para práctica educativa",
    metadata: { practiceId: payload.practiceId, resourceType: payload.resourceType },
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "education.manage")) return NextResponse.json({ message: "No tienes permiso para actualizar reservas." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) return NextResponse.json({ data: { ...payload, mode: "demo" } });

  const sql = getSql();
  const previous = await sql`SELECT * FROM resource_reservations WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Reserva no encontrada." }, { status: 404 });

  const approvedBy = ["APPROVED", "READY"].includes(payload.status) ? session.userId : null;
  const rows = await sql`
    UPDATE resource_reservations
    SET status = ${payload.status},
        approved_by = COALESCE(${approvedBy}, approved_by)
    WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, reservation_code, resource_type, quantity, unit, needed_at, status
  `;
  await writeAuditEvent(session, {
    action: "RESOURCE_RESERVATION_APPROVED",
    entityType: "resource_reservation",
    entityId: payload.id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: payload.note,
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
