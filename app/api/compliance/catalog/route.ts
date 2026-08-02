import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { databaseIdSchema } from "@/lib/validation";
import { normalizePictograms } from "@/lib/ghs";
import { COMPLIANCE_CODE_PREFIX, REAGENT_CATEGORIES } from "@/lib/compliance-reagents";
import { computeNextCode } from "@/lib/research";

// Catálogo maestro de reactivos: la sustancia, no el frasco. Cada frasco del
// inventario puede apuntar aquí para heredar CAS, clasificación GHS y los
// requisitos regulatorios que le apliquen.

export const createSchema = z.object({
  name: z.string().min(2).max(200),
  synonyms: z.string().max(400).optional(),
  casNumber: z.string().max(40).optional(),
  unNumber: z.string().max(20).optional(),
  formula: z.string().max(180).optional(),
  concentration: z.string().max(120).optional(),
  presentation: z.string().max(160).optional(),
  defaultVendor: z.string().max(200).optional(),
  category: z.enum(REAGENT_CATEGORIES).default("UNCONTROLLED"),
  hazardPictograms: z.array(z.string()).max(9).optional(),
  hazardStatements: z.string().max(4000).optional(),
  regulatoryRequirements: z.string().max(4000).optional(),
  regulators: z.array(z.string().max(200)).max(10).optional(),
  requiresPermit: z.boolean().optional(),
  requiresPreapproval: z.boolean().optional(),
  storageConditions: z.string().max(2000).optional(),
  sdsUrl: z.string().url().optional().or(z.literal("")),
  notes: z.string().max(4000).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.code, c.name, c.synonyms, c.cas_number, c.concentration, c.presentation,
           c.default_vendor, c.category, c.hazard_pictograms, c.hazard_statements,
           c.regulatory_requirements, c.regulators, c.requires_permit, c.requires_preapproval,
           c.sds_url, c.status, c.updated_at,
           (SELECT count(*)::int FROM inventory_items i WHERE i.catalog_id = c.id AND i.status = 'ACTIVE') AS container_count,
           (SELECT COALESCE(sum(i.quantity), 0) FROM inventory_items i WHERE i.catalog_id = c.id AND i.status = 'ACTIVE') AS total_quantity,
           (SELECT count(*)::int FROM attachments a WHERE a.entity_type = 'reagent_catalog' AND a.entity_id = c.id) AS document_count
    FROM reagent_catalog c
    WHERE c.laboratory_id = ${session.laboratoryId} AND c.status = 'ACTIVE'
      AND (${category ?? null}::text IS NULL OR c.category = ${category ?? null})
    ORDER BY (c.category = 'UNCONTROLLED'), c.name
    LIMIT 500
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) {
    return NextResponse.json({ message: "No tienes permiso para administrar el catálogo de reactivos." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del reactivo.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const year = new Date().getFullYear();
  const existing = await sql`
    SELECT code FROM reagent_catalog WHERE laboratory_id = ${session.laboratoryId} AND code LIKE ${`${COMPLIANCE_CODE_PREFIX.catalog}-${year}-%`}
  `;
  const code = computeNextCode((existing as Array<{ code: string }>).map((row) => String(row.code)), COMPLIANCE_CODE_PREFIX.catalog, year, 4);

  const rows = await sql`
    INSERT INTO reagent_catalog (
      laboratory_id, code, name, synonyms, cas_number, un_number, formula, concentration, presentation,
      default_vendor, category, hazard_pictograms, hazard_statements, regulatory_requirements, regulators,
      requires_permit, requires_preapproval, storage_conditions, sds_url, notes, created_by
    ) VALUES (
      ${session.laboratoryId}, ${code}, ${payload.name}, ${payload.synonyms ?? null}, ${payload.casNumber ?? null},
      ${payload.unNumber ?? null}, ${payload.formula ?? null}, ${payload.concentration ?? null}, ${payload.presentation ?? null},
      ${payload.defaultVendor ?? null}, ${payload.category},
      ${JSON.stringify(normalizePictograms(payload.hazardPictograms ?? []))}::jsonb, ${payload.hazardStatements ?? null},
      ${payload.regulatoryRequirements ?? null}, ${JSON.stringify(payload.regulators ?? [])}::jsonb,
      ${payload.requiresPermit ?? false}, ${payload.requiresPreapproval ?? false},
      ${payload.storageConditions ?? null}, ${payload.sdsUrl || null}, ${payload.notes ?? null}, ${session.userId}
    ) RETURNING *
  `;

  await writeAuditEvent(session, {
    action: "REAGENT_CATALOG_CREATED",
    entityType: "reagent_catalog",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: `Alta en el catálogo de reactivos (${payload.category})`,
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
