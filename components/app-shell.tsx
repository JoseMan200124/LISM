"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ChevronDown,
  Command,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
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
import { SidebarAlertCount } from "@/components/sidebar-alert-count";
import { isThemePreference, resolveTheme, type ThemePreference } from "@/lib/theme";
import { DeveloperCredit } from "@/components/developer-credit";
import { DiloWidget } from "@/components/dilo-widget";

type DialogKey = "laboratory" | "preferences" | null;

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
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [resolvedDark, setResolvedDark] = useState(false);
  const [compactTables, setCompactTables] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const isEducational = isEducationalProfile(session.profileCode);

  const visibleNavigation = isEducational
    ? (educationalNavigationByRole[session.role] ?? educationalNavigationFallback)
    : navigation
        .map((group) => ({ ...group, items: group.items.filter((item) => canAccessModule(session, item.key)) }))
        .filter((group) => group.items.length > 0);

  const canReceiveSpecimens = !isEducational && hasPermission(session, "specimens.receive");

  function applyTheme(preference: ThemePreference) {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const resolved = resolveTheme(preference, media.matches);
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePreference = preference;
    window.localStorage.setItem("nexalab.theme", preference);
    setResolvedDark(resolved === "dark");
  }

  // Alternancia directa claro/oscuro desde la barra superior. Persiste la
  // preferencia en la cuenta sin abrir el diálogo de preferencias.
  async function toggleTheme() {
    const next: ThemePreference = resolvedDark ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next, compactTables, showTopbarAlerts: true }),
      });
    } catch { /* la preferencia queda al menos en este navegador */ }
  }

  useEffect(() => {
    let active = true;
    fetch("/api/users/me/preferences")
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { data?: { theme?: unknown; compactTables?: boolean } }) => {
        if (!active) return;
        const preference = isThemePreference(payload.data?.theme) ? payload.data.theme : "system";
        setTheme(preference);
        setCompactTables(Boolean(payload.data?.compactTables));
        applyTheme(preference);
      })
      .catch(() => {
        const local = window.localStorage.getItem("nexalab.theme");
        const preference = isThemePreference(local) ? local : "system";
        setTheme(preference);
        applyTheme(preference);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => { if (theme === "system") applyTheme("system"); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);

  async function savePreferences() {
    setPreferencesSaving(true);
    applyTheme(theme);
    try {
      const response = await fetch("/api/users/me/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, compactTables, showTopbarAlerts: true }),
      });
      if (!response.ok) throw new Error("preferences failed");
      document.documentElement.dataset.compactTables = compactTables ? "true" : "false";
      setDialog(null);
      showToast("Preferencias guardadas.");
    } catch {
      window.localStorage.setItem("nexalab.theme", theme);
      showError("No se pudo guardar en tu cuenta; el tema se conservó en este navegador.");
    } finally {
      setPreferencesSaving(false);
    }
  }

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
                const itemPath = item.href.split("?")[0];
                const active = itemPath === "/app" ? pathname === "/app" : pathname.startsWith(itemPath);
                const Icon = item.icon;
                return (
                  <Link key={`${item.key}:${item.href}`} href={item.href} className={`nav-item ${active ? "nav-item-active" : ""}`} onClick={() => setMobileOpen(false)}>
                    <Icon size={17} strokeWidth={1.9} />
                    <span>{item.label}</span>
                    {item.key === "alerts" ? <SidebarAlertCount /> : null}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>

        <div className="sidebar-footer">
          <TutorialTriggerButton />
          <button className="sidebar-link" onClick={() => setDialog("preferences")}><Settings size={17} /><span>Preferencias</span></button>
          <DeveloperCredit variant="compact" className="sidebar-developer-credit" />
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
            <button className="icon-button theme-toggle-button" aria-label={resolvedDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} title={resolvedDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"} onClick={() => void toggleTheme()}>
              {resolvedDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
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
      <ActionModal open={dialog === "preferences"} title="Preferencias" description="Se guardan en tu cuenta y se aplican en todos tus dispositivos." onClose={() => setDialog(null)}>
        <div className="modal-form"><fieldset className="theme-options"><legend>Tema</legend><label><input type="radio" name="theme" checked={theme === "light"} onChange={() => { setTheme("light"); applyTheme("light"); }} /> Claro</label><label><input type="radio" name="theme" checked={theme === "dark"} onChange={() => { setTheme("dark"); applyTheme("dark"); }} /> Oscuro</label><label><input type="radio" name="theme" checked={theme === "system"} onChange={() => { setTheme("system"); applyTheme("system"); }} /> Usar configuración del sistema</label></fieldset><label className="check-line"><input type="checkbox" checked={compactTables} onChange={(event) => setCompactTables(event.target.checked)} /> <span>Usar tablas compactas</span></label><footer className="modal-actions"><button className="secondary-button" onClick={() => setDialog(null)}>Cancelar</button><button className="primary-button" disabled={preferencesSaving} onClick={() => void savePreferences()}>{preferencesSaving ? "Guardando…" : "Guardar"}</button></footer></div>
      </ActionModal>
      <Toast message={message} type={toastType} onClose={clearToast} />
      <DiloWidget session={session} />
      <TutorialOverlay />
      <TutorialPrompt />
    </div>
    </TutorialProvider>
  );
}
