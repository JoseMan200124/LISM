import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { createSubscriptionCheckout } from "@/lib/billing-checkout";
import { createSessionToken, setSessionCookie, type UserSession } from "@/lib/session";

const registerSchema = z.object({
  organizationName: z.string().trim().min(2).max(180),
  fullName: z.string().trim().min(2).max(180),
  email: z.string().trim().email().max(180),
  password: z.string().min(8).max(200),
  planId: z.string().uuid(),
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

// Registro público de cuentas nuevas: crea organización + laboratorio +
// usuario (rol OWNER) + membresía, inicia sesión de inmediato, y arranca el
// checkout de Recurrente para el plan elegido (misma lógica exacta que ya
// usan las organizaciones existentes, ver lib/billing-checkout.ts). No
// requiere sesión previa — es el único endpoint de la app pensado para
// visitantes anónimos que crean una cuenta.
export async function POST(request: Request) {
  if (!hasDatabase()) {
    return NextResponse.json({ message: "El registro de cuentas no está disponible en este entorno." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Revisa los datos ingresados.", issues: parsed.error.issues }, { status: 400 });
  }

  const { organizationName, fullName, email, password, planId } = parsed.data;
  const normalizedEmail = email.toLowerCase();
  const sql = getSql();

  const existingUser = await sql`SELECT id FROM users WHERE lower(email) = ${normalizedEmail} LIMIT 1`;
  if (existingUser.length > 0) {
    return NextResponse.json({ message: "Ya existe una cuenta con este correo. Inicia sesión en su lugar." }, { status: 409 });
  }

  const slug = `${slugify(organizationName) || "institucion"}-${randomBytes(3).toString("hex")}`;
  const passwordHash = await hash(password, 12);

  const orgRows = await sql`
    INSERT INTO organizations (name, slug, plan_code)
    VALUES (${organizationName}, ${slug}, 'STARTER')
    RETURNING id
  `;
  const organizationId = orgRows[0].id as string;

  const labRows = await sql`
    INSERT INTO laboratories (organization_id, name, code)
    VALUES (${organizationId}, 'Laboratorio Central', 'PRINCIPAL')
    RETURNING id, name
  `;
  const laboratoryId = labRows[0].id as string;
  const laboratoryName = labRows[0].name as string;

  const userRows = await sql`
    INSERT INTO users (full_name, email, password_hash)
    VALUES (${fullName}, ${normalizedEmail}, ${passwordHash})
    RETURNING id
  `;
  const userId = userRows[0].id as string;

  await sql`
    INSERT INTO memberships (organization_id, laboratory_id, user_id, role)
    VALUES (${organizationId}, ${laboratoryId}, ${userId}, 'OWNER')
  `;

  const session: UserSession = {
    userId,
    name: fullName,
    email: normalizedEmail,
    role: "OWNER",
    organizationId,
    laboratoryId,
    laboratoryName,
    sessionMode: "database",
  };

  const token = await createSessionToken(session);
  await setSessionCookie(token);

  await writeAuditEvent(session, {
    action: "ORGANIZATION_REGISTERED",
    entityType: "organization",
    entityId: organizationId,
    newValue: { organizationName, laboratoryId, userId },
    reason: "Registro público de cuenta nueva",
    request,
  });

  const checkout = await createSubscriptionCheckout(session, planId, request);
  if (!checkout.ok) {
    // La cuenta ya quedó creada y con sesión activa aunque el checkout
    // falle — el usuario puede reintentar la suscripción desde
    // /app/billing con el flujo normal, igual que cualquier organización
    // existente cuyo checkout falla.
    return NextResponse.json({ message: checkout.message, data: { accountCreated: true } }, { status: checkout.status });
  }

  return NextResponse.json({ data: { checkoutUrl: checkout.checkoutUrl, accountCreated: true } });
}
