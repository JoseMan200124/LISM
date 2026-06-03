import { NextResponse } from "next/server";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { recentSpecimens } from "@/lib/demo-data";
import { getSession } from "@/lib/session";

const specimenSchema = z.object({
  patientId: z.string().uuid(),
  specimenTypeId: z.string().uuid(),
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

  if (!hasDatabase()) return NextResponse.json({ data: recentSpecimens, mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT
      s.id,
      s.accession_number AS accession,
      p.full_name AS patient,
      st.name AS type,
      s.priority,
      s.status,
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
  const rows = await sql`
    INSERT INTO specimens (
      laboratory_id, accession_number, patient_id, specimen_type_id, barcode, priority, status, notes, created_by
    ) VALUES (
      ${session.laboratoryId}, ${accessionNumber}, ${patientId}, ${specimenTypeId}, ${barcode}, ${priority}, 'RECEIVED', ${notes}, ${session.userId}
    )
    RETURNING id, accession_number AS accession, barcode, priority, status, received_at
  `;

  await sql`
    INSERT INTO audit_logs (organization_id, laboratory_id, actor_user_id, action, entity_type, entity_id, metadata)
    VALUES (${session.organizationId}, ${session.laboratoryId}, ${session.userId}, 'SPECIMEN_CREATED', 'specimen', ${rows[0].id}, ${JSON.stringify({ accessionNumber })}::jsonb)
  `;

  return NextResponse.json({ data: rows[0] }, { status: 201 });
}
