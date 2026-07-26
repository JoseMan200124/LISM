import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { PERMIT_STATUSES, PERMIT_TYPES } from "@/lib/compliance-reagents";

// Licencias, permisos y autorizaciones ante la autoridad. Su vencimiento
// alimenta las alertas y el centro de notificaciones: operar con una licencia
// vencida es la falta que primero encuentra una inspección.

const createSchema = z.object({
  permitType: z.enum(PERMIT_TYPES).default("LICENSE"),
  authority: z.string().min(2).max(200),
  permitNumber: z.string().min(1).max(120),
  holder: z.string().max(200).optional(),
  scope: z.string().max(4000).optional(),
  issuedOn: z.string().date().optional().nullable(),
  expiresOn: z.string().date().optional().nullable(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  externalUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(4000).optional(),
  catalogIds: z.array(databaseIdSchema).max(200).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasAnyPermission(session, ["compliance.view", "compliance.manage", "inventory.view"])) {
    return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  }
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT p.id, p.permit_type, p.authority, p.permit_number, p.holder, p.scope,
           p.issued_on, p.expires_on, p.status, p.external_url, p.notes, p.created_at,
           u.full_name AS responsible_name,
           (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'regulatory_permit' AND a.entity_id = p.id) AS document_count,
           (SELECT count(*)::int FROM regulatory_permit_reagents pr WHERE pr.permit_id = p.id) AS reagent_count
    FROM regulatory_permits p
    LEFT JOIN users u ON u.id = p.responsible_user_id
    WHERE p.laboratory_id = ${session.laboratoryId}
    ORDER BY p.expires_on NULLS LAST, p.authority
    LIMIT 300
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "compliance.manage")) {
    return NextResponse.json({ message: "No tienes permiso para registrar licencias y permisos." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del permiso.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  let rows;
  try {
    rows = await sql`
      INSERT INTO regulatory_permits (
        laboratory_id, permit_type, authority, permit_number, holder, scope,
        issued_on, expires_on, responsible_user_id, external_url, notes, created_by
      ) VALUES (
        ${session.laboratoryId}, ${payload.permitType}, ${payload.authority}, ${payload.permitNumber},
        ${payload.holder ?? null}, ${payload.scope ?? null}, ${payload.issuedOn ?? null}, ${payload.expiresOn ?? null},
        ${payload.responsibleUserId ?? null}, ${payload.externalUrl || null}, ${payload.notes ?? null}, ${session.userId}
      ) RETURNING *
    `;
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (text.includes("23505") || text.includes("duplicate key")) {
      return NextResponse.json({ message: "Ya existe un documento con ese tipo y número en este laboratorio." }, { status: 409 });
    }
    throw error;
  }

  for (const catalogId of payload.catalogIds ?? []) {
    await sql`
      INSERT INTO regulatory_permit_reagents (permit_id, laboratory_id, catalog_id)
      VALUES (${String(rows[0].id)}, ${session.laboratoryId}, ${catalogId})
      ON CONFLICT (permit_id, catalog_id) DO NOTHING
    `;
  }

  await writeAuditEvent(session, {
    action: "REGULATORY_PERMIT_CREATED",
    entityType: "regulatory_permit",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: `Alta de ${payload.permitType} ${payload.permitNumber} (${payload.authority})`,
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

const patchSchema = z.object({
  id: databaseIdSchema,
  status: z.enum(PERMIT_STATUSES).optional(),
  expiresOn: z.string().date().optional().nullable(),
  scope: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  responsibleUserId: databaseIdSchema.optional().nullable(),
  catalogIds: z.array(databaseIdSchema).max(200).optional(),
});

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "compliance.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const previous = await sql`SELECT * FROM regulatory_permits WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length) return NextResponse.json({ message: "Permiso no encontrado." }, { status: 404 });

  const rows = await sql`
    UPDATE regulatory_permits SET
      status = COALESCE(${payload.status ?? null}, status),
      expires_on = ${payload.expiresOn === undefined ? previous[0].expires_on : payload.expiresOn},
      scope = ${payload.scope === undefined ? previous[0].scope : payload.scope},
      notes = ${payload.notes === undefined ? previous[0].notes : payload.notes},
      responsible_user_id = ${payload.responsibleUserId === undefined ? previous[0].responsible_user_id : payload.responsibleUserId},
      updated_at = now()
    WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *
  `;

  if (payload.catalogIds) {
    await sql`DELETE FROM regulatory_permit_reagents WHERE permit_id = ${payload.id} AND laboratory_id = ${session.laboratoryId}`;
    for (const catalogId of payload.catalogIds) {
      await sql`
        INSERT INTO regulatory_permit_reagents (permit_id, laboratory_id, catalog_id)
        VALUES (${payload.id}, ${session.laboratoryId}, ${catalogId})
        ON CONFLICT (permit_id, catalog_id) DO NOTHING
      `;
    }
  }

  await writeAuditEvent(session, {
    action: "REGULATORY_PERMIT_UPDATED",
    entityType: "regulatory_permit",
    entityId: payload.id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: payload.status ? `Cambio de estado a ${payload.status}` : "Actualización del permiso",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
