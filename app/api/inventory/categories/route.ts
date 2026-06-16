import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { defaultInventoryCategories } from "@/lib/lab-profile";

type InventoryCategoryDto = {
  id: string;
  code: string;
  name: string;
  prefix: string;
  status: "ACTIVE" | "INACTIVE";
};

const createSchema = z.object({
  name: z.string().min(2).max(120),
  prefix: z.string().min(2).max(8).toUpperCase().regex(/^[A-Z0-9]+$/, "El prefijo solo puede contener letras mayúsculas y números."),
  description: z.string().max(500).optional(),
});

const patchSchema = z.object({
  id: databaseIdSchema,
  name: z.string().min(2).max(120).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

const demoCategories: InventoryCategoryDto[] = defaultInventoryCategories.map((cat, index) => ({
  id: `00000000-0000-0000-0000-0000000000${String(index + 1).padStart(2, "0")}`,
  code: cat.code,
  name: cat.name,
  prefix: cat.prefix,
  status: "ACTIVE",
}));

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "inventory.view")) return NextResponse.json({ message: "No tienes permiso para consultar categorías." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: demoCategories, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT id, code, name, COALESCE(prefix, code) AS prefix, status
    FROM inventory_categories
    WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'
    ORDER BY name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para crear categorías." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  const code = payload.prefix;

  if (!hasDatabase()) {
    const id = crypto.randomUUID();
    return NextResponse.json({ data: { id, code, name: payload.name, prefix: payload.prefix, status: "ACTIVE", mode: "demo" } }, { status: 201 });
  }

  const sql = getSql();
  const existing = await sql`SELECT id FROM inventory_categories WHERE laboratory_id = ${session.laboratoryId} AND code = ${code} LIMIT 1`;
  if (existing.length > 0) return NextResponse.json({ success: false, error: "CONFLICT", message: "Ya existe una categoría con ese prefijo." }, { status: 409 });

  const rows = await sql`
    INSERT INTO inventory_categories (laboratory_id, code, name, prefix)
    VALUES (${session.laboratoryId}, ${code}, ${payload.name}, ${payload.prefix})
    RETURNING id, code, name, COALESCE(prefix, code) AS prefix, status
  `;
  await writeAuditEvent(session, {
    action: "INVENTORY_CATEGORY_CREATED",
    entityType: "inventory_category",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Categoría de inventario creada",
    request,
  });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para actualizar categorías." }, { status: 403 });

  const json = await request.json() as unknown;
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;

  if (!hasDatabase()) return NextResponse.json({ data: { ...payload, mode: "demo" } });

  const sql = getSql();
  const previous = await sql`SELECT * FROM inventory_categories WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (previous.length === 0) return NextResponse.json({ message: "Categoría no encontrada." }, { status: 404 });

  const rows = await sql`
    UPDATE inventory_categories
    SET name = COALESCE(${payload.name ?? null}, name),
        status = COALESCE(${payload.status ?? null}, status)
    WHERE id = ${payload.id} AND laboratory_id = ${session.laboratoryId}
    RETURNING id, code, name, COALESCE(prefix, code) AS prefix, status
  `;
  await writeAuditEvent(session, {
    action: "INVENTORY_CATEGORY_UPDATED",
    entityType: "inventory_category",
    entityId: payload.id,
    previousValue: previous[0],
    newValue: rows[0],
    request,
  });
  return NextResponse.json({ data: rows[0] });
}
