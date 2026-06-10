import { NextResponse } from "next/server";
import { qualityRecords } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "quality.view")) return NextResponse.json({ message: "No tienes permiso para consultar calidad." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: qualityRecords.oos, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT id, investigation_number, source_type, source_id, status, phase, description,
      impact_assessment, root_cause, owner_user_id, opened_at, closed_at
    FROM oos_investigations
    WHERE laboratory_id = ${session.laboratoryId}
    ORDER BY opened_at DESC LIMIT 200
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}
