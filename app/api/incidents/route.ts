import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";
import { INCIDENT_CATEGORIES, INCIDENT_RELATED_TYPES, INCIDENT_SEVERITIES, computeNextIncidentCode, isMissingRelationError } from "@/lib/incidents";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  category: z.enum(INCIDENT_CATEGORIES),
  description: z.string().max(4000).optional(),
  severity: z.enum(INCIDENT_SEVERITIES).default("MEDIUM"),
  location: z.string().max(160).optional(),
  relatedType: z.enum(INCIDENT_RELATED_TYPES).optional().nullable(),
  relatedId: databaseIdSchema.optional().nullable(),
  assignedTo: databaseIdSchema.optional().nullable(),
  occurredAt: z.string().datetime({ offset: true }).optional().nullable(),
  actionsTaken: z.string().max(4000).optional(),
});

async function nextIncidentCode(sql: ReturnType<typeof getSql>, laboratoryId: string): Promise<string> {
  const year = new Date().getFullYear();
  const rows = await sql`SELECT incident_code FROM incidents WHERE laboratory_id = ${laboratoryId} AND incident_code LIKE ${`INC-${year}-%`}`;
  return computeNextIncidentCode(rows.map((r) => String(r.incident_code)), year);
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "incidents.view")) return NextResponse.json({ message: "No tienes permiso para consultar incidencias." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT i.id, i.incident_code, i.title, i.category, i.severity, i.status, i.location,
        i.related_type, i.related_id, i.occurred_at, i.created_at,
        u.full_name AS assigned_name
      FROM incidents i
      LEFT JOIN users u ON u.id = i.assigned_to
      WHERE i.laboratory_id = ${session.laboratoryId}
      ORDER BY i.created_at DESC
      LIMIT 250
    `;
    return NextResponse.json({ data: rows, mode: "database" });
  } catch (error) {
    // Migración 0014 aún no aplicada: el módulo está desplegado pero inerte.
    if (isMissingRelationError(error)) return NextResponse.json({ data: [], mode: "pending-migration" });
    console.error("[api/incidents] GET", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible cargar las incidencias." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "incidents.manage")) return NextResponse.json({ message: "No tienes permiso para registrar incidencias." }, { status: 403 });
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ success: false, error: "VALIDATION_ERROR", message: "Datos de incidencia inválidos.", issues: parsed.error.issues }, { status: 400 });
  const payload = parsed.data;
  if (!hasDatabase()) return NextResponse.json({ data: { id: crypto.randomUUID(), incident_code: "INC-0001", ...payload, status: "OPEN" }, mode: "demo" }, { status: 201 });
  const sql = getSql();
  try {
    const code = await nextIncidentCode(sql, session.laboratoryId);
    const rows = await sql`
      INSERT INTO incidents (
        laboratory_id, incident_code, title, category, description, severity, location,
        related_type, related_id, assigned_to, occurred_at, actions_taken, created_by
      ) VALUES (
        ${session.laboratoryId}, ${code}, ${payload.title}, ${payload.category}, ${payload.description ?? null},
        ${payload.severity}, ${payload.location ?? null}, ${payload.relatedType ?? null}, ${payload.relatedId ?? null},
        ${payload.assignedTo ?? null}, ${payload.occurredAt ?? null}, ${payload.actionsTaken ?? null}, ${session.userId}
      ) RETURNING *
    `;
    await writeAuditEvent(session, { action: "INCIDENT_CREATED", entityType: "incident", entityId: String(rows[0].id), newValue: rows[0], reason: "Registro de incidencia/hallazgo", request });
    return NextResponse.json({ data: rows[0] }, { status: 201 });
  } catch (error) {
    if (isMissingRelationError(error)) return NextResponse.json({ success: false, error: "MODULE_NOT_PROVISIONED", message: "El módulo de incidencias aún no está habilitado en la base de datos. Aplica la migración 0014." }, { status: 503 });
    console.error("[api/incidents] POST", error);
    return NextResponse.json({ success: false, error: "INTERNAL_ERROR", message: "No fue posible registrar la incidencia." }, { status: 500 });
  }
}
