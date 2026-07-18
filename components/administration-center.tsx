"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GraduationCap, KeyRound, Plus, RotateCcw, Save, ShieldCheck, UsersRound } from "lucide-react";
import { qualityRecords } from "@/lib/compliance-data";
import { ActionModal, CopyButton, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonTable, StatGrid, Tabs } from "@/components/lims-ui";
import { UserAvatar } from "@/components/user-avatar";
import { permissionLabels, type PermissionKey } from "@/lib/authorization";
import { roleLabels } from "@/lib/permissions";
import type { UserSession } from "@/lib/session";

type DirectoryUser = {
  id: string;
  full_name?: string;
  name?: string;
  email: string;
  role: string;
  status?: string;
  membership_status?: string;
};

type RoleMatrixRow = {
  role: UserSession["role"];
  defaults: PermissionKey[];
  effective: PermissionKey[];
};

const INVITABLE_ROLES: Array<UserSession["role"]> = ["LAB_ADMIN", "HEAD_OF_LAB", "ANALYST", "ASSISTANT", "AUDITOR", "CONSULTATION", "PROFESSOR", "STUDENT"];

// Agrupación visual de permisos para la matriz.
const PERMISSION_GROUPS: Array<{ title: string; keys: PermissionKey[] }> = [
  { title: "Inventario", keys: ["inventory.view", "inventory.manage", "inventory.move"] },
  { title: "Equipos", keys: ["equipment.view", "equipment.manage"] },
  { title: "Programa educativo", keys: ["education.view", "education.manage"] },
  { title: "Alertas e incidencias", keys: ["alerts.view", "alerts.manage", "incidents.view", "incidents.manage"] },
  { title: "Bitácora y cumplimiento", keys: ["audit.view", "compliance.view"] },
  { title: "Muestras y resultados", keys: ["specimens.view", "specimens.receive", "specimens.transition", "results.view", "results.enter", "results.approve"] },
  { title: "Calidad y firmas", keys: ["quality.view", "quality.manage", "signatures.create"] },
  { title: "Administración", keys: ["configuration.manage"] },
];

