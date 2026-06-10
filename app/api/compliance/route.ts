import { NextResponse } from "next/server";
import { complianceControls } from "@/lib/compliance-data";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { hasPermission } from "@/lib/authorization";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "compliance.view")) return NextResponse.json({ message: "No tienes permiso para consultar cumplimiento." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: complianceControls, mode: "demo" });
  const sql = getSql();
  const rows = await sql`
    SELECT p.name AS standard, p.version_label, c.control_key, c.area, c.requirement,
      c.implementation_note, c.evidence_expected, c.owner_role, c.control_state
    FROM regulatory_controls c
    JOIN regulatory_packages p ON p.id = c.package_id
    WHERE p.laboratory_id = ${session.laboratoryId} AND p.status = 'ACTIVE'
    ORDER BY p.name, c.area, c.control_key
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}
