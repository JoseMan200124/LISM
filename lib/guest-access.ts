// Accesos de invitado: permisos temporales con código para entrar a un
// laboratorio sin tener cuenta.
//
// Pensado para el curso: el profesor, coordinador o director genera un código,
// elige cuánto dura (por ejemplo, el semestre completo) y qué puede hacer quien
// entre con él. El estudiante abre NexaLab, escribe el código y su nombre, y
// obtiene una sesión limitada al alcance concedido. No se crea una cuenta ni se
// piden datos personales más allá del nombre con el que firma sus consumos.

import type { PermissionKey } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

/**
 * Una sesión abierta con código de invitado. Vive aquí y no en lib/session.ts
 * porque la barra lateral la necesita en el navegador, y ese módulo arrastra
 * dependencias de servidor (cookies, async_hooks) que no pueden viajar al
 * paquete del cliente.
 */
export function isGuestSession(session: Pick<UserSession, "role" | "guest">): boolean {
  return session.role === "GUEST" || Boolean(session.guest);
}

export const GUEST_SCOPES = ["inventory.view", "equipment.view", "inventory.consume", "education.view"] as const;

export type GuestScope = (typeof GUEST_SCOPES)[number];

export const GUEST_SCOPE_LABEL: Record<GuestScope, string> = {
  "inventory.view": "Ver el inventario y los reactivos",
  "equipment.view": "Ver los equipos del laboratorio",
  "inventory.consume": "Registrar consumos de inventario",
  "education.view": "Ver el programa de prácticas y los avisos",
};

export const GUEST_SCOPE_HINT: Record<GuestScope, string> = {
  "inventory.view": "Consulta de existencias, ubicación, vencimiento y ficha de seguridad. Sin precios ni proveedores.",
  "equipment.view": "Consulta de equipos, estado y ubicación. No permite editarlos ni reservarlos.",
  "inventory.consume": "Permite descontar lo que se usó en la práctica. No permite crear, editar ni eliminar artículos.",
  "education.view": "Consulta del cronograma, las instrucciones previas y los avisos del curso.",
};

// El alcance del invitado se traduce a los mismos permisos que usa el resto de
// la aplicación, de modo que cada ruta y cada módulo lo respetan sin lógica
// aparte. "inventory.consume" concede inventory.move, pero la ruta de
// movimientos restringe al invitado al tipo CONSUMPTION.
const SCOPE_PERMISSIONS: Record<GuestScope, PermissionKey[]> = {
  "inventory.view": ["inventory.view"],
  "equipment.view": ["equipment.view"],
  "inventory.consume": ["inventory.view", "inventory.move"],
  "education.view": ["education.view"],
};

export const DEFAULT_GUEST_SCOPES: GuestScope[] = ["inventory.view", "equipment.view"];

export function isGuestScope(value: unknown): value is GuestScope {
  return typeof value === "string" && (GUEST_SCOPES as readonly string[]).includes(value);
}

export function normalizeGuestScopes(value: unknown): GuestScope[] {
  const list = Array.isArray(value) ? value : [];
  const seen = new Set<GuestScope>();
  for (const entry of list) if (isGuestScope(entry)) seen.add(entry);
  // Registrar consumos no tiene sentido sin poder ver el inventario.
  if (seen.has("inventory.consume")) seen.add("inventory.view");
  return GUEST_SCOPES.filter((scope) => seen.has(scope));
}

export function guestPermissions(scopes: readonly GuestScope[]): PermissionKey[] {
  const permissions = new Set<PermissionKey>();
  for (const scope of normalizeGuestScopes([...scopes])) {
    for (const permission of SCOPE_PERMISSIONS[scope]) permissions.add(permission);
  }
  return [...permissions];
}

// Duraciones ofrecidas al emitir el código. Un semestre es el caso habitual.
export const GUEST_DURATIONS = [
  { days: 1, label: "1 día" },
  { days: 7, label: "1 semana" },
  { days: 30, label: "1 mes" },
  { days: 120, label: "4 meses" },
  { days: 180, label: "6 meses (semestre)" },
  { days: 365, label: "1 año" },
] as const;

export const DEFAULT_GUEST_DURATION_DAYS = 180;
export const MAX_GUEST_DURATION_DAYS = 400;

// Alfabeto sin caracteres que se confunden al dictar o copiar de la pizarra
// (0/O, 1/I/L). El código se lee en voz alta en clase, así que importa.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateGuestCode(randomBytes: Uint8Array = crypto.getRandomValues(new Uint8Array(8))): string {
  const characters = [...randomBytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]);
  return `NXL-${characters.slice(0, 4).join("")}-${characters.slice(4, 8).join("")}`;
}

/** Acepta el código con o sin guiones y en cualquier caja. */
export function normalizeGuestCode(value: string): string {
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("NXL") ? clean.slice(3) : clean;
  if (body.length !== 8) return "";
  return `NXL-${body.slice(0, 4)}-${body.slice(4, 8)}`;
}

export type GuestGrantState = {
  status: string;
  expires_at: string | Date;
  max_uses?: number | null;
  uses_count?: number | null;
};

export type GuestGrantCheck = { usable: true } | { usable: false; reason: string };

export function checkGuestGrant(grant: GuestGrantState, now: Date = new Date()): GuestGrantCheck {
  if (grant.status !== "ACTIVE") return { usable: false, reason: "Este código fue revocado por quien lo emitió." };
  const expiresAt = grant.expires_at instanceof Date ? grant.expires_at : new Date(grant.expires_at);
  if (!Number.isFinite(expiresAt.getTime())) return { usable: false, reason: "Este código no tiene una vigencia válida." };
  if (expiresAt.getTime() <= now.getTime()) return { usable: false, reason: "Este código ya venció. Pide uno nuevo a tu profesor." };
  const maxUses = grant.max_uses ?? null;
  if (maxUses !== null && (grant.uses_count ?? 0) >= maxUses) {
    return { usable: false, reason: "Este código alcanzó el número máximo de accesos permitidos." };
  }
  return { usable: true };
}

/** Duración de la sesión del invitado: nunca más allá de la vigencia del código. */
export function guestSessionSeconds(expiresAt: Date, maximumSeconds: number, now: Date = new Date()): number {
  const remaining = Math.floor((expiresAt.getTime() - now.getTime()) / 1000);
  return Math.max(60, Math.min(maximumSeconds, remaining));
}
