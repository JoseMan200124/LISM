// Firma electrónica de usuario: significados, política del laboratorio y huella
// del contenido firmado.
//
// El acto de firmar sigue siendo el de la migración 0004: reautenticación con
// contraseña y una fila append-only en electronic_signatures. Este módulo añade
// lo que faltaba para usarlo en el día a día: qué se firma, cuándo es
// obligatorio y cómo se identifica de forma inequívoca el contenido firmado.

export const SIGNATURE_MEANINGS = [
  "REVIEW",
  "APPROVAL",
  "RELEASE",
  "INVESTIGATION_CLOSE",
  "DOCUMENT_APPROVAL",
  "LOGBOOK_CONFIRMATION",
  "REQUEST",
  "AUTHORIZATION",
  "RECORD_ENTRY",
  "PROTOCOL_APPROVAL",
  "SAMPLE_CUSTODY",
] as const;

export type SignatureMeaning = (typeof SIGNATURE_MEANINGS)[number];

export const SIGNATURE_MEANING_LABEL: Record<SignatureMeaning, string> = {
  REVIEW: "Revisión",
  APPROVAL: "Aprobación",
  RELEASE: "Liberación",
  INVESTIGATION_CLOSE: "Cierre de investigación",
  DOCUMENT_APPROVAL: "Aprobación de documento",
  LOGBOOK_CONFIRMATION: "Confirmación de bitácora",
  REQUEST: "Solicitud",
  AUTHORIZATION: "Autorización",
  RECORD_ENTRY: "Registro de experimento",
  PROTOCOL_APPROVAL: "Aprobación de protocolo",
  SAMPLE_CUSTODY: "Cadena de custodia",
};

// Actos que el laboratorio puede exigir firmados. La política se guarda en
// laboratory_settings.signature_policy y por omisión todo va firmado: es lo que
// sustituye a la hoja de papel que hoy se firma a mano.
export const SIGNATURE_POLICY_KEYS = [
  "purchaseRequest",
  "purchaseApproval",
  "controlledRequest",
  "controlledApproval",
] as const;

export type SignaturePolicyKey = (typeof SIGNATURE_POLICY_KEYS)[number];
export type SignaturePolicy = Record<SignaturePolicyKey, boolean>;

export const DEFAULT_SIGNATURE_POLICY: SignaturePolicy = {
  purchaseRequest: true,
  purchaseApproval: true,
  controlledRequest: true,
  controlledApproval: true,
};

export const SIGNATURE_POLICY_LABEL: Record<SignaturePolicyKey, string> = {
  purchaseRequest: "Firmar al crear una solicitud de compra",
  purchaseApproval: "Firmar al autorizar una solicitud de compra",
  controlledRequest: "Firmar al solicitar el uso de un reactivo controlado",
  controlledApproval: "Firmar al autorizar el uso de un reactivo controlado",
};

export function resolveSignaturePolicy(raw: unknown): SignaturePolicy {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const policy = { ...DEFAULT_SIGNATURE_POLICY };
  for (const key of SIGNATURE_POLICY_KEYS) {
    if (typeof source[key] === "boolean") policy[key] = source[key] as boolean;
  }
  return policy;
}

/**
 * Huella del contenido firmado. Vincula la firma con los datos exactos que se
 * tenían a la vista: si el registro cambia después, el hash deja de coincidir y
 * la firma ya no ampara la versión nueva.
 *
 * Las claves se ordenan para que el mismo contenido produzca siempre la misma
 * huella independientemente del orden en que se construyó el objeto.
 */
export async function computeContentHash(content: unknown): Promise<string> {
  const canonical = JSON.stringify(content, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
  const bytes = new TextEncoder().encode(canonical ?? "");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Nombre visible de la firma: rúbrica registrada o, si no hay, el nombre de la persona. */
export function signatureDisplayName(profile: { display_name?: string | null } | null, fallback: string): string {
  const name = profile?.display_name?.trim();
  return name || fallback;
}
