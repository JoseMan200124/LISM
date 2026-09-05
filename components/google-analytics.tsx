"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Solo se mide la web pública. Dentro de la aplicación (/app, /qr, /p,
// /invitado) no se envía ninguna vista: ahí hay datos de laboratorios reales y
// la analítica comercial no tiene nada que aprender de ellos.
const PRIVATE_PREFIXES = ["/app", "/api", "/qr", "/p/", "/invitado", "/login", "/registro"];

function isPublicPath(pathname: string): boolean {
  return !PRIVATE_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function GoogleAnalytics({ measurementId }: Readonly<{ measurementId: string }>) {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isPublicPath(pathname) || typeof window.gtag !== "function") return;
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: window.location.href,
      page_title: document.title,
    });
  }, [pathname]);

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
gtag('js', new Date());
gtag('config', '${measurementId}', {send_page_view: false});`}
      </Script>
    </>
  );
}
