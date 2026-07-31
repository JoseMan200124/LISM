import type { MetadataRoute } from "next";

// Igual que el layout raíz y por el mismo motivo: NEXT_PUBLIC_APP_URL solo
// existe en la etapa `runner` del Dockerfile, después del `npm run build`. Un
// sitemap prerenderizado horneaba el dominio de reserva y le anunciaba a Google
// URLs de un dominio que no es el de la institución, con lo que la
// documentación pública quedaba mal indexada justo donde más importa.
export const dynamic = "force-dynamic";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      // La documentación de la API es una puerta de entrada real: el equipo de
      // sistemas del cliente suele buscarla antes que la página comercial.
      url: `${siteUrl}/docs/api`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
