"use client";

import { useState } from "react";
import { GraduationCap, KeyRound, LockKeyhole, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { qualityRecords, roleTemplates } from "@/lib/compliance-data";
import { usersRows } from "@/lib/demo-data";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs } from "@/components/lims-ui";

export function AdministrationCenter() {
  const [tab, setTab] = useState("users");
  const permissionRows = roleTemplates.map((role) => ({ code: role.key, role: role.name, scope: role.scope, permissions: role.permissions.join(", "), status: "Plantilla activa" }));
  const sessionRows = [
    { user: "José Admin", role: "Administrador", origin: "Portal web", started: "Hoy · 08:02", last: "Hace 2 min", status: "Activa" },
    { user: "Andrea Ruiz", role: "Analista", origin: "Mesa de trabajo", started: "Hoy · 07:48", last: "Hace 6 min", status: "Activa" },
    { user: "Profesor Juan", role: "Profesor", origin: "Portal educativo", started: "Hoy · 11:15", last: "Hace 22 min", status: "Activa" },
  ];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="ADMINISTRACIÓN SEGURA" title="Usuarios, roles y competencia" description="Controla quién puede consultar, registrar, revisar, aprobar, firmar o configurar cada proceso.">
        <button className="primary-button"><Plus size={15} /> Invitar usuario</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Usuarios activos", value: "18", hint: "Incluye acceso educativo", icon: UsersRound },
        { label: "Roles sugeridos", value: String(roleTemplates.length), hint: "Editables por laboratorio", icon: ShieldCheck },
        { label: "Capacitaciones próximas", value: "1", hint: "Vence en 9 días", icon: GraduationCap },
      ]} />
      <InlineNotice title="Principio de mínimo privilegio">Cada persona recibe únicamente el acceso necesario para su función. Los cambios de rol, bloqueos y restablecimientos quedan registrados en auditoría.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "users", label: "Usuarios" }, { key: "roles", label: "Roles y permisos" }, { key: "training", label: "Competencia" }, { key: "sessions", label: "Sesiones" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "users" ? <AdminSection title="Directorio de usuarios" copy="Bloquea, reactiva o restablece accesos sin eliminar el historial."><SimpleTable columns={[{ key: "name", label: "Usuario" }, { key: "email", label: "Correo" }, { key: "role", label: "Rol" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }]} rows={usersRows} /></AdminSection> : null}
          {tab === "roles" ? <AdminSection title="Matriz simplificada de permisos" copy="Los roles son plantillas. Puedes crear variaciones por sede o área."><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "role", label: "Rol" }, { key: "scope", label: "Alcance" }, { key: "permissions", label: "Permisos principales" }, { key: "status", label: "Estado" }]} rows={permissionRows} /></AdminSection> : null}
          {tab === "training" ? <AdminSection title="Autorizaciones por competencia" copy="Registra capacitaciones y limita actividades cuando la autorización está vencida."><SimpleTable columns={[{ key: "person", label: "Persona" }, { key: "role", label: "Rol" }, { key: "qualification", label: "Autorización" }, { key: "validUntil", label: "Vigente hasta" }, { key: "evidence", label: "Evidencia" }, { key: "status", label: "Estado" }]} rows={qualityRecords.training} /></AdminSection> : null}
          {tab === "sessions" ? <AdminSection title="Sesiones activas" copy="La plataforma registra ingreso, cierre y actividad relevante para auditoría."><SimpleTable columns={[{ key: "user", label: "Usuario" }, { key: "role", label: "Rol" }, { key: "origin", label: "Origen" }, { key: "started", label: "Inicio" }, { key: "last", label: "Última actividad" }, { key: "status", label: "Estado" }]} rows={sessionRows} /></AdminSection> : null}
        </div>
      </article>
    </div>
  );
}

function AdminSection({ title, copy, children }: Readonly<{ title: string; copy: string; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button"><KeyRound size={15} /> Gestionar</button></div>{children}</section>;
}
