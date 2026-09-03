import type { Metadata, Viewport } from "next";
import "./globals.css";
import { JsonLd } from "@/components/structured-data";
import { VersionWatcher } from "@/components/version-watcher";
import { GoogleAnalytics } from "@/components/google-analytics";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com";
const siteName = "NexaLab";
const siteDescription =
  "NexaLab gestiona muestras, inventario, equipos, alertas y cumplimiento en una sola plataforma web, para laboratorios de investigación, educativos, clínicos, industriales y farmacéuticos. Primer mes gratis.";
const siteTitle = "NexaLab | Sistema integral de gestión de laboratorio";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: "%s | NexaLab",
  },
  description: siteDescription,
  keywords: [
    "sistema de gestión de laboratorio",
    "LIMS",
    "LIS",
    "laboratory information system",
    "software para laboratorio",
    "inventario de reactivos",
    "control de equipos de laboratorio",
    "trazabilidad de muestras",
    "reactivos controlados",
    "control de calidad",
    "software para laboratorio educativo",
    "sistema para laboratorio universitario",
    "laboratorio clínico",
    "laboratorio farmacéutico",
  ],
  applicationName: siteName,
  authors: [{ name: siteName, url: siteUrl }],
  category: "technology",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName,
    title: siteTitle,
    description: siteDescription,
    locale: "es_ES",
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
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
  // Igual que APP_VERSION: se lee por petición porque solo existe en la etapa
  // runner. Sin la variable no se carga nada de Google.
  const analyticsId = /^G-[A-Z0-9]+$/.test(process.env.GOOGLE_ANALYTICS_ID ?? "") ? process.env.GOOGLE_ANALYTICS_ID : undefined;

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('nexalab.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=t}catch(e){document.documentElement.dataset.theme='light'}})();` }} />
      </head>
      <body>
        <JsonLd data={organizationJsonLd} />
        {children}
        <VersionWatcher initialVersion={appVersion} />
        {analyticsId ? <GoogleAnalytics measurementId={analyticsId} /> : null}
      </body>
    </html>
  );
}
