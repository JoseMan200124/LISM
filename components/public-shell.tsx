import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LandingMobileMenu } from "@/components/landing-mobile-menu";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { DeveloperCredit } from "@/components/developer-credit";
import { CONTACT_EMAIL } from "@/lib/contact";
import { SECTORS } from "@/lib/seo-sectors";

// Cabecera y pie de las páginas públicas que no son la portada (soluciones por
// sector, guías). Repiten el marcado y las clases de `landing-page.tsx` para que
// se vean iguales, pero con enlaces absolutos: desde /soluciones/x, «#precios»
// no lleva a ningún sitio.
const navLinks = [
  { href: "/#soluciones", label: "Soluciones" },
  { href: "/#capacidades", label: "Capacidades" },
  { href: "/#precios", label: "Precios" },
  { href: "/guia/que-es-un-lims", label: "Guía" },
  { href: "/#faq", label: "FAQ" },
];

export function PublicHeader() {
  return (
    <header className="landing-header">
      <div className="landing-container landing-header-inner">
        <Link href="/" className="landing-brand" aria-label="Ir al inicio de NexaLab">
          <BrandLogo compact priority />
        </Link>
        <nav className="landing-nav" aria-label="Navegación principal">
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="landing-header-actions">
          <PublicThemeToggle />
          <Link className="landing-login-link" href="/login">
            Ingresar
          </Link>
          <Link className="landing-button landing-button-small" href="/#contacto">
            Solicitar demostración
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <LandingMobileMenu links={navLinks} />
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container landing-footer-grid">
        <div className="landing-footer-brand">
          <BrandLogo compact />
          <p>Sistema integral de gestión de laboratorio. Operación clara y trazable.</p>
          <DeveloperCredit />
        </div>
        <nav aria-label="Soluciones">
          <h2>Soluciones</h2>
          {SECTORS.map((sector) => (
            <Link key={sector.slug} href={`/soluciones/${sector.slug}`}>
              {sector.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Producto">
          <h2>Producto</h2>
          <Link href="/#capacidades">Capacidades</Link>
          <Link href="/#precios">Precios</Link>
          <Link href="/guia/que-es-un-lims">Qué es un LIMS</Link>
          <Link href="/docs/api">Documentación de la API</Link>
        </nav>
        <nav aria-label="Acceso">
          <h2>Acceso</h2>
          <Link href="/login">Ingresar</Link>
          <Link href="/registro">Crear cuenta</Link>
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        </nav>
      </div>
      <div className="landing-container landing-footer-legal">
        <p>© {new Date().getFullYear()} NexaLab. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
