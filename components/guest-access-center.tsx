"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Ban, Copy, KeyRound, Link2, Plus, Users } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { formatDate, formatDateTime } from "@/lib/dates";
import {
  DEFAULT_GUEST_DURATION_DAYS,
  DEFAULT_GUEST_SCOPES,
  GUEST_DURATIONS,
  GUEST_SCOPES,
  GUEST_SCOPE_HINT,
  GUEST_SCOPE_LABEL,
  type GuestScope,
} from "@/lib/guest-access";

// Emisión y control de los códigos de invitado. Lo abre el profesor,
// coordinador o dirección desde la barra lateral.

type Grant = {
  id: string;
  code: string;
  label: string;
  note: string | null;
  scopes: GuestScope[];
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  status: string;
  created_at: string;
  last_used_at: string | null;
  created_by_name?: string | null;
  session_count?: number | string;
};

function isExpired(grant: Grant): boolean {
  return new Date(grant.expires_at).getTime() <= Date.now();
}

function grantState(grant: Grant): { label: string; tone: string } {
  if (grant.status === "REVOKED") return { label: "Revocado", tone: "revoked" };
  if (isExpired(grant)) return { label: "Vencido", tone: "expired" };
  return { label: "Activo", tone: "active" };
}

export function GuestAccessCenter({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [scopes, setScopes] = useState<GuestScope[]>([...DEFAULT_GUEST_SCOPES]);
  const [durationDays, setDurationDays] = useState<number>(DEFAULT_GUEST_DURATION_DAYS);
  const [maxUses, setMaxUses] = useState("");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/guest-access");
      if (!response.ok) throw new Error();
      const payload = await response.json() as { data?: Grant[] };
      setGrants(payload.data ?? []);
    } catch {
      showError("No se pudieron cargar los accesos de invitado.");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  function toggleScope(scope: GuestScope) {
    setScopes((current) => (current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope]));
  }

  async function createGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!scopes.length) { showError("Elige al menos qué podrá ver el invitado."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/guest-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          note: note || undefined,
          scopes,
          durationDays,
          maxUses: maxUses ? Number(maxUses) : undefined,
        }),
      });
      const payload = await response.json() as { data?: Grant; message?: string };
      if (!response.ok) throw new Error(payload.message || "No se pudo crear el acceso.");
      showToast(`Código ${payload.data?.code} creado. Compártelo con tu grupo.`);
      setCreating(false);
      setLabel(""); setNote(""); setMaxUses("");
      setScopes([...DEFAULT_GUEST_SCOPES]);
      setDurationDays(DEFAULT_GUEST_DURATION_DAYS);
      await load();
    } catch (reason) {
      showError(reason instanceof Error ? reason.message : "No se pudo crear el acceso.");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(grant: Grant) {
    try {
      const response = await fetch(`/api/guest-access/${grant.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      showToast(`Código ${grant.code} revocado.`);
      await load();
    } catch {
      showError("No se pudo revocar el acceso.");
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${what} copiado al portapapeles.`);
    } catch {
      showError("Tu navegador no permitió copiar. Selecciona el texto manualmente.");
    }
  }

  return (
    <ActionModal
      open={open}
      onClose={onClose}
      wide
      eyebrow="ACCESO TEMPORAL"
      title="Accesos de invitado"
      description="Genera códigos para que estudiantes sin cuenta entren al laboratorio con un alcance y una vigencia definidos por ti."
    >
      <div className="modal-form guest-center">
        {creating ? (
          <form className="guest-form" onSubmit={createGrant}>
            <label>
              <span>Nombre del acceso</span>
              <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Química General · Sección A · Semestre II" required minLength={3} maxLength={160} />
            </label>
            <label>
              <span>Nota interna <small>(opcional)</small></span>
              <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Grupo de 28 estudiantes, prácticas de los martes" maxLength={1000} />
            </label>

            <fieldset className="guest-scope-fieldset">
              <legend>¿Qué podrá hacer el invitado?</legend>
              {GUEST_SCOPES.map((scope) => (
                <label key={scope} className="guest-scope-option">
                  <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                  <span>
                    <strong>{GUEST_SCOPE_LABEL[scope]}</strong>
                    <small>{GUEST_SCOPE_HINT[scope]}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="guest-form-row">
              <label>
                <span>Vigencia</span>
                <select value={durationDays} onChange={(event) => setDurationDays(Number(event.target.value))}>
                  {GUEST_DURATIONS.map((duration) => <option key={duration.days} value={duration.days}>{duration.label}</option>)}
                </select>
              </label>
              <label>
                <span>Máximo de accesos <small>(opcional)</small></span>
                <input type="number" min={1} max={5000} value={maxUses} onChange={(event) => setMaxUses(event.target.value)} placeholder="Sin límite" />
              </label>
            </div>

            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={() => setCreating(false)}>Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}>{saving ? "Generando…" : "Generar código"}</button>
            </footer>
          </form>
        ) : (
          <>
            <div className="guest-center-toolbar">
              <p className="form-help">
                El código se comparte tal cual (o con el enlace directo). Quien entra escribe su nombre y queda registrado en cada movimiento.
              </p>
              <button className="primary-button" onClick={() => setCreating(true)}><Plus size={15} /> Nuevo código</button>
            </div>

            {loading ? <p className="form-help">Cargando accesos…</p> : null}
            {!loading && !grants.length ? (
              <div className="empty-state">
                <KeyRound size={22} />
                <p>Todavía no has emitido ningún código.</p>
                <small>Crea uno para que tu grupo consulte el inventario y registre sus consumos durante el semestre.</small>
              </div>
            ) : null}

            <ul className="guest-grant-list">
              {grants.map((grant) => {
                const state = grantState(grant);
                const link = typeof window !== "undefined" ? `${window.location.origin}/invitado?codigo=${grant.code}` : "";
                return (
                  <li key={grant.id} className={`guest-grant guest-grant-${state.tone}`}>
                    <div className="guest-grant-head">
                      <div>
                        <strong className="guest-grant-code">{grant.code}</strong>
                        <span className={`status-pill status-${state.tone}`}>{state.label}</span>
                      </div>
                      <p>{grant.label}</p>
                      {grant.note ? <small>{grant.note}</small> : null}
                    </div>
                    <div className="guest-grant-meta">
                      <span>Vence el {formatDate(grant.expires_at)}</span>
                      <span>{Number(grant.uses_count ?? 0)} acceso(s){grant.max_uses ? ` de ${grant.max_uses}` : ""}</span>
                      {grant.last_used_at ? <span>Último uso: {formatDateTime(grant.last_used_at)}</span> : null}
                      {grant.created_by_name ? <span>Emitido por {grant.created_by_name}</span> : null}
                    </div>
                    <ul className="guest-grant-scopes">
                      {(grant.scopes ?? []).map((scope) => <li key={scope}>{GUEST_SCOPE_LABEL[scope] ?? scope}</li>)}
                    </ul>
                    <div className="guest-grant-actions">
                      <button className="text-button" onClick={() => void copy(grant.code, "Código")}><Copy size={14} /> Copiar código</button>
                      <button className="text-button" onClick={() => void copy(link, "Enlace")}><Link2 size={14} /> Copiar enlace</button>
                      {grant.status === "ACTIVE" ? (
                        <button className="text-button text-button-danger" onClick={() => void revoke(grant)}><Ban size={14} /> Revocar</button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    </ActionModal>
  );
}

/** Botón de la barra lateral. Solo se muestra a quien puede emitir códigos. */
export function GuestAccessTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="sidebar-link" onClick={() => setOpen(true)}>
        <Users size={17} /><span>Accesos de invitado</span>
      </button>
      <GuestAccessCenter open={open} onClose={() => setOpen(false)} />
    </>
  );
}
