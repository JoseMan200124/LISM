import { compare } from "bcryptjs";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { computeContentHash, resolveSignaturePolicy, type SignatureMeaning, type SignaturePolicy } from "@/lib/signatures";
import type { UserSession } from "@/lib/session";

// Servicio de firma electrónica del lado del servidor.
//
// El registro se firma en el mismo momento en que se crea o se aprueba, con el
// identificador ya asignado: por eso la firma se resuelve aquí y no en dos
// llamadas separadas desde el navegador. La contraseña nunca se guarda; solo
// sirve para confirmar la identidad de quien firma (reautenticación).

export type SignatureResult =
  | { ok: true; signatureId: string | null }
  | { ok: false; status: number; message: string };

/** Política de firma vigente en el laboratorio. */
export async function loadSignaturePolicy(laboratoryId: string): Promise<SignaturePolicy> {
  if (!hasDatabase()) return resolveSignaturePolicy(null);
  try {
    const sql = getSql();
    const rows = await sql`SELECT signature_policy FROM laboratory_settings WHERE laboratory_id = ${laboratoryId} LIMIT 1`;
    return resolveSignaturePolicy(rows[0]?.signature_policy);
  } catch {
    // La columna llega con la migración 0022: hasta entonces aplican los valores
    // por defecto y la firma se comporta como opcional si no viene contraseña.
    return resolveSignaturePolicy(null);
  }
}

/** Confirma que quien firma es realmente el titular de la sesión. */
export async function confirmIdentity(session: UserSession, password: string): Promise<boolean> {
  if (!password) return false;
  if (!hasDatabase() || session.sessionMode === "demo") return password === "Demo1234!";
  const sql = getSql();
  const rows = await sql`SELECT password_hash FROM users WHERE id = ${session.userId} AND status = 'ACTIVE' LIMIT 1`;
  const hash = rows[0]?.password_hash as string | undefined;
  return hash ? compare(password, hash) : false;
}

/**
 * Firma un registro. Devuelve el id de la firma para guardarlo junto al
 * registro firmado (purchase_requests.request_signature_id, etc.).
 */
export async function signRecord(
  session: UserSession,
  input: {
    password: string;
    entityType: string;
    entityId: string;
    meaning: SignatureMeaning;
    content: unknown;
    request?: Request;
  },
): Promise<SignatureResult> {
  // Un invitado no tiene identidad reautenticable: no puede firmar nada.
  if (session.guest) return { ok: false, status: 403, message: "Un acceso de invitado no puede firmar registros." };
  if (!(await confirmIdentity(session, input.password))) {
    return { ok: false, status: 401, message: "No se pudo confirmar tu identidad. Revisa tu contraseña." };
  }
  if (!hasDatabase() || session.sessionMode === "demo") return { ok: true, signatureId: null };

  const contentHash = await computeContentHash(input.content);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO electronic_signatures (laboratory_id, actor_user_id, entity_type, entity_id, meaning, content_hash, authentication_method)
    VALUES (${session.laboratoryId}, ${session.userId}, ${input.entityType}, ${input.entityId}, ${input.meaning}, ${contentHash}, 'PASSWORD_REAUTH')
    RETURNING id
  `;
  await writeAuditEvent(session, {
    action: "ELECTRONIC_SIGNATURE_CREATED",
    entityType: input.entityType,
    entityId: input.entityId,
    newValue: { signatureId: rows[0].id, meaning: input.meaning, contentHash },
    reason: `Firma electrónica: ${input.meaning}`,
    request: input.request,
  });
  return { ok: true, signatureId: String(rows[0].id) };
}

export type SignatureRecord = {
  id: string;
  meaning: string;
  signed_at: string;
  content_hash: string;
  signer_name: string | null;
  signer_display_name: string | null;
  signer_credentials: string | null;
  signature_image: string | null;
};

/** Firmas de un registro, con la rúbrica de cada firmante para mostrarlas. */
export async function loadSignatures(laboratoryId: string, entityType: string, entityIds: readonly string[]): Promise<Map<string, SignatureRecord[]>> {
  const result = new Map<string, SignatureRecord[]>();
  if (!hasDatabase() || !entityIds.length) return result;
  const sql = getSql();
  const rows = await sql`
    SELECT s.id, s.entity_id, s.meaning, s.signed_at, s.content_hash,
           u.full_name AS signer_name,
           p.display_name AS signer_display_name, p.credentials AS signer_credentials, p.signature_image
    FROM electronic_signatures s
    LEFT JOIN users u ON u.id = s.actor_user_id
    LEFT JOIN user_signature_profiles p ON p.user_id = s.actor_user_id
    WHERE s.laboratory_id = ${laboratoryId} AND s.entity_type = ${entityType} AND s.entity_id = ANY(${[...entityIds]})
    ORDER BY s.signed_at ASC
  `;
  for (const row of rows as unknown as Array<SignatureRecord & { entity_id: string }>) {
    const list = result.get(row.entity_id) ?? [];
    list.push(row);
    result.set(row.entity_id, list);
  }
  return result;
}
