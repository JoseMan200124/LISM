"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  Command,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Microscope,
  X,
} from "lucide-react";
import { navigation, educationalNavigationByRole, educationalNavigationFallback } from "@/lib/navigation";
import type { UserSession } from "@/lib/session";
import { NewAccessionModal } from "@/components/new-accession-modal";
import { BrandLogo } from "@/components/brand-logo";
import { roleLabels } from "@/lib/permissions";
import { canAccessModule, hasPermission } from "@/lib/authorization";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { isEducationalProfile } from "@/lib/lab-profile";

type DialogKey = "laboratory" | "help" | "preferences" | null;

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();
}

export function AppShell({ session, children }: Readonly<{ session: UserSession; children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newSpecimenOpen, setNewSpecimenOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [query, setQuery] = useState("");
  const { message, showToast, clearToast } = useToast();

  const isEducational = isEducationalProfile();

  const visibleNavigation = isEducational
    ? (educationalNavigationByRole[session.role] ?? educationalNavigationFallback)
    : navigation
        .map((group) => ({ ...group, items: group.items.filter((item) => canAccessModule(session, item.key)) }))
        .filter((group) => group.items.length > 0);

  const canReceiveSpecimens = !isEducational && hasPermission(session, "specimens.receive");

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) {
      searchRef.current?.focus();
      return;
    }
    const target = isEducational ? `/app/inventory?search=${encodeURIComponent(normalized)}` : `/app/accessioning?search=${encodeURIComponent(normalized)}`;
    router.push(target);
    showToast(`Búsqueda abierta para "${normalized}".`);
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <Link href="/app" className="brand-home-link" aria-label="Ir al inicio de NexaLab">
            <BrandLogo compact subtitle={isEducational ? "Educativo" : "Laboratory OS"} priority />
          </Link>
          <button className="icon-button sidebar-close" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <button className="laboratory-switcher" onClick={() => setDialog("laboratory")}>
          <div className="laboratory-mark" aria-hidden="true"><Microscope /></div>
          <div>
            <span>Laboratorio activo</span>
            <strong>{session.laboratoryName}</strong>
          </div>
          <ChevronDown size={15} />
        </button>

        <nav className="side-navigation" aria-label="Navegación principal">
          {visibleNavigation.map((group) => (
            <section key={group.title} className="nav-group">
              <h2>{group.title}</h2>
              {group.items.map((item) => {
                const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link key={item.key} href={item.href} className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={() => setMobileOpen(false)}>
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{item.label}</span>
                    {item.key === "alerts" ? <em>3</em> : null}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="sidebar-link" onClick={() => setDialog("help")}><CircleHelp size={17} /><span>Centro de ayuda</span></button>
          <button className="sidebar-link" onClick={() => setDialog("preferences")}><Settings size={17} /><span>Preferencias</span></button>
        </div>
      </aside>

      {mobileOpen ? <button className="mobile-backdrop" aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} /> : null}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <form className="global-search" onSubmit={search}>
            <Search size={16} />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isEducational ? "Buscar artículo, práctica o equipo…" : "Buscar muestra, paciente, orden o lote…"} />
            <kbd><Command size={11} /> K</kbd>
          </form>
          <div className="topbar-actions">
            {canReceiveSpecimens ? <button className="primary-button compact-button" onClick={() => setNewSpecimenOpen(true)}><Plus size={16} /> Nueva muestra</button> : null}
            <div className="relative-menu-wrap">
              <button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => setNotificationsOpen((open) => !open)}><Bell size={18} /><span /></button>
              {notificationsOpen ? (
                <div className="compact-popover notification-popover">
                  <strong>Alertas recientes</strong>
                  {isEducational ? (
                    <>
                      <Link href="/app/alerts" onClick={() => setNotificationsOpen(false)}>Reactivo próximo a vencer</Link>
                      <Link href="/app/alerts" onClick={() => setNotificationsOpen(false)}>Equipo con mantenimiento próximo</Link>
                      <Link href="/app/education" onClick={() => setNotificationsOpen(false)}>Reserva pendiente de preparar</Link>
                    </>
                  ) : (
                    <>
                      <Link href="/app/alerts" onClick={() => setNotificationsOpen(false)}>Reactivo próximo a vencer</Link>
                      <Link href="/app/alerts" onClick={() => setNotificationsOpen(false)}>Calibración pendiente</Link>
                      <Link href="/app/alerts" onClick={() => setNotificationsOpen(false)}>Reserva educativa por preparar</Link>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <div className="profile-menu-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}>
                <span className="avatar">{getInitials(session.name)}</span>
                <span className="profile-copy"><strong>{session.name}</strong><small>{roleLabels[session.role]}</small></span>
                <ChevronDown size={14} />
              </button>
              {profileOpen ? (
                <div className="profile-dropdown">
                  <p><strong>{session.name}</strong><span>{session.email}</span></p>
                  <button onClick={logout}><LogOut size={15} /> Cerrar sesión</button>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
      {canReceiveSpecimens ? <NewAccessionModal open={newSpecimenOpen} onClose={() => setNewSpecimenOpen(false)} /> : null}
      <ActionModal open={dialog === "laboratory"} title="Laboratorio activo" description="La versión inicial mantiene una sede activa por sesión. El selector ya está preparado para habilitar sedes adicionales." onClose={() => setDialog(null)}>
        <div className="modal-form"><div className="details-grid"><div><small>Sede actual</small><strong>{session.laboratoryName}</strong></div><div><small>Perfil</small><strong>{roleLabels[session.role]}</strong></div></div><footer className="modal-actions"><button className="primary-button" onClick={() => setDialog(null)}>Continuar en esta sede</button></footer></div>
      </ActionModal>
      <ActionModal open={dialog === "help"} title="Centro de ayuda" description="Accesos rápidos para resolver dudas operativas." onClose={() => setDialog(null)}>
        <div className="modal-form"><p>Consulta el flujo correspondiente desde cada módulo. Para soporte interno, registra una incidencia desde Alertas e incluye el módulo, el registro y la acción realizada.</p><footer className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Cerrar</button><button className="primary-button" onClick={() => { setDialog(null); router.push("/app/alerts"); }}>Abrir alertas</button></footer></div>
      </ActionModal>
      <ActionModal open={dialog === "preferences"} title="Preferencias" description="Estas preferencias se guardan únicamente en este navegador." onClose={() => setDialog(null)}>
        <div className="modal-form"><label className="check-line"><input type="checkbox" defaultChecked /> <span>Mostrar alertas en la barra superior</span></label><label className="check-line"><input type="checkbox" defaultChecked /> <span>Usar tablas compactas</span></label><footer className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Cancelar</button><button className="primary-button" onClick={() => { window.localStorage.setItem("nexalab.preferences.saved", "true"); setDialog(null); showToast("Preferencias guardadas en este navegador."); }}>Guardar</button></footer></div>
      </ActionModal>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}
