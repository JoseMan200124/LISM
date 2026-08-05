"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";

type MobileMenuLink = { href: string; label: string };

export function LandingMobileMenu({ links }: { links: MobileMenuLink[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    }

    // El panel cubre la pantalla: mientras está abierto, el fondo no debe
    // desplazarse detrás de él.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    panelRef.current?.querySelector("a")?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="landing-menu-button"
        aria-expanded={open}
        aria-controls="landing-mobile-menu"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
      </button>

      {open ? (
        <div className="landing-mobile-menu" id="landing-mobile-menu" ref={panelRef}>
          <nav aria-label="Navegación compacta">
            {links.map(({ href, label }) => (
              <a key={href} href={href} onClick={() => setOpen(false)}>
                {label}
              </a>
            ))}
            <Link href="/login" onClick={() => setOpen(false)}>
              Ingresar
            </Link>
            <a className="landing-button" href="#contacto" onClick={() => setOpen(false)}>
              Solicitar demostración
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </nav>
        </div>
      ) : null}
    </>
  );
}
