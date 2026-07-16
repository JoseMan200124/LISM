import crypto from "node:crypto";
import { getSql } from "@/lib/db";
import type { UserSession } from "@/lib/session";

// Puente servicio-a-servicio entre el asistente Dilo (WhatsApp) y NexaLab.
//
// Seguridad en dos capas, ambas obligatorias:
//   1) Firma HMAC del cuerpo con DILO_NEXALAB_SERVICE_SECRET (protocolo Dilo:
//      HMAC-SHA256 de `${timestamp}.${rawBody}`, header `x-dilo-signature: v1=<hex>`,
//      tolerancia ±300s). Sin firma válida y reciente, la petición se rechaza
//      antes de tocar datos.
//   2) El teléfono que llega en el cuerpo debe tener una fila dilo_links LINKED.
//      Un número no vinculado NO obtiene ningún dato.
//
// Además, cada consulta se ejecuta con una UserSession sintetizada desde la
// MEMBRESÍA real del usuario en el laboratorio pedido (misma consulta que el
// login) y pasa por hasPermission() — el puente nunca reimplementa la
// autorización ni amplía lo que el usuario ya puede ver en la web.

const SIGNATURE_TOLERANCE_SECONDS = 300;

export const DILO_SIGNATURE_HEADER = "x-dilo-signature";
export const DILO_TIMESTAMP_HEADER = "x-dilo-timestamp";

function getServiceSecret(): string | null {
  const secret = process.env.DILO_NEXALAB_SERVICE_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export function isDiloBridgeConfigured(): boolean {
  return Boolean(getServiceSecret());
}

/** Deja solo dígitos: evita que "+502 4211-0769" y "50242110769" se traten como distintos. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  return digits.length >= 8 ? digits : null;
}

export function hashLinkCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

/** Código legible de un solo uso: 8 chars sin caracteres ambiguos (0/O, 1/I). */
export function generateLinkCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i += 1) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

/**
 * Verifica firma HMAC + frescura del timestamp sobre el body CRUDO.
 * timingSafeEqual para no filtrar por tiempo si la firma es casi correcta.
 */
export function verifyDiloSignature(args: {
  timestamp: string | null;
  rawBody: string;
  signatureHeader: string | null;
}): boolean {
  const secret = getServiceSecret();
  if (!secret) return false;
  const ts = Number(args.timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) return false;

  const match = /^v1=([0-9a-f]{64})$/.exec(String(args.signatureHeader ?? "").trim());
  if (!match) return false;

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(`${args.timestamp}.${args.rawBody}`)
    .digest("hex");
  const expected = Buffer.from(expectedHex, "hex");
  const received = Buffer.from(match[1], "hex");
  if (expected.length !== received.length) return false;
  return crypto.timingSafeEqual(expected, received);
}

export type DiloLinkedUser = {
  userId: string;
  name: string;
  email: string;
  phone: string;
};

/** Resuelve el teléfono a un usuario de NexaLab SOLO si el vínculo está LINKED. */
export async function resolveLinkedUser(rawPhone: string | null | undefined): Promise<DiloLinkedUser | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const sql = getSql();
  const rows = await sql`
    SELECT u.id AS user_id, u.full_name, u.email
    FROM dilo_links dl
    JOIN users u ON u.id = dl.user_id AND u.status = 'ACTIVE'
    WHERE dl.phone_digits = ${phone} AND dl.status = 'LINKED'
    LIMIT 1
  `;
  const row = rows[0] as { user_id: string; full_name: string; email: string } | undefined;
  if (!row) return null;
  // Marca de uso (best-effort, no bloquea la respuesta).
  sql`UPDATE dilo_links SET last_used_at = now(), updated_at = now() WHERE user_id = ${row.user_id}`.catch(() => {});
  return { userId: row.user_id, name: row.full_name, email: row.email, phone };
}

export type UserLaboratory = {
  laboratoryId: string;
  laboratoryName: string;
  organizationId: string;
  role: UserSession["role"];
  profileCode: string;
};

/**
 * Laboratorios donde el usuario tiene membresía ACTIVA, con el mismo cálculo de
 * profile_code que hace el login (laboratory_settings > plan educativo > PHARMA_QC).
 */
export async function listUserLaboratories(userId: string): Promise<UserLaboratory[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      m.role,
      o.id AS organization_id,
      l.id AS laboratory_id,
      l.name AS laboratory_name,
      COALESCE(ls.profile_code, CASE WHEN bp.slug = 'academic_starter' OR o.plan_code = 'EDUCATIONAL' THEN 'EDUCATIONAL_SMALL_LAB' ELSE 'PHARMA_QC' END) AS profile_code
    FROM memberships m
    JOIN organizations o ON o.id = m.organization_id AND o.status = 'ACTIVE'
    JOIN laboratories  l ON l.id = m.laboratory_id   AND l.status = 'ACTIVE'
    LEFT JOIN laboratory_settings ls ON ls.laboratory_id = l.id
    LEFT JOIN billing_subscriptions bs ON bs.organization_id = o.id AND bs.status IN ('active','trialing','cancel_scheduled','payment_failed')
    LEFT JOIN billing_plans bp ON bp.id = bs.plan_id
    WHERE m.user_id = ${userId} AND m.status = 'ACTIVE'
    ORDER BY m.created_at ASC
  `;
  return (rows as Array<Record<string, string>>).map((row) => ({
    laboratoryId: row.laboratory_id,
    laboratoryName: row.laboratory_name,
    organizationId: row.organization_id,
    role: row.role as UserSession["role"],
    profileCode: row.profile_code,
  }));
}

function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Resuelve el nombre de laboratorio que dio el usuario a uno donde REALMENTE es
 * miembro. Coincidencia difusa pero acotada a sus laboratorios: jamás puede
 * apuntar a un laboratorio ajeno. Sin nombre: si solo tiene uno, ese.
 */
export function resolveLaboratory(
  laboratories: UserLaboratory[],
  query: string | null | undefined,
):
  | { status: "ok"; laboratory: UserLaboratory }
  | { status: "none"; laboratories: UserLaboratory[] }
  | { status: "ambiguous"; matches: UserLaboratory[]; laboratories: UserLaboratory[] } {
  const q = foldText(String(query ?? ""));
  if (!q) {
    if (laboratories.length === 1) return { status: "ok", laboratory: laboratories[0] };
    return { status: "none", laboratories };
  }
  const exact = laboratories.filter((l) => foldText(l.laboratoryName) === q);
  if (exact.length === 1) return { status: "ok", laboratory: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", matches: exact, laboratories };
  const partial = laboratories.filter((l) => {
    const name = foldText(l.laboratoryName);
    return name.includes(q) || q.includes(name);
  });
  if (partial.length === 1) return { status: "ok", laboratory: partial[0] };
  if (partial.length > 1) return { status: "ambiguous", matches: partial, laboratories };
  return { status: "none", laboratories };
}

/**
 * Sintetiza la UserSession del puente para un laboratorio concreto: mismos campos
 * que produce el login, para que hasPermission() y las consultas por
 * laboratory_id funcionen exactamente igual que en la web.
 */
export function buildBridgeSession(user: DiloLinkedUser, laboratory: UserLaboratory): UserSession {
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    role: laboratory.role,
    organizationId: laboratory.organizationId,
    laboratoryId: laboratory.laboratoryId,
    laboratoryName: laboratory.laboratoryName,
    profileCode: laboratory.profileCode,
    sessionMode: "database",
  };
}
