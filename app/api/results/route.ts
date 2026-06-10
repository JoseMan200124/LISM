import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { resultRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const resultSchema = z.object({
  orderTestId: databaseIdSchema,
  numericValue: z.coerce.number().optional(),
  textValue: z.string().max(2000).optional(),
  unit: z.string().max(60).optional(),
  methodVersionId: databaseIdSchema.optional(),
  specificationVersionId: databaseIdSchema.optional(),
  rawData: z.record(z.string(), z.unknown()).default({}),
  customValues: z.record(z.string(), z.unknown()).default({}),
  note: z.string().max(1000).optional().default(""),
}).refine((value) => value.numericValue !== undefined || Boolean(value.textValue?.trim()), { message: "Debes ingresar un resultado numérico o textual." });

function isOutsideSpecification(numericValue: number | undefined, specification: Record<string, unknown> | undefined) {
  if (numericValue === undefined || !specification) return false;
  const lower = specification.lower_limit === null || specification.lower_limit === undefined ? null : Number(specification.lower_limit);
  const upper = specification.upper_limit === null || specification.upper_limit === undefined ? null : Number(specification.upper_limit);
  return (lower !== null && numericValue < lower) || (upper !== null && numericValue > upper);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "results.view")) return NextResponse.json({ message: "No tienes permiso para consultar resultados." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: resultRows, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT r.id, s.accession_number, tc.name AS test_name, p.full_name AS patient_name,
      r.numeric_value, r.text_value, r.unit, r.flag, r.status, r.revision_number,
      mv.version_code AS method_version, sv.version_code AS specification_version,
      r.created_at, r.reviewed_at, r.released_at
    FROM result_records r
    JOIN order_tests ot ON ot.id = r.order_test_id AND ot.laboratory_id = r.laboratory_id
    JOIN test_catalog tc ON tc.id = ot.test_catalog_id
    LEFT JOIN specimens s ON s.id = ot.specimen_id
    LEFT JOIN orders o ON o.id = ot.order_id
    LEFT JOIN patients p ON p.id = o.patient_id
    LEFT JOIN method_versions mv ON mv.id = r.method_version_id
    LEFT JOIN specification_versions sv ON sv.id = r.specification_version_id
    WHERE r.laboratory_id = ${session.laboratoryId}
    ORDER BY r.created_at DESC LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "results.enter")) return NextResponse.json({ message: "No tienes permiso para registrar resultados." }, { status: 403 });
  const parsed = resultSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Resultado inválido.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) {
    const oos = payload.numericValue !== undefined && payload.numericValue > 100;
    return NextResponse.json({ data: { id: crypto.randomUUID(), ...payload, flag: oos ? "OOS" : "NORMAL", status: "PENDING_VALIDATION" }, oosOpened: oos, mode: "demo" }, { status: 201 });
  }
  const sql = getSql();
  const tests = await sql`SELECT id FROM order_tests WHERE id = ${payload.orderTestId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
  if (!tests[0]) return NextResponse.json({ message: "La prueba asignada no existe en este laboratorio." }, { status: 404 });
  let specification: Record<string, unknown> | undefined;
  if (payload.specificationVersionId) {
    const specifications = await sql`SELECT * FROM specification_versions WHERE id = ${payload.specificationVersionId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    specification = specifications[0] as Record<string, unknown> | undefined;
    if (!specification) return NextResponse.json({ message: "La especificación indicada no pertenece al laboratorio." }, { status: 400 });
  }
  const outside = isOutsideSpecification(payload.numericValue, specification);
  const rows = await sql`
    INSERT INTO result_records (
      laboratory_id, order_test_id, numeric_value, text_value, unit, flag, status,
      entered_by, method_version_id, specification_version_id, raw_data, custom_values
    ) VALUES (
      ${session.laboratoryId}, ${payload.orderTestId}, ${payload.numericValue ?? null}, ${payload.textValue ?? null}, ${payload.unit ?? null},
      ${outside ? "OOS" : "NORMAL"}, 'PENDING_VALIDATION', ${session.userId}, ${payload.methodVersionId ?? null}, ${payload.specificationVersionId ?? null},
      ${JSON.stringify(payload.rawData)}::jsonb, ${JSON.stringify(payload.customValues)}::jsonb
    ) RETURNING *
  `;
  const result = rows[0] as Record<string, unknown>;
  let investigationId: string | null = null;
  if (outside) {
    const number = `OOS-${new Date().getUTCFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const investigations = await sql`
      INSERT INTO oos_investigations (
        laboratory_id, investigation_number, result_record_id, source_type, source_id,
        phase, description, owner_user_id, opened_by
      ) VALUES (
        ${session.laboratoryId}, ${number}, ${String(result.id)}, 'RESULT', ${String(result.id)},
        'DETECTED', 'Resultado detectado automáticamente fuera de la especificación vigente.', ${session.userId}, ${session.userId}
      ) RETURNING id
    `;
    investigationId = String(investigations[0].id);
    await sql`
      INSERT INTO alerts (organization_id, laboratory_id, severity, source_type, source_id, title, details)
      VALUES (${session.organizationId}, ${session.laboratoryId}, 'CRITICAL', 'RESULT', ${String(result.id)}, 'Resultado fuera de especificación', 'Se abrió una investigación OOS automática para conservar el resultado original y documentar la decisión.')
    `;
  }
  await writeAuditEvent(session, { action: "RESULT_CREATED", entityType: "result_record", entityId: String(result.id), newValue: result, reason: payload.note || "Captura de resultado", metadata: { outsideSpecification: outside, investigationId }, request });
  return NextResponse.json({ data: result, oosOpened: outside, investigationId }, { status: 201 });
}
