import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { effectivePermissions, permissionsByRole } from "@/lib/authorization";
import { createSessionToken, setSessionCookie, SESSION_TTL_SECONDS, type UserSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Los clientes nativos no reciben la cookie httpOnly: piden explícitamente
  // el token de sesión para guardarlo en el almacén seguro del dispositivo.
  client: z.enum(["web", "mobile"]).optional().default("web"),
});

const demoSession: UserSession = {
  userId: "00000000-0000-0000-0000-000000000101",
  name: "José Admin",
  email: "admin@nexalab.local",
  role: "LAB_ADMIN",
  organizationId: "00000000-0000-0000-0000-000000000001",
  laboratoryId: "00000000-0000-0000-0000-000000000011",
  laboratoryName: "Laboratorio Central",
  profileCode: "EDUCATIONAL_SMALL_LAB",
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

  const { email, password, client } = parsed.data;
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
          u.failed_login_count,
          u.locked_until,
          m.role,
          o.id          AS organization_id,
          l.id          AS laboratory_id,
          l.name        AS laboratory_name
          ,COALESCE(ls.profile_code, CASE WHEN bp.slug = 'academic_starter' OR o.plan_code = 'EDUCATIONAL' THEN 'EDUCATIONAL_SMALL_LAB' ELSE 'PHARMA_QC' END) AS profile_code
        FROM users u
        JOIN memberships m  ON m.user_id       = u.id AND m.status = 'ACTIVE'
        JOIN organizations o ON o.id           = m.organization_id AND o.status = 'ACTIVE'
        JOIN laboratories  l ON l.id           = m.laboratory_id   AND l.status = 'ACTIVE'
        LEFT JOIN laboratory_settings ls ON ls.laboratory_id = l.id
        LEFT JOIN billing_subscriptions bs ON bs.organization_id = o.id AND bs.status IN ('active','trialing','cancel_scheduled','payment_failed')
        LEFT JOIN billing_plans bp ON bp.id = bs.plan_id
        WHERE lower(u.email) = lower(${email})
          AND u.status = 'ACTIVE'
        ORDER BY m.created_at ASC
        LIMIT 1
      `;

      const user = rows[0] as Record<string, string> | undefined;

      // Bloqueo temporal por intentos fallidos (hallazgo #3 de la auditoría
      // de seguridad): no se intenta siquiera comparar la contraseña mientras
      // la cuenta está bloqueada, para no reiniciar el temporizador ni gastar
      // el costo de bcrypt en balde.
      if (user?.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
        return NextResponse.json(
          { message: `Demasiados intentos fallidos. Vuelve a intentarlo en ${minutesLeft} minuto${minutesLeft === 1 ? "" : "s"}.` },
          { status: 429 },
        );
      }

      if (user && await compare(password, user.password_hash)) {
        // Permisos efectivos: matriz base del rol + anulaciones que el
        // administrador haya definido para este laboratorio (migración 0017).
        let permissions: string[] | undefined;
        try {
          const overrides = await sql`
            SELECT permission, allowed FROM role_permission_overrides
            WHERE laboratory_id = ${user.laboratory_id} AND role = ${user.role}
          ` as Array<{ permission: string; allowed: boolean }>;
          permissions = effectivePermissions(user.role as UserSession["role"], overrides);
        } catch {
          permissions = undefined; // tabla aún no migrada: aplica la matriz base
        }
        session = {
          userId: user.user_id,
          name: user.full_name,
          email: user.email,
          role: user.role as UserSession["role"],
          organizationId: user.organization_id,
          laboratoryId: user.laboratory_id,
          laboratoryName: user.laboratory_name,
          profileCode: user.profile_code,
          sessionMode: "database",
          permissions,
        };
        authenticatedFromDatabase = true;
      } else if (user) {
        // Correo válido pero contraseña incorrecta: cuenta el intento y, al
        // llegar a 5 seguidos, bloquea la cuenta 15 minutos.
        const nextCount = Number(user.failed_login_count ?? 0) + 1;
        await sql`
          UPDATE users
          SET failed_login_count = ${nextCount},
              locked_until = CASE WHEN ${nextCount} >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
          WHERE id = ${user.user_id}
        `;
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
      await sql`UPDATE users SET last_login_at = now(), failed_login_count = 0, locked_until = NULL WHERE id = ${session.userId}`;
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

  if (client === "mobile") {
    return NextResponse.json({
      ok: true,
      token,
      expiresInSeconds: SESSION_TTL_SECONDS,
      session: {
        userId: session.userId,
        name: session.name,
        email: session.email,
        role: session.role,
        organizationId: session.organizationId,
        laboratoryId: session.laboratoryId,
        laboratoryName: session.laboratoryName,
        profileCode: session.profileCode,
        sessionMode: session.sessionMode,
        permissions: session.permissions ?? permissionsByRole[session.role] ?? [],
      },
    });
  }

  return NextResponse.json({ ok: true, session: { name: session.name, laboratoryName: session.laboratoryName } });
}
