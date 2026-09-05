import type { MetadataRoute } from "next";

// Ver app/sitemap.ts: prerenderizado, esto anunciaba el sitemap en un dominio
// equivocado y ningún buscador llegaba a leerlo.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com";

// La aplicación y la API no se indexan: ahí hay datos de laboratorios reales.
const PRIVADO = ["/app", "/api", "/qr"];

// Rastreadores de buscadores y asistentes con inteligencia artificial. El comodín
// de arriba ya los cubriría, pero se listan uno a uno por dos motivos: algunos
// buscan su propia regla antes que la general, y dejarlo explícito evita que un
// cambio futuro en la regla comodín los bloquee sin que nadie se dé cuenta.
// Cuando alguien le pregunta a un asistente por un LIMS, la respuesta sale de lo
// que estos hayan podido leer.
const ASISTENTES_IA = [
  "Google-Extended",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot-Extended",
  "meta-externalagent",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVADO },
      { userAgent: ASISTENTES_IA, allow: "/", disallow: PRIVADO },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
