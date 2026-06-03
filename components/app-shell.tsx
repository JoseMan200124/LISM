"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  X,
} from "lucide-react";
import { navigation } from "@/lib/navigation";
import type { UserSession } from "@/lib/session";
import { NewAccessionModal } from "@/components/new-accession-modal";

export function AppShell({ session, children }: Readonly<{ session: UserSession; children: React.ReactNode }>) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newSpecimenOpen, setNewSpecimenOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <Link href="/app" className="brand-lockup">
            <span className="brand-symbol">N</span>
            <div>
              <strong>NexaLab</strong>
              <span>Laboratory OS</span>
            </div>
          </Link>
          <button className="icon-button sidebar-close" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>

        <div className="laboratory-switcher">
          <div className="laboratory-mark">LC</div>
          <div>
            <span>Laboratorio activo</span>
            <strong>{session.laboratoryName}</strong>
          </div>
          <ChevronDown size={15} />
        </div>

        <nav className="side-navigation" aria-label="Navegación principal">
          {navigation.map((group) => (
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
          <button className="sidebar-link"><CircleHelp size={17} /><span>Centro de ayuda</span></button>
          <button className="sidebar-link"><Settings size={17} /><span>Preferencias</span></button>
        </div>
      </aside>

      {mobileOpen ? <button className="mobile-backdrop" aria-label="Cerrar navegación" onClick={() => setMobileOpen(false)} /> : null}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Abrir menú" onClick={() => setMobileOpen(true)}><Menu size={19} /></button>
          <label className="global-search">
            <Search size={16} />
            <input placeholder="Buscar muestra, paciente, orden o lote…" />
            <kbd><Command size={11} /> K</kbd>
          </label>
          <div className="topbar-actions">
            <button className="primary-button compact-button" onClick={() => setNewSpecimenOpen(true)}><Plus size={16} /> Nueva muestra</button>
            <button className="icon-button notification-button" aria-label="Notificaciones"><Bell size={18} /><span /></button>
            <div className="profile-menu-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}>
                <span className="avatar">JA</span>
                <span className="profile-copy"><strong>{session.name}</strong><small>Administrador</small></span>
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
      <NewAccessionModal open={newSpecimenOpen} onClose={() => setNewSpecimenOpen(false)} />
    </div>
  );
}
