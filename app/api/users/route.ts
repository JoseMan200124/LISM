import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { usersRows } from "@/lib/demo-data";
import { getSession } from "@/lib/session";

// Directorio real de usuarios del laboratorio activo (Administración →
// Usuarios). Antes esta lista era 100% estática (lib/demo-data.ts,
// sin IDs reales) — se mantiene el mismo fallback de demo para cuando no
// hay base de datos, pero en modo real consulta memberships/users para que
// cada fila tenga un id real y así se pueda mostrar su foto de perfil.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para consultar usuarios." }, { status: 403 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({
      data: usersRows.map((row, index) => ({ id: `demo-${index}`, full_name: row.name, ...row })),
      mode: "demo",
    });
  }

  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.full_name, u.email, u.status, m.role
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE m.laboratory_id = ${session.laboratoryId} AND m.status = 'ACTIVE'
    ORDER BY u.full_name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}
