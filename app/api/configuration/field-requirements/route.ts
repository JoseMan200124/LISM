import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

// Requisitos de los campos integrados del formulario de inventario por tipo de
// artículo (plantillas). El administrador decide qué campos son obligatorios
// para reactivos, materiales, insumos, medios de cultivo u otros. Se guarda en
// laboratory_settings.field_requirements (migración 0017).

const requirementSchema = z.record(
  z.string().max(40),
  z.record(z.string().max(60), z.enum(["REQUIRED", "OPTIONAL"])),
);

const putSchema = z.object({
  inventory: requirementSchema,
});

function isMissingColumn(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("field_requirements");
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ data: { inventory: {} }, mode: "demo" });
  const sql = getSql();
  try {
    const rows = await sql`SELECT field_requirements FROM laboratory_settings WHERE laboratory_id = ${session.laboratoryId} LIMIT 1`;
    const value = (rows[0]?.field_requirements ?? {}) as { inventory?: Record<string, Record<string, string>> };
    return NextResponse.json({ data: { inventory: value.inventory ?? {} }, mode: "database" });
  } catch (error) {
    if (isMissingColumn(error)) return NextResponse.json({ data: { inventory: {} }, mode: "pending-migration" });
    throw error;
  }
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para configurar plantillas." }, { status: 403 });
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Configuración inválida.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ data: parsed.data, mode: "demo" });
  const sql = getSql();
  try {
    const previous = await sql`SELECT field_requirements FROM laboratory_settings WHERE laboratory_id = ${session.laboratoryId} LIMIT 1`;
    const merged = { ...(previous[0]?.field_requirements as Record<string, unknown> ?? {}), inventory: parsed.data.inventory };
    const rows = await sql`
      INSERT INTO laboratory_settings (laboratory_id, field_requirements)
      VALUES (${session.laboratoryId}, ${JSON.stringify(merged)}::jsonb)
      ON CONFLICT (laboratory_id)
      DO UPDATE SET field_requirements = EXCLUDED.field_requirements, updated_at = now()
      RETURNING field_requirements
    `;
    await writeAuditEvent(session, {
      action: "FIELD_REQUIREMENTS_UPDATED",
      entityType: "laboratory_settings",
      entityId: session.laboratoryId,
      previousValue: previous[0]?.field_requirements ?? {},
      newValue: rows[0].field_requirements,
      reason: "Plantillas de campos por tipo de artículo actualizadas",
      request,
    });
    return NextResponse.json({ data: rows[0].field_requirements });
  } catch (error) {
    if (isMissingColumn(error)) return NextResponse.json({ message: "Las plantillas por tipo de artículo estarán disponibles al aplicar la actualización de base de datos (migración 0017)." }, { status: 503 });
    throw error;
  }
}
