"use client";

import { useState } from "react";
import {
  Boxes,
  CheckCircle2,
  Layers3,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import {
  laboratoryProfiles,
  roleTemplates,
  type LaboratoryProfileKey,
} from "@/lib/compliance-data";
import { InlineNotice, PageIntro, StatGrid, Tabs } from "@/components/lims-ui";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { CustomFieldsManager } from "@/components/custom-fields-manager";
import { MyProfileTab, InstitutionTab, NotificationsPrefsTab } from "@/components/configuration-account-tabs";
import { BillingCenter } from "@/components/billing-center";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

const labTabs = [
  { key: "profile", label: "Perfil del laboratorio" },
  { key: "fields", label: "Campos personalizados" },
  { key: "roles", label: "Roles y permisos" },
];

export function ConfigurationCenter({ session }: Readonly<{ session?: UserSession }>) {
  const canManageInstitution = session ? hasPermission(session, "configuration.manage") : false;
  const tabs = [
    { key: "my-profile", label: "Mi perfil", tutorialId: "config-tab-profile" },
    ...(canManageInstitution ? [{ key: "institution", label: "Institución y marca", tutorialId: "config-tab-institution" }] : []),
    { key: "notifications-prefs", label: "Notificaciones", tutorialId: "config-tab-notifications" },
    { key: "billing-summary", label: "Mi Plan", tutorialId: "config-tab-billing" },
    ...labTabs,
  ];
  const [activeTab, setActiveTab] = useState("my-profile");
  // El perfil activo es el incluido en el plan del laboratorio (educativo). No
  // se inicia en PHARMA_QC ni se cambia por localStorage: los demás perfiles se
  // muestran bloqueados (§3.7).
  const profile: LaboratoryProfileKey = session?.profileCode === "EDUCATIONAL_SMALL_LAB" ? "EDUCATIONAL" : "EDUCATIONAL";
  const { message: toastMessage, showToast, clearToast } = useToast();

  const selectedProfile = laboratoryProfiles.find((item) => item.key === profile) ?? laboratoryProfiles[0];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONFIGURACIÓN" title="Configuración" description="Personaliza el laboratorio, los campos, reglas, permisos y preferencias." />

      <StatGrid items={[
        { label: "Perfil activo", value: selectedProfile.name, hint: "Plantilla configurable", icon: Layers3 },
        { label: "Campos personalizados", value: "Por módulo", hint: "Inventario · Equipos · Prácticas", icon: SlidersHorizontal },
        { label: "Perfil contratado", value: "Educativo", hint: "Universidades y colegios", icon: ShieldCheck },
      ]} />

      <InlineNotice title="Configuración persistente">Las reglas y escalamientos se administran en Alertas y se guardan en PostgreSQL. Los campos personalizados conservan versiones y trazabilidad.</InlineNotice>

      <article className="panel configuration-panel">
        <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="configuration-body">
          {activeTab === "my-profile" ? <MyProfileTab /> : null}
          {activeTab === "institution" && canManageInstitution ? <InstitutionTab canManage={canManageInstitution} /> : null}
          {activeTab === "notifications-prefs" ? <NotificationsPrefsTab /> : null}
          {activeTab === "billing-summary" ? <BillingCenter /> : null}
          {activeTab === "profile" ? <ProfileTab value={profile} onLocked={() => showToast("Este perfil no está incluido en tu plan. Mejora tu plan para habilitarlo.")} /> : null}
          {activeTab === "fields" ? <CustomFieldsManager /> : null}
          {activeTab === "roles" ? <RolesTab /> : null}
        </div>
      </article>
      <Toast message={toastMessage} onClose={clearToast} />
    </div>
  );
}

function ProfileTab({ value, onLocked }: Readonly<{ value: LaboratoryProfileKey; onLocked: () => void }>) {
  return (
    <div>
      <div className="section-heading"><div><h2>Perfil del laboratorio</h2><p>Tu plan incluye el perfil educativo. Los demás perfiles están disponibles al mejorar tu plan.</p></div></div>
      <div className="profile-card-grid">
        {laboratoryProfiles.map((profile) => {
          const active = value === profile.key;
          const locked = !active;
          return (
            <button
              key={profile.key}
              type="button"
              className={`profile-card ${active ? "profile-card-active" : "profile-card-locked"}`}
              aria-disabled={locked}
              onClick={() => { if (locked) onLocked(); }}
            >
              <span className="profile-card-icon"><Boxes size={17} /></span>
              <strong>{profile.name}</strong>
              <p>{profile.description}</p>
              <small>{profile.suggestedFor}</small>
              <div>{profile.modules.map((module) => <em key={module}>{module}</em>)}</div>
              {active ? <i><CheckCircle2 size={14} /> Perfil activo</i> : <i className="profile-card-lock">Este perfil no está incluido en tu plan · Mejorar plan</i>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RolesTab() {
  return (
    <div>
      <div className="section-heading"><div><h2>Roles y permisos</h2><p>Usa permisos mínimos por función. La administración de usuarios conserva auditoría y aislamiento por laboratorio.</p></div></div>
      <div className="role-grid">
        {roleTemplates.map((role) => (
          <article key={role.key} className="role-card">
            <span><UsersRound size={16} /></span>
            <div><h3>{role.name}</h3><p>{role.description}</p><small>{role.scope}</small></div>
            <ul>{role.permissions.map((permission) => <li key={permission}><ShieldCheck size={13} /> {permission}</li>)}</ul>
          </article>
        ))}
      </div>
    </div>
  );
}
