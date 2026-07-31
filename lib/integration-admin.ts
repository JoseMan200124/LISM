// Reglas de administración de la capa de integración, fuera de las rutas para
// poder probarlas sin levantar HTTP.

/**
 * Un destino de webhook lo configura un administrador del laboratorio, pero eso
 * no basta para confiar en la URL: el servidor de NexaLab es quien va a hacer
 * la petición, así que una dirección interna convertiría el webhook en una
 * puerta para leer recursos de la red privada o el endpoint de metadatos de la
 * nube (el clásico 169.254.169.254, que devuelve credenciales de la instancia).
 * Eso es SSRF, y se ataja aquí.
 *
 * Límite conocido y aceptado: se valida el nombre del host, no la IP a la que
 * resuelve. Un dominio público que apunte a una dirección privada pasaría el
 * filtro. Cerrarlo del todo exige resolver DNS y volver a comprobar en el
 * momento de conectar; para el modelo de amenaza actual —donde quien configura
 * ya es administrador del laboratorio— el filtro por host cubre el error
 * honesto y el abuso evidente.
 */
export function validateWebhookTarget(rawUrl: string): { ok: true; url: string } | { ok: false; message: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, message: "La dirección del webhook no es una URL válida." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, message: "El destino debe usar HTTPS: los eventos pueden contener datos del laboratorio." };
  }

  const host = parsed.hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host === "::1") {
    return { ok: false, message: "No se admiten direcciones locales." };
  }

  // Metadatos de instancia en Azure, AWS y GCP.
  if (host === "169.254.169.254" || host === "metadata.google.internal" || host.endsWith(".internal")) {
    return { ok: false, message: "No se admiten direcciones internas de la infraestructura." };
  }

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    const isPrivate =
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254);
    if (isPrivate) {
      return { ok: false, message: "No se admiten direcciones IP privadas ni de enlace local." };
    }
  }

  return { ok: true, url: parsed.toString() };
}

/** Deja las cabeceras extra en algo enviable y sin colisionar con las nuestras. */
export function sanitizeCustomHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const reserved = new Set([
    "content-type", "content-length", "host", "user-agent",
    "x-nexalab-signature", "x-nexalab-timestamp", "x-nexalab-event", "x-nexalab-delivery",
  ]);
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const name = key.trim().toLowerCase();
    // Las de firma las pone NexaLab: dejar que se sobrescriban permitiría
    // configurar un webhook cuya firma no significa nada.
    if (!name || reserved.has(name)) continue;
    if (!/^[a-z0-9-]+$/.test(name)) continue;
    if (typeof value !== "string" || value.length > 500) continue;
    headers[name] = value;
  }
  return headers;
}
