import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { createSessionToken, setSessionCookie, type UserSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const demoSession: UserSession = {
  userId: "00000000-0000-0000-0000-000000000101",
  name: "José Admin",
  email: "admin@nexalab.local",
  role: "LAB_ADMIN",
  organizationId: "00000000-0000-0000-0000-000000000001",
  laboratoryId: "00000000-0000-0000-0000-000000000011",
  laboratoryName: "Laboratorio Central",
};

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ message: "Revisa el correo y la contraseña." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const demoMode = process.env.DEMO_MODE !== "false" || !hasDatabase();

  let session: UserSession | null = null;

  if (demoMode && email === "admin@nexalab.local" && password === "Demo1234!") {
    session = demoSession;
  }

  if (!session && hasDatabase()) {
    const sql = getSql();
    const rows = await sql`
      SELECT
        u.id AS user_id,
        u.full_name,
        u.email,
        u.password_hash,
        m.role,
        o.id AS organization_id,
        l.id AS laboratory_id,
        l.name AS laboratory_name
      FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
      JOIN organizations o ON o.id = m.organization_id AND o.status = 'ACTIVE'
      JOIN laboratories l ON l.id = m.laboratory_id AND l.status = 'ACTIVE'
      WHERE lower(u.email) = lower(${email}) AND u.status = 'ACTIVE'
      ORDER BY m.created_at ASC
      LIMIT 1
    `;

    const user = rows[0] as Record<string, string> | undefined;
    if (user && (await compare(password, user.password_hash))) {
      session = {
        userId: user.user_id,
        name: user.full_name,
        email: user.email,
        role: user.role as UserSession["role"],
        organizationId: user.organization_id,
        laboratoryId: user.laboratory_id,
        laboratoryName: user.laboratory_name,
      };
    }
  }

  if (!session) {
    return NextResponse.json({ message: "Credenciales inválidas." }, { status: 401 });
  }

  const token = await createSessionToken(session);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true, session: { name: session.name, laboratoryName: session.laboratoryName } });
}
