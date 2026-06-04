import Image from "next/image";

type BrandLogoProps = Readonly<{
  className?: string;
  subtitle?: string;
  compact?: boolean;
  priority?: boolean;
}>;

export function BrandLogo({ className = "", subtitle, compact = false, priority = false }: BrandLogoProps) {
  return (
    <span className={`brand-lockup ${compact ? "brand-lockup-compact" : ""} ${className}`.trim()}>
      <Image
        className="brand-wordmark"
        src="/branding/nexalab-logo-horizontal.png"
        alt="NexaLab"
        width={786}
        height={220}
        priority={priority}
      />
      {subtitle ? <span className="brand-subtitle">{subtitle}</span> : null}
    </span>
  );
}
