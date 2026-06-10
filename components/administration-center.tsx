"use client";

import { useState, type FormEvent } from "react";
import { GraduationCap, KeyRound, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { qualityRecords, roleTemplates } from "@/lib/compliance-data";
import { usersRows as seedUsers } from "@/lib/demo-data";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

export function AdministrationCenter() {
  const [tab, setTab] = useState("users");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manage, setManage] = useState<string | null>(null);
  const [users, setUsers] = useState<TableRow[]>(seedUsers);
  const { message, showToast, clearToast } = useToast();
  const permissionRows = roleTemplates.map((role) => ({ code: role.key, role: role.name, scope: role.scope, permissions: role.permissions.join(", "), status: "Plantilla activa" }));
  const sessionRows = [
    { user: "José Admin", role: "Administrador", origin: "Portal web", started: "Hoy · 08:02", last: "Hace 2 min", status: "Activa" },
    { user: "Andrea Ruiz", role: "Analista", origin: "Mesa de trabajo", started: "Hoy · 07:48", last: "Hace 6 min", status: "Activa" },
    { user: "Profesor Juan", role: "Profesor", origin: "Portal educativo", started: "Hoy · 11:15", last: "Hace 22 min", status: "Activa" },
  ];

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setUsers((current) => [{ name: String(form.get("name")), email: String(form.get("email")), role: String(form.get("role")), area: String(form.get("area")), status: "Invitación enviada" }, ...current]);
    setInviteOpen(false);
    showToast("Invitación creada. El usuario deberá establecer su contraseña al ingresar.");
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="ADMINISTRACIÓN SEGURA" title="Usuarios, roles y competencia" description="Controla quién puede consultar, registrar, revisar, aprobar, firmar o configurar cada proceso.">
        <button className="primary-button" onClick={() => setInviteOpen(true)}><Plus size={15} /> Invitar usuario</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Usuarios visibles", value: String(users.length), hint: "Incluye acceso educativo", icon: UsersRound },
        { label: "Roles sugeridos", value: String(roleTemplates.length), hint: "Editables por laboratorio", icon: ShieldCheck },
        { label: "Capacitaciones próximas", value: "1", hint: "Vence en 9 días", icon: GraduationCap },
      ]} />
      <InlineNotice title="Principio de mínimo privilegio">Cada persona recibe únicamente el acceso necesario para su función. Los cambios de rol, bloqueos y restablecimientos quedan registrados en auditoría.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "users", label: "Usuarios" }, { key: "roles", label: "Roles y permisos" }, { key: "training", label: "Competencia" }, { key: "sessions", label: "Sesiones" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "users" ? <AdminSection title="Directorio de usuarios" copy="Bloquea, reactiva o restablece accesos sin eliminar el historial." onManage={() => setManage("usuarios")}><SimpleTable columns={[{ key: "name", label: "Usuario" }, { key: "email", label: "Correo" }, { key: "role", label: "Rol" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }]} rows={users} /></AdminSection> : null}
          {tab === "roles" ? <AdminSection title="Matriz simplificada de permisos" copy="Los roles son plantillas. Puedes crear variaciones por sede o área." onManage={() => setManage("roles y permisos")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "role", label: "Rol" }, { key: "scope", label: "Alcance" }, { key: "permissions", label: "Permisos principales" }, { key: "status", label: "Estado" }]} rows={permissionRows} /></AdminSection> : null}
          {tab === "training" ? <AdminSection title="Autorizaciones por competencia" copy="Registra capacitaciones y limita actividades cuando la autorización está vencida." onManage={() => setManage("competencia")}><SimpleTable columns={[{ key: "person", label: "Persona" }, { key: "role", label: "Rol" }, { key: "qualification", label: "Autorización" }, { key: "validUntil", label: "Vigente hasta" }, { key: "evidence", label: "Evidencia" }, { key: "status", label: "Estado" }]} rows={qualityRecords.training} /></AdminSection> : null}
          {tab === "sessions" ? <AdminSection title="Sesiones activas" copy="La plataforma registra ingreso, cierre y actividad relevante para auditoría." onManage={() => setManage("sesiones")}><SimpleTable columns={[{ key: "user", label: "Usuario" }, { key: "role", label: "Rol" }, { key: "origin", label: "Origen" }, { key: "started", label: "Inicio" }, { key: "last", label: "Última actividad" }, { key: "status", label: "Estado" }]} rows={sessionRows} /></AdminSection> : null}
        </div>
      </article>
      <ActionModal open={inviteOpen} title="Invitar usuario" description="Crea un acceso inicial con el rol mínimo necesario." onClose={() => setInviteOpen(false)}>
        <form className="modal-form" onSubmit={invite}><div className="form-grid"><label><span>Nombre</span><input required name="name" placeholder="Nombre completo" /></label><label><span>Correo</span><input required name="email" type="email" placeholder="usuario@laboratorio.com" /></label><label><span>Rol</span><select name="role"><option>Analista</option><option>Auxiliar</option><option>Jefe de laboratorio</option><option>Inspector/Auditor</option><option>Consulta</option><option>Profesor</option><option>Estudiante</option></select></label><label><span>Área</span><input required name="area" placeholder="Ej. Microbiología" /></label></div><footer className="modal-actions"><button type="button" className="secondary-button" onClick={() => setInviteOpen(false)}>Cancelar</button><button className="primary-button" type="submit">Enviar invitación</button></footer></form>
      </ActionModal>
      <ActionModal open={Boolean(manage)} title={`Gestionar ${manage ?? ""}`} description="La acción queda preparada para operar sin borrar el historial." onClose={() => setManage(null)}>
        <div className="modal-form"><p>Desde esta sección puedes aplicar cambios controlados, revisar el historial y registrar el motivo. En producción, cada modificación se guarda en el audit trail.</p><footer className="modal-actions"><button className="primary-button" onClick={() => { setManage(null); showToast("Panel de gestión revisado."); }}>Entendido</button></footer></div>
      </ActionModal>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function AdminSection({ title, copy, children, onManage }: Readonly<{ title: string; copy: string; children: React.ReactNode; onManage: () => void }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button" onClick={onManage}><KeyRound size={15} /> Gestionar</button></div>{children}</section>;
}
