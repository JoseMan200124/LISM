import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { CUSTOM_FIELD_MODULES, CUSTOM_FIELD_TYPES, uniqueFieldKey } from "@/lib/custom-fields";

const createSchema = z.object({
  module: z.enum(CUSTOM_FIELD_MODULES),
  label: z.string().min(2).max(120),
  fieldType: z.enum(CUSTOM_FIELD_TYPES),
  required: z.boolean().default(false),
  help: z.string().max(300).optional(),
  options: z.array(z.string().min(1).max(80)).max(30).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const url = new URL(request.url);
  const moduleFilter = url.searchParams.get("module");
  const sql = getSql();
  const rows = moduleFilter
    ? await sql`SELECT id, module_key, field_key, label, field_type, required_mode, validation_rule, sort_order, status FROM custom_field_definitions WHERE laboratory_id = ${session.laboratoryId} AND module_key = ${moduleFilter} AND status = 'ACTIVE' ORDER BY sort_order ASC, created_at ASC`
    : await sql`SELECT id, module_key, field_key, label, field_type, required_mode, validation_rule, sort_order, status FROM custom_field_definitions WHERE laboratory_id = ${session.laboratoryId} ORDER BY module_key, sort_order ASC, created_at ASC`;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) return NextResponse.json({ message: "No tienes permiso para configurar campos." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de campo inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  const existing = await sql`SELECT field_key FROM custom_field_definitions WHERE laboratory_id = ${session.laboratoryId} AND module_key = ${payload.module}`;
  const fieldKey = uniqueFieldKey(payload.label, existing.map((r) => String(r.field_key)));
  const validationRule = { help: payload.help ?? "", options: payload.fieldType === "SELECT" ? (payload.options ?? []) : [] };
  const rows = await sql`
    INSERT INTO custom_field_definitions (
      laboratory_id, module_key, field_key, label, field_type, required_mode, validation_rule, sort_order, created_by
    ) VALUES (
      ${session.laboratoryId}, ${payload.module}, ${fieldKey}, ${payload.label}, ${payload.fieldType},
      ${payload.required ? "REQUIRED" : "OPTIONAL"}, ${JSON.stringify(validationRule)}::jsonb, ${payload.sortOrder ?? 100}, ${session.userId}
    ) RETURNING id, module_key, field_key, label, field_type, required_mode, validation_rule, sort_order, status
  `;
  await writeAuditEvent(session, { action: "CUSTOM_FIELD_CREATED", entityType: "custom_field_definition", entityId: String(rows[0].id), newValue: rows[0], reason: "Alta de campo personalizado", request });
  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
