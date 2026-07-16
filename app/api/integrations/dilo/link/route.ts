import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession } from "@/lib/session";
import { generateLinkCode, hashLinkCode, isDiloBridgeConfigured } from "@/lib/dilo-bridge";

// Gestión del vínculo WhatsApp↔NexaLab para el USUARIO logueado. Cualquier
// usuario puede vincular su propio WhatsApp; no requiere permiso especial.
// El código en claro solo se devuelve UNA vez (POST) y se guarda hasheado.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_TTL_MINUTES = 15;

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  return phone.length <= 4 ? "••••" : `••••${phone.slice(-4)}`;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  const configured = isDiloBridgeConfigured() && hasDatabase() && session.sessionMode !== "demo";
  if (!configured) return NextResponse.json({ data: { configured: false, status: "NONE", phone: null, codePending: false } });

  const sql = getSql();
  const rows = await sql`
    SELECT status, phone_digits, linked_at, link_code_hash, link_code_expires_at
    FROM dilo_links WHERE user_id = ${session.userId} LIMIT 1
  `;
  const link = rows[0] as { status: string; phone_digits: string | null; linked_at: string | null; link_code_hash: string | null; link_code_expires_at: string | Date | null } | undefined;
  const codePending = Boolean(link?.link_code_hash && link?.link_code_expires_at && new Date(link.link_code_expires_at).getTime() > Date.now());
  return NextResponse.json({
    data: {
      configured: true,
      status: link?.status ?? "NONE",
      phone: link?.status === "LINKED" ? maskPhone(link.phone_digits) : null,
      linkedAt: link?.linked_at ?? null,
      codePending,
    },
  });
}

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!isDiloBridgeConfigured() || !hasDatabase() || session.sessionMode === "demo") {
    return NextResponse.json({ message: "El puente Dilo no está disponible en este entorno." }, { status: 503 });
  }

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const sql = getSql();

  // Genera código sin desvincular un teléfono ya activo: si el usuario ya está
  // LINKED, el nuevo código sirve para mover el vínculo a otro número al canjearlo.
  await sql`
    INSERT INTO dilo_links (user_id, status, link_code_hash, link_code_expires_at)
    VALUES (${session.userId}, 'PENDING', ${hashLinkCode(code)}, ${expiresAt})
    ON CONFLICT (user_id) DO UPDATE SET
      link_code_hash = EXCLUDED.link_code_hash,
      link_code_expires_at = EXCLUDED.link_code_expires_at,
      status = CASE WHEN dilo_links.status = 'LINKED' THEN 'LINKED' ELSE 'PENDING' END,
      updated_at = now()
  `;

  return NextResponse.json({ data: { code, expiresAt, ttlMinutes: CODE_TTL_MINUTES } });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  if (!hasDatabase() || session.sessionMode === "demo") {
    return NextResponse.json({ message: "El puente Dilo no está disponible en este entorno." }, { status: 503 });
  }
  const sql = getSql();
  await sql`
    UPDATE dilo_links
    SET status = 'REVOKED', phone_digits = NULL, link_code_hash = NULL, link_code_expires_at = NULL, updated_at = now()
    WHERE user_id = ${session.userId}
  `;
  return NextResponse.json({ data: { status: "REVOKED" } });
}