export function AdministrationCenter() {
  const [tab, setTab] = useState("users");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);
  const [managing, setManaging] = useState<DirectoryUser | null>(null);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const response = await fetch("/api/users");
      if (response.status === 403) {
        setUsersError("No tienes permiso para consultar el directorio de usuarios.");
        return;
      }
      if (!response.ok) {
        setUsersError("No se pudo cargar el directorio de usuarios.");
        return;
      }
      const payload = await response.json() as { data: DirectoryUser[] };
      setUsers(payload.data ?? []);
    } catch {
      setUsersError("No se pudo cargar el directorio de usuarios. Verifica tu conexión.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setInviteSaving(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          role: String(form.get("role") ?? "ASSISTANT"),
        }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; data?: { temporaryPassword?: string | null } };
      if (!response.ok) { showError(payload.message ?? "No se pudo crear el acceso."); return; }
      setInviteOpen(false);
      setTemporaryPassword(payload.data?.temporaryPassword ?? null);
      showToast(payload.data?.temporaryPassword ? "Usuario creado. Comparte la contraseña temporal de forma segura." : "Acceso otorgado al usuario existente.");
      await loadUsers();
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setInviteSaving(false); }
  }

  async function manageUser(body: Record<string, unknown>) {
    if (!managing) return;
    try {
      const response = await fetch(`/api/users/${managing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string; data?: { temporaryPassword?: string | null } };
      if (!response.ok) { showError(payload.message ?? "No se pudo actualizar el usuario."); return; }
      if (payload.data?.temporaryPassword) setTemporaryPassword(payload.data.temporaryPassword);
      showToast("Usuario actualizado.");
      setManaging(null);
      await loadUsers();
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="ADMINISTRACIÓN SEGURA" title="Usuarios, roles y competencia" description="Controla quién puede consultar, registrar, revisar, aprobar, firmar o configurar cada proceso.">
        <button className="primary-button" onClick={() => setInviteOpen(true)}><Plus size={15} /> Invitar usuario</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Usuarios visibles", value: String(users.length), hint: "Incluye acceso educativo", icon: UsersRound },
        { label: "Roles configurables", value: String(INVITABLE_ROLES.length), hint: "Permisos editables por rol", icon: ShieldCheck },
        { label: "Capacitaciones próximas", value: "1", hint: "Vence en 9 días", icon: GraduationCap },
      ]} />
      <InlineNotice title="Principio de mínimo privilegio">Cada persona recibe únicamente el acceso necesario para su función. Los cambios de rol, bloqueos y restablecimientos quedan registrados en la bitácora.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "users", label: "Usuarios" }, { key: "roles", label: "Roles y permisos" }, { key: "training", label: "Competencia" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "users" ? (
            <section>
              <div className="section-heading">
                <div><h2>Directorio de usuarios</h2><p>Haz clic en una persona para cambiar su rol, bloquear su acceso o restablecer su contraseña.</p></div>
              </div>
              {loadingUsers ? (
                <SkeletonTable rows={5} cols={5} />
              ) : usersError ? (
                <ErrorState description={usersError} onRetry={() => void loadUsers()} />
              ) : (
                <UserDirectoryTable users={users} onSelect={setManaging} />
              )}
            </section>
          ) : null}
          {tab === "roles" ? <RolePermissionsEditor /> : null}
          {tab === "training" ? (
            <section>
              <div className="section-heading"><div><h2>Autorizaciones por competencia</h2><p>Registra capacitaciones y limita actividades cuando la autorización está vencida.</p></div></div>
              <SimpleTable columns={[{ key: "person", label: "Persona" }, { key: "role", label: "Rol" }, { key: "qualification", label: "Autorización" }, { key: "validUntil", label: "Vigente hasta" }, { key: "evidence", label: "Evidencia" }, { key: "status", label: "Estado" }]} rows={qualityRecords.training} />
            </section>
          ) : null}
        </div>
      </article>

      <ActionModal open={inviteOpen} title="Invitar usuario" description="Crea el acceso con el rol mínimo necesario. Se genera una contraseña temporal que debes compartir de forma segura." onClose={() => setInviteOpen(false)}>
        <form className="modal-form" onSubmit={invite}>
          <div className="form-grid">
            <label><span>Nombre</span><input required name="name" minLength={2} placeholder="Nombre completo" /></label>
            <label><span>Correo</span><input required name="email" type="email" placeholder="usuario@laboratorio.com" /></label>
            <label><span>Rol</span><select name="role" defaultValue="ASSISTANT">{INVITABLE_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
          </div>
          <footer className="modal-actions">
            <button type="button" className="secondary-button" onClick={() => setInviteOpen(false)}>Cancelar</button>
            <button className="primary-button" type="submit" disabled={inviteSaving}>{inviteSaving ? "Creando…" : "Crear acceso"}</button>
          </footer>
        </form>
      </ActionModal>

      <ActionModal open={Boolean(temporaryPassword)} title="Contraseña temporal" description="Se muestra una sola vez. La persona debe cambiarla después de ingresar." onClose={() => setTemporaryPassword(null)}>
        <div className="modal-form">
          <div className="qr-code-result"><small>CONTRASEÑA TEMPORAL</small><strong>{temporaryPassword}</strong><p>Compártela por un canal seguro. No se puede volver a consultar.</p></div>
          <footer className="modal-actions">
            {temporaryPassword ? <CopyButton text={temporaryPassword} onCopied={() => showToast("Contraseña copiada.")} /> : null}
            <button className="primary-button" onClick={() => setTemporaryPassword(null)}>Entendido</button>
          </footer>
        </div>
      </ActionModal>

      <ActionModal open={Boolean(managing)} title={managing ? (managing.full_name ?? managing.email) : "Usuario"} description="Cambia el rol, el estado del acceso o restablece la contraseña." onClose={() => setManaging(null)}>
        {managing ? (
          <div className="modal-form">
            <div className="details-grid">
              <div><small>Correo</small><strong>{managing.email}</strong></div>
              <div><small>Rol actual</small><strong>{roleLabels[managing.role as UserSession["role"]] ?? managing.role}</strong></div>
              <div><small>Acceso</small><strong>{managing.membership_status === "INACTIVE" ? "Bloqueado" : "Activo"}</strong></div>
            </div>
            {managing.role === "OWNER" ? <p className="modal-note">El propietario de la cuenta no puede modificarse desde aquí.</p> : (
              <>
                <form onSubmit={(event) => { event.preventDefault(); const role = String(new FormData(event.currentTarget).get("role")); if (role && role !== managing.role) void manageUser({ role }); }}>
                  <div className="form-grid form-grid-two">
                    <label><span>Nuevo rol</span><select name="role" defaultValue={managing.role}>{INVITABLE_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>
                    <footer className="modal-actions" style={{ alignSelf: "end" }}><button type="submit" className="secondary-button"><Save size={15} /> Cambiar rol</button></footer>
                  </div>
                </form>
                <footer className="modal-actions">
                  <button type="button" className="secondary-button" onClick={() => void manageUser({ resetPassword: true })}><KeyRound size={15} /> Restablecer contraseña</button>
                  {managing.membership_status === "INACTIVE"
                    ? <button type="button" className="primary-button" onClick={() => void manageUser({ status: "ACTIVE" })}>Reactivar acceso</button>
                    : <button type="button" className="secondary-button" onClick={() => void manageUser({ status: "INACTIVE" })}>Bloquear acceso</button>}
                </footer>
              </>
            )}
          </div>
        ) : null}
      </ActionModal>

      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Matriz de permisos por rol ──────────────────────────────────────────────

function RolePermissionsEditor() {
  const [matrix, setMatrix] = useState<RoleMatrixRow[]>([]);
  const [pendingMigration, setPendingMigration] = useState(false);
  const [activeRole, setActiveRole] = useState<UserSession["role"]>("PROFESSOR");
  const [selection, setSelection] = useState<Set<PermissionKey>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [saving, setSaving] = useState(false);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async (keepRole?: UserSession["role"]) => {
    setState("loading");
    try {
      const response = await fetch("/api/organization/role-permissions");
      if (!response.ok) { setState("error"); return; }
      const payload = await response.json() as { data?: { roles?: RoleMatrixRow[] }; mode?: string };
      const roles = payload.data?.roles ?? [];
      setMatrix(roles);
      setPendingMigration(payload.mode === "pending-migration");
      const current = roles.find((row) => row.role === keepRole) ?? roles.find((row) => row.role === "PROFESSOR") ?? roles[0];
      if (current) {
        setActiveRole(current.role);
        setSelection(new Set(current.effective));
      }
      setDirty(false);
      setState("ready");
    } catch { setState("error"); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function selectRole(role: UserSession["role"]) {
    const row = matrix.find((item) => item.role === role);
    setActiveRole(role);
    setSelection(new Set(row?.effective ?? []));
    setDirty(false);
  }

  function toggle(permission: PermissionKey) {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
    setDirty(true);
  }

  function restoreDefaults() {
    const row = matrix.find((item) => item.role === activeRole);
    setSelection(new Set(row?.defaults ?? []));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/organization/role-permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: activeRole, permissions: [...selection] }),
      });
      const payload = await response.json().catch(() => ({})) as { message?: string };
      if (!response.ok) { showError(payload.message ?? "No se pudieron guardar los permisos."); return; }
      showToast("Permisos guardados. Aplican en el siguiente inicio de sesión de cada usuario con este rol.");
      await load(activeRole);
    } catch { showError("No se pudo conectar con el servidor."); }
    finally { setSaving(false); }
  }

  if (state === "loading") return <SkeletonTable rows={6} cols={3} />;
  if (state === "error") return <ErrorState description="No se pudo cargar la matriz de permisos." onRetry={() => void load()} />;

  const activeRow = matrix.find((item) => item.role === activeRole);

  return (
    <section>
      <div className="section-heading">
        <div><h2>Matriz de permisos por rol</h2><p>Activa o desactiva permisos para cada rol de este laboratorio. Los cambios aplican en el siguiente inicio de sesión.</p></div>
        <div className="header-actions">
          <button className="secondary-button" onClick={restoreDefaults} disabled={pendingMigration}><RotateCcw size={15} /> Restablecer sugeridos</button>
          <button className="primary-button" onClick={() => void save()} disabled={saving || !dirty || pendingMigration}><Save size={15} /> {saving ? "Guardando…" : "Guardar permisos"}</button>
        </div>
      </div>
      {pendingMigration ? <InlineNotice title="Función por activar">La edición de permisos estará disponible al aplicar la actualización de base de datos (migración 0017).</InlineNotice> : null}
      <div className="filter-chip-row" role="group" aria-label="Rol a editar">
        {matrix.map((row) => (
          <button key={row.role} type="button" className={`filter-chip${activeRole === row.role ? " filter-chip-active" : ""}`} onClick={() => selectRole(row.role)}>{roleLabels[row.role] ?? row.role}</button>
        ))}
      </div>
      {activeRow ? (
        <div className="permission-groups">
          {PERMISSION_GROUPS.map((group) => (
            <article key={group.title} className="permission-group">
              <h3>{group.title}</h3>
              {group.keys.map((permission) => (
                <label key={permission} className="checkbox-line">
                  <input type="checkbox" checked={selection.has(permission)} onChange={() => toggle(permission)} disabled={pendingMigration} />
                  <span>{permissionLabels[permission]}{activeRow.defaults.includes(permission) ? "" : " (extra)"}</span>
                </label>
              ))}
            </article>
          ))}
        </div>
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </section>
  );
}

function UserDirectoryTable({ users, onSelect }: Readonly<{ users: DirectoryUser[]; onSelect: (user: DirectoryUser) => void }>) {
  if (users.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><UsersRound size={22} /></div>
        <h3>Sin usuarios</h3>
        <p>Todavía no hay usuarios registrados en este laboratorio.</p>
      </div>
    );
  }

  return (
    <article className="panel table-panel module-table-panel">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Correo</th>
              <th>Rol</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const name = user.full_name ?? user.name ?? user.email;
              const isRealId = !user.id.startsWith("demo-") && !user.id.startsWith("pending-");
              const blocked = user.membership_status === "INACTIVE";
              return (
                <tr key={user.id} className="data-row-clickable" tabIndex={0} role="button" onClick={() => onSelect(user)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(user); } }}>
                  <td>
                    <div className="user-directory-cell">
                      <UserAvatar userId={isRealId ? user.id : null} name={name} size="sm" />
                      <span>{name}</span>
                    </div>
                  </td>
                  <td>{user.email}</td>
                  <td>{roleLabels[user.role as UserSession["role"]] ?? user.role}</td>
                  <td><span className={`status-pill ${blocked ? "status-pill-danger" : ""}`}>{blocked ? "Bloqueado" : user.status === "ACTIVE" ? "Activo" : user.status ?? "Activo"}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="table-footer"><span>{users.length} registros visibles</span></footer>
    </article>
  );
}
