"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Building2, Trash2, Upload } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState } from "@/components/lims-ui";
import { UserAvatar } from "@/components/user-avatar";
import { useOrganizationLogoStatus } from "@/components/organization-logo";
import { roleLabels } from "@/lib/permissions";
import type { UserSession } from "@/lib/session";

type MeProfile = {
  userId: string;
  name: string;
  email: string;
  role: UserSession["role"];
  laboratoryName: string;
  organizationName: string | null;
};

const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp";

export function MyProfileTab() {
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/users/me");
      if (!response.ok) {
        setError("No se pudo cargar tu perfil.");
        return;
      }
      const payload = await response.json() as { data: MeProfile };
      setProfile(payload.data);
    } catch {
      setError("No se pudo cargar tu perfil. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/users/me/avatar", { method: "POST", body: form });
      if (response.ok) {
        showToast("Foto de perfil actualizada.");
        setCacheBust(Date.now());
      } else {
        const payload = await response.json().catch(() => ({ message: undefined })) as { message?: string };
        showError(payload.message || "No se pudo subir la foto.");
      }
    } catch {
      showError("No se pudo subir la foto. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmDeleteAvatar() {
    setConfirmDelete(false);
    try {
      const response = await fetch("/api/users/me/avatar", { method: "DELETE" });
      if (response.ok) {
        showToast("Foto de perfil eliminada.");
        setCacheBust(Date.now());
      } else {
        showError("No se pudo eliminar la foto.");
      }
    } catch {
      showError("No se pudo eliminar la foto. Intenta de nuevo.");
    }
  }

  if (loading) {
    return <div className="account-tab-loading">Cargando tu perfil…</div>;
  }
  if (error || !profile) {
    return <ErrorState description={error ?? "No se pudo cargar tu perfil."} onRetry={() => void load()} />;
  }

  return (
    <div>
      <div className="section-heading">
        <div><h2>Mi perfil</h2><p>Tu foto de perfil se muestra en toda la plataforma: barra superior, usuarios y auditoría.</p></div>
      </div>
      <div className="account-profile-card">
        <div data-tutorial="config-avatar-upload" className="account-avatar-wrap">
          <UserAvatar userId={profile.userId} name={profile.name} size="lg" cacheBust={cacheBust} />
        </div>
        <div className="account-profile-actions">
          <label className="secondary-button account-file-label">
            <Upload size={15} /> {uploading ? "Subiendo…" : "Subir o reemplazar foto"}
            <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={(event) => void handleFileChange(event)} disabled={uploading} hidden />
          </label>
          <button className="secondary-button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Eliminar foto</button>
        </div>
      </div>
      <div className="details-grid account-details-grid">
        <div><small>Nombre</small><strong>{profile.name}</strong></div>
        <div><small>Correo</small><strong>{profile.email}</strong></div>
        <div><small>Rol</small><strong>{roleLabels[profile.role]}</strong></div>
        <div><small>Institución</small><strong>{profile.organizationName ?? profile.laboratoryName}</strong></div>
      </div>
      <ActionModal open={confirmDelete} title="Eliminar foto de perfil" description="Se mostrará tu avatar con iniciales en su lugar. Esta acción no se puede deshacer." onClose={() => setConfirmDelete(false)}>
        <div className="modal-form">
          <footer className="modal-actions">
            <button className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="primary-button" onClick={() => void confirmDeleteAvatar()}>Eliminar</button>
          </footer>
        </div>
      </ActionModal>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function LogoPreview({ cacheBust }: Readonly<{ cacheBust: number }>) {
  const { status, src } = useOrganizationLogoStatus(cacheBust);

  if (status === "ok") {
    // eslint-disable-next-line @next/next/no-img-element -- imagen autenticada, ya precargada y verificada
    return <img src={src} alt="Logo institucional" className="institution-logo-preview" />;
  }
  return (
    <div className="institution-logo-fallback">
      {/* eslint-disable-next-line @next/next/no-img-element -- asset estático público, no requiere next/image aquí */}
      <img src="/branding/nexalab-mark.png" alt="NexaLab (respaldo)" className="institution-logo-preview institution-logo-preview-fallback" />
      <span>Sin logo institucional — se usa NexaLab como respaldo en tus reportes</span>
    </div>
  );
}

export function InstitutionTab({ canManage }: Readonly<{ canManage: boolean }>) {
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cacheBust, setCacheBust] = useState(0);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { data?: { organizationName: string | null } } | null) => {
        if (payload?.data) setOrganizationName(payload.data.organizationName);
      })
      .catch(() => {});
  }, []);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/organization/logo", { method: "POST", body: form });
      if (response.ok) {
        showToast("Logo institucional actualizado.");
        setCacheBust(Date.now());
      } else {
        const payload = await response.json().catch(() => ({ message: undefined })) as { message?: string };
        showError(payload.message || "No se pudo subir el logo.");
      }
    } catch {
      showError("No se pudo subir el logo. Intenta de nuevo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmDeleteLogo() {
    setConfirmDelete(false);
    try {
      const response = await fetch("/api/organization/logo", { method: "DELETE" });
      if (response.ok) {
        showToast("Logo institucional eliminado. Los reportes usarán NexaLab como respaldo.");
        setCacheBust(Date.now());
      } else {
        showError("No se pudo eliminar el logo.");
      }
    } catch {
      showError("No se pudo eliminar el logo. Intenta de nuevo.");
    }
  }

  return (
    <div>
      <div className="section-heading">
        <div><h2>Institución y marca</h2><p>El logo institucional aparece en tus reportes PDF, en el menú lateral y en esta pantalla.</p></div>
      </div>
      <div className="account-profile-card">
        <div className="institution-logo-box" data-tutorial="config-institution-logo">
          <LogoPreview cacheBust={cacheBust} />
        </div>
        {canManage ? (
          <div className="account-profile-actions">
            <label className="secondary-button account-file-label">
              <Upload size={15} /> {uploading ? "Subiendo…" : "Subir o reemplazar logo"}
              <input ref={fileInputRef} type="file" accept={ACCEPTED_TYPES} onChange={(event) => void handleFileChange(event)} disabled={uploading} hidden />
            </label>
            <button className="secondary-button" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Eliminar logo</button>
          </div>
        ) : (
          <p className="account-readonly-note"><Building2 size={14} /> Solo el propietario o administrador del laboratorio puede cambiar el logo institucional.</p>
        )}
      </div>
      <div className="details-grid account-details-grid">
        <div><small>Institución</small><strong>{organizationName ?? "—"}</strong></div>
      </div>
      <ActionModal open={confirmDelete} title="Eliminar logo institucional" description="Los reportes PDF volverán a usar el logo de NexaLab automáticamente. Esta acción no se puede deshacer." onClose={() => setConfirmDelete(false)}>
        <div className="modal-form">
          <footer className="modal-actions">
            <button className="secondary-button" onClick={() => setConfirmDelete(false)}>Cancelar</button>
            <button className="primary-button" onClick={() => void confirmDeleteLogo()}>Eliminar</button>
          </footer>
        </div>
      </ActionModal>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

export function NotificationsPrefsTab() {
  const [topbarAlerts, setTopbarAlerts] = useState(true);
  const [compactTables, setCompactTables] = useState(true);
  const { message, showToast, clearToast } = useToast();

  useEffect(() => {
    setTopbarAlerts(window.localStorage.getItem("nexalab.pref.topbar-alerts") !== "false");
    setCompactTables(window.localStorage.getItem("nexalab.pref.compact-tables") !== "false");
  }, []);

  function save() {
    window.localStorage.setItem("nexalab.pref.topbar-alerts", String(topbarAlerts));
    window.localStorage.setItem("nexalab.pref.compact-tables", String(compactTables));
    window.localStorage.setItem("nexalab.preferences.saved", "true");
    showToast("Preferencias de notificaciones guardadas en este navegador.");
  }

  return (
    <div>
      <div className="section-heading">
        <div><h2>Notificaciones</h2><p>Ajusta cómo se muestran las alertas y avisos dentro de la plataforma.</p></div>
      </div>
      <div className="modal-form" style={{ maxWidth: 480 }}>
        <label className="check-line"><input type="checkbox" checked={topbarAlerts} onChange={(event) => setTopbarAlerts(event.target.checked)} /> <span>Mostrar alertas en la barra superior</span></label>
        <label className="check-line"><input type="checkbox" checked={compactTables} onChange={(event) => setCompactTables(event.target.checked)} /> <span>Usar tablas compactas</span></label>
        <footer className="modal-actions" style={{ justifyContent: "flex-start" }}>
          <button className="primary-button" onClick={save}>Guardar preferencias</button>
        </footer>
      </div>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}
