import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { createSessionToken, setSessionCookie, type UserSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const demoSession: UserSession = {
  userId: "00000000-0000-0000-0000-000000000101",
  name: "José Admin",
  email: "admin@nexalab.local",
  role: "LAB_ADMIN",
  organizationId: "00000000-0000-0000-0000-000000000001",
  laboratoryId: "00000000-0000-0000-0000-000000000011",
  laboratoryName: "Laboratorio Central",
  sessionMode: "demo",
};

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Formato de solicitud inválido." }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Revisa el correo y la contraseña." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const databaseConfigured = hasDatabase();
  let session: UserSession | null = null;
  let authenticatedFromDatabase = false;

  // Modo demo: siempre disponible con las credenciales demo
  if (email === "admin@nexalab.local" && password === "Demo1234!") {
    if (!databaseConfigured || process.env.DEMO_MODE === "true") {
      session = demoSession;
    }
  }

  // Autenticación real contra la base de datos
  if (!session && databaseConfigured) {
    try {
      const sql = getSql();
      const rows = await sql`
        SELECT
          u.id          AS user_id,
          u.full_name,
          u.email,
          u.password_hash,
          m.role,
          o.id          AS organization_id,
          l.id          AS laboratory_id,
          l.name        AS laboratory_name
        FROM users u
        JOIN memberships m  ON m.user_id       = u.id AND m.status = 'ACTIVE'
        JOIN organizations o ON o.id           = m.organization_id AND o.status = 'ACTIVE'
        JOIN laboratories  l ON l.id           = m.laboratory_id   AND l.status = 'ACTIVE'
        WHERE lower(u.email) = lower(${email})
          AND u.status = 'ACTIVE'
        ORDER BY m.created_at ASC
        LIMIT 1
      `;

      const user = rows[0] as Record<string, string> | undefined;
      if (user && await compare(password, user.password_hash)) {
        session = {
          userId: user.user_id,
          name: user.full_name,
          email: user.email,
          role: user.role as UserSession["role"],
          organizationId: user.organization_id,
          laboratoryId: user.laboratory_id,
          laboratoryName: user.laboratory_name,
          sessionMode: "database",
        };
        authenticatedFromDatabase = true;
      }
    } catch (dbError) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      // Si hay DB configurada pero falla, intenta fallback demo para no bloquear el sistema
      if (email === "admin@nexalab.local" && password === "Demo1234!") {
        session = { ...demoSession, sessionMode: "demo" };
      } else {
        console.error("[login] Error de base de datos:", message);
        return NextResponse.json(
          { message: "Error de conexión con la base de datos. Contacta al administrador.", detail: process.env.NODE_ENV === "development" ? message : undefined },
          { status: 503 }
        );
      }
    }
  }

  if (!session) {
    return NextResponse.json({ message: "Credenciales inválidas." }, { status: 401 });
  }

  if (authenticatedFromDatabase) {
    try {
      const sql = getSql();
      await sql`UPDATE users SET last_login_at = now() WHERE id = ${session.userId}`;
      await writeAuditEvent(session, {
        action: "USER_LOGIN",
        entityType: "user_session",
        entityId: session.userId,
        newValue: { laboratoryId: session.laboratoryId, role: session.role },
        reason: "Inicio de sesión correcto",
        request,
      });
    } catch {
      // El login sigue siendo válido aunque fallen los registros secundarios
    }
  }

  const token = await createSessionToken(session);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, session: { name: session.name, laboratoryName: session.laboratoryName } });
}
