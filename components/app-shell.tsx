"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  CircleHelp,
  Command,
  LogOut,
  Menu,
  Plus,
  Search,
  Settings,
  Microscope,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { navigation, educationalNavigationByRole, educationalNavigationFallback } from "@/lib/navigation";
import type { UserSession } from "@/lib/session";
import { NewAccessionModal } from "@/components/new-accession-modal";
import { OrganizationLogo } from "@/components/organization-logo";
import { roleLabels } from "@/lib/permissions";
import { canAccessModule, hasPermission } from "@/lib/authorization";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { NotificationCenter } from "@/components/notification-center";
import { UserAvatar } from "@/components/user-avatar";
import { TutorialProvider } from "@/components/tutorial/tutorial-context";
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay";
import { TutorialPrompt } from "@/components/tutorial/tutorial-prompt";
import { TutorialTriggerButton } from "@/components/tutorial/tutorial-trigger-button";
import { isEducationalProfile } from "@/lib/lab-profile";

type DialogKey = "laboratory" | "help" | "preferences" | null;

export function AppShell({ session, children }: Readonly<{ session: UserSession; children: React.ReactNode }>) {
  const pathname = usePathname();
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [newSpecimenOpen, setNewSpecimenOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKey>(null);
  const [query, setQuery] = useState("");
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

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

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/users/me/avatar", { method: "POST", body: form });
      if (response.ok) {
        showToast("Foto de perfil actualizada.");
        setAvatarCacheBust(Date.now());
      } else {
        const payload = await response.json().catch(() => ({ message: undefined })) as { message?: string };
        showError(payload.message || "No se pudo subir la foto.");
      }
    } catch {
      showError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function handleAvatarDelete() {
    try {
      const response = await fetch("/api/users/me/avatar", { method: "DELETE" });
      if (response.ok) {
        showToast("Foto de perfil eliminada.");
        setAvatarCacheBust(Date.now());
      } else {
        showError("No se pudo eliminar la foto.");
      }
    } catch {
      showError("No se pudo eliminar la foto. Intenta de nuevo.");
    }
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
    <TutorialProvider>
    <div className="app-layout">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-header">
          <Link href="/app" className="brand-home-link" aria-label="Ir al inicio de NexaLab">
            <OrganizationLogo compact subtitle={isEducational ? "Educativo" : "Laboratory OS"} priority />
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
          <TutorialTriggerButton />
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
            <NotificationCenter />
            <div className="profile-menu-wrap">
              <button className="profile-button" onClick={() => setProfileOpen((open) => !open)}>
                <UserAvatar userId={session.userId} name={session.name} size="sm" cacheBust={avatarCacheBust} />
                <span className="profile-copy"><strong>{session.name}</strong><small>{roleLabels[session.role]}</small></span>
                <ChevronDown size={14} />
              </button>
              {profileOpen ? (
                <div className="profile-dropdown">
                  <div className="profile-dropdown-avatar">
                    <UserAvatar userId={session.userId} name={session.name} size="lg" cacheBust={avatarCacheBust} />
                    <div className="profile-dropdown-avatar-actions">
                      <label className="text-button profile-avatar-upload-label">
                        <Upload size={13} /> {avatarUploading ? "Subiendo…" : "Cambiar foto"}
                        <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={avatarUploading} onChange={(event) => void handleAvatarChange(event)} />
                      </label>
                      <button className="text-button" onClick={() => void handleAvatarDelete()}><Trash2 size={13} /> Eliminar</button>
                    </div>
                  </div>
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
      <ActionModal open={dialog === "help"} title="Centro de ayuda" description="Dónde va cada cosa en NexaLab." onClose={() => setDialog(null)}>
        <div className="modal-form">
          <div className="help-guide">
            <article>
              <h3>Alertas automáticas</h3>
              <p>Las genera el sistema: inventario bajo, vencimientos, stock, equipos, mantenimiento, calibración y prácticas. Cada alerta enlaza con el registro que la originó.</p>
              <button type="button" className="secondary-button" onClick={() => { setDialog(null); router.push("/app/alerts"); }}>Ir a Alertas</button>
            </article>
            <article>
              <h3>Incidencias / Hallazgos</h3>
              <p>Los registras tú a mano: accidentes, daños, derrames, observaciones o incumplimientos. Se asignan, se les da seguimiento y se cierran con su resolución.</p>
              <button type="button" className="secondary-button" onClick={() => { setDialog(null); router.push("/app/incidents"); }}>Ir a Incidencias</button>
            </article>
            <article>
              <h3>Bitácora / Historial</h3>
              <p>La trazabilidad de todas las acciones realizadas en la plataforma: quién hizo qué, cuándo y con qué valores anteriores y nuevos.</p>
              <button type="button" className="secondary-button" onClick={() => { setDialog(null); router.push("/app/audit"); }}>Ir a Bitácora</button>
            </article>
          </div>
          <footer className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Cerrar</button></footer>
        </div>
      </ActionModal>
      <ActionModal open={dialog === "preferences"} title="Preferencias" description="Estas preferencias se guardan únicamente en este navegador." onClose={() => setDialog(null)}>
        <div className="modal-form"><label className="check-line"><input type="checkbox" defaultChecked /> <span>Mostrar alertas en la barra superior</span></label><label className="check-line"><input type="checkbox" defaultChecked /> <span>Usar tablas compactas</span></label><footer className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Cancelar</button><button className="primary-button" onClick={() => { window.localStorage.setItem("nexalab.preferences.saved", "true"); setDialog(null); showToast("Preferencias guardadas en este navegador."); }}>Guardar</button></footer></div>
      </ActionModal>
      <Toast message={message} type={toastType} onClose={clearToast} />
      <TutorialOverlay />
      <TutorialPrompt />
    </div>
    </TutorialProvider>
  );
}
