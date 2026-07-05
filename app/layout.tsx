import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JsonLd } from "@/components/structured-data";
import { VersionWatcher } from "@/components/version-watcher";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalab.com";
const siteName = "NexaLab";
const siteDescription =
  "NexaLab organiza muestras, resultados, inventario y control de calidad en una experiencia clara para laboratorios clínicos, universitarios y de investigación.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "NexaLab LIS | Operación clara y trazable",
    template: "%s | NexaLab LIS",
  },
  description: siteDescription,
  keywords: [
    "laboratory information system",
    "LIS",
    "LIMS",
    "gestión de laboratorio",
    "software para laboratorio educativo",
    "trazabilidad de muestras",
    "inventario de laboratorio",
    "control de calidad",
    "sistema para laboratorio universitario",
  ],
  applicationName: siteName,
  authors: [{ name: siteName, url: siteUrl }],
  category: "education",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: "NexaLab LIS | Operación clara y trazable",
    description: siteDescription,
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: "NexaLab LIS | Operación clara y trazable",
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#1d6b64",
  width: "device-width",
  initialScale: 1,
};

// El layout raíz debe leer `APP_VERSION` en cada request (no una sola vez al
// prerenderizar): el Dockerfile solo fija esa env var en la etapa `runner`,
// después del `npm run build`, así que un render estático horneaba siempre
// el valor de fallback "dev" en el HTML, mientras `/api/version` (también
// force-dynamic) sí reportaba la versión real desplegada — el desfase hacía
// que VersionWatcher viera una actualización disponible permanentemente,
// incluso justo después de recargar.
export const dynamic = "force-dynamic";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteName,
  url: siteUrl,
  logo: `${siteUrl}/branding/nexalab-mark.png`,
  description: siteDescription,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const appVersion = process.env.APP_VERSION ?? "dev";

  return (
    <html lang="es">
      <body>
        <JsonLd data={organizationJsonLd} />
        {children}
        <VersionWatcher initialVersion={appVersion} />
      </body>
    </html>
  );
}
