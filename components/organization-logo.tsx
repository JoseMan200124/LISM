"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

const LOGO_URL = "/api/organization/logo";

export function useOrganizationLogoStatus(cacheBust = 0) {
  const [status, setStatus] = useState<"checking" | "ok" | "failed">("checking");
  const src = `${LOGO_URL}${cacheBust ? `?v=${cacheBust}` : ""}`;

  useEffect(() => {
    let cancelled = false;
    setStatus("checking");
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setStatus("ok"); };
    probe.onerror = () => { if (!cancelled) setStatus("failed"); };
    probe.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return { status, src };
}

type OrganizationLogoProps = Readonly<{
  className?: string;
  subtitle?: string;
  compact?: boolean;
  priority?: boolean;
}>;

/**
 * Sustituto de BrandLogo que muestra el logo institucional subido por el
 * laboratorio (si existe) en vez del wordmark de NexaLab. Cae de vuelta a
 * BrandLogo mientras se resuelve el probe y cuando no hay logo (404).
 */
export function OrganizationLogo({ className = "", subtitle, compact = false, priority = false }: OrganizationLogoProps) {
  const { status, src } = useOrganizationLogoStatus();

  if (status !== "ok") {
    return <BrandLogo className={className} subtitle={subtitle} compact={compact} priority={priority} />;
  }

  return (
    <span className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${className}`.trim()}>
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen autenticada de tamaño variable, next/image requiere dimensiones fijas que no aplican a un logo institucional arbitrario */}
      <img src={src} alt="Logo institucional" className="brand-wordmark" />
      {subtitle ? <span className="brand-subtitle">{subtitle}</span> : null}
    </span>
  );
}
