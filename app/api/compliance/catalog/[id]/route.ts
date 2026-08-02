import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { normalizePictograms } from "@/lib/ghs";
import { REAGENT_CATEGORIES } from "@/lib/compliance-reagents";

// Ficha del reactivo en el catálogo: sus frascos, sus permisos y sus documentos.

export const patchSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  synonyms: z.string().max(400).optional().nullable(),
  casNumber: z.string().max(40).optional().nullable(),
  unNumber: z.string().max(20).optional().nullable(),
  formula: z.string().max(180).optional().nullable(),
  concentration: z.string().max(120).optional().nullable(),
  presentation: z.string().max(160).optional().nullable(),
  defaultVendor: z.string().max(200).optional().nullable(),
  category: z.enum(REAGENT_CATEGORIES).optional(),
  hazardPictograms: z.array(z.string()).max(9).optional(),
  hazardStatements: z.string().max(4000).optional().nullable(),
  regulatoryRequirements: z.string().max(4000).optional().nullable(),
  regulators: z.array(z.string().max(200)).max(10).optional(),
  requiresPermit: z.boolean().optional(),
  requiresPreapproval: z.boolean().optional(),
  storageConditions: z.string().max(2000).optional().nullable(),
  sdsUrl: z.string().url().optional().nullable().or(z.literal("")),
  notes: z.string().max(4000).optional().nullable(),
  status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
}).refine((value) => Object.keys(value).length > 0, { message: "No hay cambios que aplicar." });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const rows = await sql`
    SELECT c.*, u.full_name AS created_by_name
    FROM reagent_catalog c LEFT JOIN users u ON u.id = c.created_by
    WHERE c.id = ${id} AND c.laboratory_id = ${session.laboratoryId} LIMIT 1
  `;
  if (!rows.length) return NextResponse.json({ message: "Reactivo no encontrado." }, { status: 404 });

  const [containers, permits, documents, receipts] = await Promise.all([
    sql`
      SELECT i.id, i.sku, i.lot_number, i.quantity, i.unit, i.expires_at, i.status,
             COALESCE(l.name, 'Sin ubicación') AS location
      FROM inventory_items i
      LEFT JOIN storage_locations l ON l.id = i.storage_location_id AND l.laboratory_id = i.laboratory_id
      WHERE i.catalog_id = ${id} AND i.laboratory_id = ${session.laboratoryId}
      ORDER BY i.status, i.expires_at NULLS LAST
    `,
    sql`
      SELECT p.id, p.permit_type, p.authority, p.permit_number, p.expires_on, p.status
      FROM regulatory_permit_reagents pr
      JOIN regulatory_permits p ON p.id = pr.permit_id
      WHERE pr.catalog_id = ${id} AND pr.laboratory_id = ${session.laboratoryId}
    `,
    sql`
      SELECT id, original_filename, mime_type, version_number, uploaded_at
      FROM attachments WHERE entity_type = 'reagent_catalog' AND entity_id = ${id} AND laboratory_id = ${session.laboratoryId}
      ORDER BY version_number DESC
    `,
    sql`
      SELECT r.id, r.receipt_code, r.vendor, r.invoice_number, r.received_quantity, r.unit, r.received_on
      FROM inventory_receipts r
      WHERE r.catalog_id = ${id} AND r.laboratory_id = ${session.laboratoryId}
      ORDER BY r.received_on DESC LIMIT 50
    `,
  ]);

  return NextResponse.json({ data: { ...rows[0], containers, permits, documents, receipts } });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  const { id } = await context.params;
  if (!databaseIdSchema.safeParse(id).success) return NextResponse.json({ message: "Identificador inválido." }, { status: 400 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Cambios inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const previous = await sql`SELECT * FROM reagent_catalog WHERE id = ${id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!previous.length) return NextResponse.json({ message: "Reactivo no encontrado." }, { status: 404 });

  const pictograms = payload.hazardPictograms === undefined ? null : JSON.stringify(normalizePictograms(payload.hazardPictograms));
  const regulators = payload.regulators === undefined ? null : JSON.stringify(payload.regulators);

  const rows = await sql`
    UPDATE reagent_catalog SET
      name = COALESCE(${payload.name ?? null}, name),
      synonyms = ${payload.synonyms === undefined ? previous[0].synonyms : payload.synonyms},
      cas_number = ${payload.casNumber === undefined ? previous[0].cas_number : payload.casNumber},
      un_number = ${payload.unNumber === undefined ? previous[0].un_number : payload.unNumber},
      formula = ${payload.formula === undefined ? previous[0].formula : payload.formula},
      concentration = ${payload.concentration === undefined ? previous[0].concentration : payload.concentration},
      presentation = ${payload.presentation === undefined ? previous[0].presentation : payload.presentation},
      default_vendor = ${payload.defaultVendor === undefined ? previous[0].default_vendor : payload.defaultVendor},
      category = COALESCE(${payload.category ?? null}, category),
      hazard_pictograms = COALESCE(${pictograms}::jsonb, hazard_pictograms),
      hazard_statements = ${payload.hazardStatements === undefined ? previous[0].hazard_statements : payload.hazardStatements},
      regulatory_requirements = ${payload.regulatoryRequirements === undefined ? previous[0].regulatory_requirements : payload.regulatoryRequirements},
      regulators = COALESCE(${regulators}::jsonb, regulators),
      requires_permit = COALESCE(${payload.requiresPermit ?? null}, requires_permit),
      requires_preapproval = COALESCE(${payload.requiresPreapproval ?? null}, requires_preapproval),
      storage_conditions = ${payload.storageConditions === undefined ? previous[0].storage_conditions : payload.storageConditions},
      sds_url = ${payload.sdsUrl === undefined ? previous[0].sds_url : (payload.sdsUrl || null)},
      notes = ${payload.notes === undefined ? previous[0].notes : payload.notes},
      status = COALESCE(${payload.status ?? null}, status),
      updated_at = now()
    WHERE id = ${id} AND laboratory_id = ${session.laboratoryId}
    RETURNING *
  `;

  await writeAuditEvent(session, {
    action: "REAGENT_CATALOG_UPDATED",
    entityType: "reagent_catalog",
    entityId: id,
    previousValue: previous[0],
    newValue: rows[0],
    reason: payload.category && payload.category !== previous[0].category
      ? `Reclasificado de ${String(previous[0].category)} a ${payload.category}`
      : "Actualización de la ficha del reactivo",
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
