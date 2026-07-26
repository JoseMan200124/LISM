import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { COMPLIANCE_CODE_PREFIX, COUNT_SCOPES } from "@/lib/compliance-reagents";
import { computeNextCode } from "@/lib/research";

// Inventario físico: se congela lo que dice el sistema, se cuenta frasco por
// frasco y las diferencias se justifican y se aprueban. Es el ejercicio que
// demuestra que el saldo del sistema corresponde con la repisa.

const createSchema = z.object({
  title: z.string().min(3).max(200),
  scope: z.enum(COUNT_SCOPES).default("CONTROLLED"),
  categoryName: z.string().max(120).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "Sin permiso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT c.id, c.code, c.title, c.scope, c.status, c.started_at, c.closed_at, c.approved_at, c.notes,
           s.full_name AS started_by_name, a.full_name AS approved_by_name,
           (SELECT count(*)::int FROM physical_count_items ci WHERE ci.count_id = c.id) AS item_count,
           (SELECT count(*)::int FROM physical_count_items ci WHERE ci.count_id = c.id AND ci.counted_quantity IS NOT NULL) AS counted_count,
           (SELECT count(*)::int FROM physical_count_items ci WHERE ci.count_id = c.id AND ci.difference IS NOT NULL AND ci.difference <> 0) AS difference_count
    FROM physical_counts c
    LEFT JOIN users s ON s.id = c.started_by
    LEFT JOIN users a ON a.id = c.approved_by
    WHERE c.laboratory_id = ${session.laboratoryId}
    ORDER BY c.started_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.manage")) {
    return NextResponse.json({ message: "No tienes permiso para iniciar un inventario físico." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Revisa los datos del conteo.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ message: "Requiere base de datos." }, { status: 503 });

  const sql = getSql();
  const year = new Date().getFullYear();
  const existing = await sql`
    SELECT code FROM physical_counts WHERE laboratory_id = ${session.laboratoryId} AND code LIKE ${`${COMPLIANCE_CODE_PREFIX.count}-${year}-%`}
  `;
  const code = computeNextCode((existing as Array<{ code: string }>).map((row) => String(row.code)), COMPLIANCE_CODE_PREFIX.count, year, 3);

  const counts = await sql`
    INSERT INTO physical_counts (laboratory_id, code, title, scope, status, notes, started_by)
    VALUES (${session.laboratoryId}, ${code}, ${payload.title}, ${payload.scope}, 'IN_PROGRESS', ${payload.notes ?? null}, ${session.userId})
    RETURNING *
  `;
  const countId = String(counts[0].id);

  // Se congela la existencia del sistema en el momento de abrir el conteo: la
  // diferencia solo es demostrable contra ese número, no contra el de después.
  const inserted = await sql`
    INSERT INTO physical_count_items (count_id, laboratory_id, inventory_item_id, system_quantity, unit)
    SELECT ${countId}, ${session.laboratoryId}, i.id, i.quantity, i.unit
    FROM inventory_items i
    LEFT JOIN reagent_catalog rc ON rc.id = i.catalog_id
    LEFT JOIN inventory_categories ic ON ic.id = i.category_id
    WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
      AND (
        ${payload.scope}::text = 'ALL'
        OR (${payload.scope}::text = 'CONTROLLED' AND (i.is_controlled = TRUE OR rc.category IN ('CONTROLLED','DUAL_USE','PRECURSOR')))
        OR (${payload.scope}::text = 'CATEGORY' AND ic.name = ${payload.categoryName ?? ""}::text)
      )
    RETURNING id
  `;

  await writeAuditEvent(session, {
    action: "PHYSICAL_COUNT_STARTED",
    entityType: "physical_count",
    entityId: countId,
    newValue: { code, scope: payload.scope, items: inserted.length },
    reason: `Inicio de inventario físico ${code} (${inserted.length} envases)`,
    request,
  });

  return NextResponse.json({ data: { ...counts[0], item_count: inserted.length } }, { status: 201 });
}
