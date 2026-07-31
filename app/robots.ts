import type { MetadataRoute } from "next";

// Ver app/sitemap.ts: prerenderizado, esto anunciaba el sitemap en un dominio
// equivocado y ningún buscador llegaba a leerlo.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api", "/qr"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
