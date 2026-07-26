import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { roleLabels } from "@/lib/permissions";
import type { UserSession } from "@/lib/session";

// Directorio de la institución para escribir un mensaje: todas las personas
// activas de la organización, con el laboratorio al que pertenecen. Es lo que
// permite que el encargado de química encuentre al de biología.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (session.guest) return NextResponse.json({ message: "Sin acceso." }, { status: 403 });
  if (!hasDatabase()) return NextResponse.json({ data: [], mode: "demo" });

  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email,
           string_agg(DISTINCT l.name, ', ') AS laboratories,
           min(m.role) AS role
    FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.status = 'ACTIVE'
    LEFT JOIN laboratories l ON l.id = m.laboratory_id AND l.status = 'ACTIVE'
    WHERE m.organization_id = ${session.organizationId} AND m.status = 'ACTIVE' AND u.id <> ${session.userId}
    GROUP BY u.id, u.full_name, u.email
    ORDER BY u.full_name
    LIMIT 500
  `;

  return NextResponse.json({
    data: (rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      full_name: String(row.full_name),
      email: String(row.email ?? ""),
      laboratories: row.laboratories ? String(row.laboratories) : "Sin laboratorio asignado",
      role_label: roleLabels[String(row.role) as UserSession["role"]] ?? String(row.role ?? ""),
    })),
    mode: "database",
  });
}
