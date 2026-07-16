import { ExternalLink } from "lucide-react";

export const HARICODE_URL = "https://www.haricode.tech/";

export function DeveloperCredit({
  variant = "default",
  className = "",
}: Readonly<{
  variant?: "default" | "compact";
  className?: string;
}>) {
  const compact = variant === "compact";

  return (
    <p className={`developer-credit developer-credit-${variant} ${className}`.trim()}>
      <span>{compact ? "Desarrollado por" : "Diseñado y desarrollado por"}</span>
      <a
        href={HARICODE_URL}
        target="_blank"
        rel="noopener"
        aria-label="Visitar Haricode, expertos en UI/UX y desarrollo de software (abre en una pestaña nueva)"
      >
        <span className="developer-credit-brand">Haricode</span>
        {compact ? null : <small>Software &amp; UI/UX</small>}
        <ExternalLink size={12} aria-hidden="true" />
      </a>
    </p>
  );
}
