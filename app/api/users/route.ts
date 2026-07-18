import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { writeAuditEvent } from "@/lib/audit";
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
    SELECT u.id, u.full_name, u.email, u.status, m.role, m.status AS membership_status
    FROM users u
    JOIN memberships m ON m.user_id = u.id
    WHERE m.laboratory_id = ${session.laboratoryId} AND m.status IN ('ACTIVE', 'INACTIVE')
    ORDER BY u.full_name ASC
  `;
  return NextResponse.json({ data: rows, mode: "database" });
}

const INVITABLE_ROLES = ["LAB_ADMIN", "HEAD_OF_LAB", "ANALYST", "ASSISTANT", "AUDITOR", "CONSULTATION", "PROFESSOR", "STUDENT"] as const;

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(180),
  role: z.enum(INVITABLE_ROLES),
});

// Alta real de usuarios por el administrador: crea la cuenta con una
// contraseña temporal (se muestra una sola vez) y la membresía en el
// laboratorio activo con el rol elegido.
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasPermission(session, "configuration.manage")) {
    return NextResponse.json({ message: "No tienes permiso para invitar usuarios." }, { status: 403 });
  }
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ message: "Revisa el nombre, el correo y el rol.", issues: parsed.error.issues }, { status: 400 });
  if (!hasDatabase()) return NextResponse.json({ message: "El alta de usuarios requiere una base de datos configurada." }, { status: 503 });
  const { fullName, email, role } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const sql = getSql();

  const existing = await sql`SELECT id, full_name FROM users WHERE lower(email) = ${normalizedEmail} LIMIT 1`;
  let userId: string;
  let temporaryPassword: string | null = null;

  if (existing.length > 0) {
    userId = String(existing[0].id);
    const memberships = await sql`SELECT id FROM memberships WHERE user_id = ${userId} AND laboratory_id = ${session.laboratoryId} LIMIT 1`;
    if (memberships.length > 0) {
      return NextResponse.json({ message: "Esta persona ya tiene acceso a este laboratorio." }, { status: 409 });
    }
  } else {
    temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await hash(temporaryPassword, 10);
    const created = await sql`
      INSERT INTO users (full_name, email, password_hash, status)
      VALUES (${fullName}, ${normalizedEmail}, ${passwordHash}, 'ACTIVE')
      RETURNING id
    `;
    userId = String(created[0].id);
  }

  await sql`
    INSERT INTO memberships (organization_id, laboratory_id, user_id, role, status)
    VALUES (${session.organizationId}, ${session.laboratoryId}, ${userId}, ${role}, 'ACTIVE')
    ON CONFLICT (laboratory_id, user_id) DO UPDATE SET role = EXCLUDED.role, status = 'ACTIVE', updated_at = now()
  `;
  await writeAuditEvent(session, {
    action: "USER_INVITED",
    entityType: "user",
    entityId: userId,
    newValue: { email: normalizedEmail, role },
    reason: "Alta de usuario en el laboratorio",
    request,
  });
  return NextResponse.json({ data: { id: userId, email: normalizedEmail, role, temporaryPassword } }, { status: 201 });
}
