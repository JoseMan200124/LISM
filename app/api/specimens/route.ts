import { NextResponse } from "next/server";
import { z } from "zod";
import { databaseIdSchema } from "@/lib/validation";
import { getSql, hasDatabase } from "@/lib/db";
import { recentSpecimens } from "@/lib/demo-data";
import { getSession } from "@/lib/session";
import { writeAuditEvent } from "@/lib/audit";
import { hasPermission } from "@/lib/authorization";

const specimenSchema = z.object({
  patientId: databaseIdSchema,
  specimenTypeId: databaseIdSchema,
  barcode: z.string().min(3).max(120),
  priority: z.enum(["ROUTINE", "PRIORITY", "URGENT"]).default("ROUTINE"),
  notes: z.string().max(1000).optional().default(""),
});

function createAccessionNumber() {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const tail = String(Math.floor(Math.random() * 9000) + 1000);
  return `GT-${yy}${mm}${dd}-${tail}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "specimens.view")) return NextResponse.json({ message: "No tienes permiso para consultar muestras." }, { status: 403 });

  if (!hasDatabase()) return NextResponse.json({ data: recentSpecimens, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      s.id,
      s.accession_number AS accession,
      p.full_name AS patient,
      st.name AS type,
      s.priority,
      s.status AS legacy_status,
      COALESCE(s.workflow_state_key, s.status::text) AS status,
      s.received_at,
      s.barcode,
      s.notes
    FROM specimens s
    JOIN patients p ON p.id = s.patient_id AND p.laboratory_id = s.laboratory_id
    JOIN specimen_types st ON st.id = s.specimen_type_id AND st.laboratory_id = s.laboratory_id
    WHERE s.laboratory_id = ${session.laboratoryId}
    ORDER BY s.received_at DESC
    LIMIT 100
  `;

  return NextResponse.json({ data: rows, mode: "database" });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "specimens.receive")) return NextResponse.json({ message: "No tienes permiso para registrar muestras." }, { status: 403 });

  const parsed = specimenSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Datos de muestra inválidos.", issues: parsed.error.issues }, { status: 400 });

  const accessionNumber = createAccessionNumber();
  if (!hasDatabase()) {
    return NextResponse.json({
      data: { id: crypto.randomUUID(), accession: accessionNumber, ...parsed.data, status: "RECEIVED", mode: "demo" },
    }, { status: 201 });
  }

  const sql = getSql();
  const { patientId, specimenTypeId, barcode, priority, notes } = parsed.data;
  const workflows = await sql`
    SELECT wv.id AS workflow_version_id, ws.state_key
    FROM workflow_definitions wd
    JOIN LATERAL (
      SELECT id FROM workflow_versions
      WHERE workflow_id = wd.id AND status = 'ACTIVE'
      ORDER BY version_number DESC LIMIT 1
    ) wv ON TRUE
    JOIN workflow_states ws ON ws.workflow_version_id = wv.id AND ws.is_initial = TRUE
    WHERE wd.laboratory_id = ${session.laboratoryId} AND wd.entity_type = 'SPECIMEN' AND wd.status = 'ACTIVE'
    ORDER BY wd.created_at ASC LIMIT 1
  `;
  const workflow = workflows[0] as Record<string, string> | undefined;
  const rows = await sql`
    INSERT INTO specimens (
      laboratory_id, accession_number, patient_id, specimen_type_id, barcode, priority, status, notes, created_by, workflow_version_id, workflow_state_key
    ) VALUES (
      ${session.laboratoryId}, ${accessionNumber}, ${patientId}, ${specimenTypeId}, ${barcode}, ${priority}, 'RECEIVED', ${notes}, ${session.userId}, ${workflow?.workflow_version_id ?? null}, ${workflow?.state_key ?? "RECEIVED"}
    )
    RETURNING id, accession_number AS accession, barcode, priority, status AS legacy_status, workflow_state_key AS status, received_at
  `;

  await writeAuditEvent(session, {
    action: "SPECIMEN_CREATED",
    entityType: "specimen",
    entityId: String(rows[0].id),
    newValue: rows[0],
    reason: "Registro de muestra",
    metadata: { accessionNumber },
    request,
  });

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
