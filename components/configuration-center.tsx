"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BellRing,
  Boxes,
  CheckCircle2,
  ChevronRight,
  FileCog,
  GitBranch,
  Layers3,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import {
  defaultAlertRules,
  laboratoryProfiles,
  roleTemplates,
  workflowTemplates,
  type AlertRule,
  type LaboratoryProfileKey,
} from "@/lib/compliance-data";
import { InlineNotice, PageIntro, StatGrid, Tabs } from "@/components/lims-ui";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { CustomFieldsManager } from "@/components/custom-fields-manager";
import { MyProfileTab, InstitutionTab, NotificationsPrefsTab } from "@/components/configuration-account-tabs";
import { BillingCenter } from "@/components/billing-center";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";

const storageKeys = {
  rules: "nexalab.demo.alert-rules",
};

const labTabs = [
  { key: "profile", label: "Perfil del laboratorio" },
  { key: "fields", label: "Campos personalizados" },
  { key: "alerts", label: "Reglas de alerta" },
  { key: "workflows", label: "Flujos" },
  { key: "roles", label: "Roles y permisos" },
];

export function ConfigurationCenter({ role }: Readonly<{ role?: UserSession["role"] }>) {
  const canManageInstitution = role ? hasPermission({ role } as UserSession, "configuration.manage") : false;
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
  const [profile] = useState<LaboratoryProfileKey>("EDUCATIONAL");
  const [rules, setRules] = useState<AlertRule[]>(defaultAlertRules);
  const [message, setMessage] = useState("Configuración vigente: versión 3 · aprobada por Calidad");
  const [historyOpen, setHistoryOpen] = useState(false);
  const { message: toastMessage, showToast, clearToast } = useToast();

  useEffect(() => {
    const savedRules = window.localStorage.getItem(storageKeys.rules);
    if (savedRules) setRules(JSON.parse(savedRules) as AlertRule[]);
  }, []);

  function persist(nextRules = rules) {
    window.localStorage.setItem(storageKeys.rules, JSON.stringify(nextRules));
    setMessage(`Cambios guardados como borrador · ${new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`);
    showToast("Borrador de configuración guardado en este navegador.");
  }

  const selectedProfile = laboratoryProfiles.find((item) => item.key === profile) ?? laboratoryProfiles[0];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONFIGURACIÓN SIN PROGRAMACIÓN" title="Centro de configuración" description="Adapta NexaLab a cada laboratorio sin perder trazabilidad ni control de versiones.">
        <button className="secondary-button" onClick={() => setHistoryOpen(true)}><FileCog size={15} /> Ver historial</button>
        <button className="primary-button" onClick={() => persist()}><Save size={15} /> Guardar borrador</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Perfil activo", value: selectedProfile.name, hint: "Plantilla configurable", icon: Layers3 },
        { label: "Campos personalizados", value: "Por módulo", hint: "Inventario · Equipos · Prácticas", icon: SlidersHorizontal },
        { label: "Reglas activas", value: String(rules.filter((rule) => rule.active).length), hint: "Alertas y recordatorios", icon: BellRing },
      ]} />

      <InlineNotice title="Cambios controlados">{message}. Al publicar una nueva versión, los registros históricos conservan la estructura y el flujo con los que fueron creados.</InlineNotice>

      <article className="panel configuration-panel">
        <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="configuration-body">
          {activeTab === "my-profile" ? <MyProfileTab /> : null}
          {activeTab === "institution" && canManageInstitution ? <InstitutionTab canManage={canManageInstitution} /> : null}
          {activeTab === "notifications-prefs" ? <NotificationsPrefsTab /> : null}
          {activeTab === "billing-summary" ? <BillingCenter /> : null}
          {activeTab === "profile" ? <ProfileTab value={profile} onLocked={() => showToast("Este perfil no está incluido en tu plan. Mejora tu plan para habilitarlo.")} /> : null}
          {activeTab === "fields" ? <CustomFieldsManager /> : null}
          {activeTab === "alerts" ? <AlertsTab rules={rules} onChange={(next) => { setRules(next); persist(next); }} /> : null}
          {activeTab === "workflows" ? <WorkflowTab onCreate={() => showToast("Nuevo flujo creado como borrador para configurar sus etapas.")} /> : null}
          {activeTab === "roles" ? <RolesTab onCreate={() => showToast("Nuevo rol creado como borrador con permisos mínimos.")} /> : null}
        </div>
      </article>
      <ActionModal open={historyOpen} title="Historial de configuración" description="Cada publicación conserva su versión y responsable." onClose={() => setHistoryOpen(false)}>
        <div className="modal-form"><div className="definition-list"><article className="definition-row"><span className="definition-icon"><FileCog size={16} /></span><div><strong>Versión 3 · vigente</strong><p>Aprobada por Calidad · perfil farmacéutico y reglas activas</p></div><small>Hoy</small><em>Publicada</em></article><article className="definition-row"><span className="definition-icon"><FileCog size={16} /></span><div><strong>Versión 2</strong><p>Ajuste de alertas de vencimiento y calibración</p></div><small>02/06/2026</small><em>Histórica</em></article></div><footer className="modal-actions"><button className="primary-button" onClick={() => setHistoryOpen(false)}>Cerrar</button></footer></div>
      </ActionModal>
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

function AlertsTab({ rules, onChange }: Readonly<{ rules: AlertRule[]; onChange: (rules: AlertRule[]) => void }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ name: "", source: "Inventario", trigger: "", severity: "Media" as AlertRule["severity"], recipients: "Jefatura", channel: "Panel + correo" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.name.trim() || !draft.trigger.trim()) return;
    onChange([...rules, { id: crypto.randomUUID(), ...draft, name: draft.name.trim(), trigger: draft.trigger.trim(), active: true }]);
    setDraft({ name: "", source: "Inventario", trigger: "", severity: "Media", recipients: "Jefatura", channel: "Panel + correo" });
    setOpen(false);
  }

  const active = useMemo(() => rules.filter((rule) => rule.active).length, [rules]);

  return (
    <div>
      <div className="section-heading">
        <div><h2>Motor de alertas</h2><p>{active} reglas activas. Cada regla define cuándo avisar, a quién y por qué canal.</p></div>
        <button className="primary-button" onClick={() => setOpen((current) => !current)}><Plus size={15} /> Nueva regla</button>
      </div>
      {open ? (
        <form className="inline-editor alert-editor" onSubmit={submit}>
          <label><span>Nombre</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Temperatura fuera de rango" /></label>
          <label><span>Origen</span><select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option>Inventario</option><option>Equipos</option><option>Prácticas</option><option>Reservas</option></select></label>
          <label><span>Condición sencilla</span><input required value={draft.trigger} onChange={(event) => setDraft({ ...draft, trigger: event.target.value })} placeholder="Ej. Temperatura > 8 °C" /></label>
          <label><span>Severidad</span><select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value as AlertRule["severity"] })}><option>Informativa</option><option>Baja</option><option>Media</option><option>Alta</option><option>Crítica</option></select></label>
          <button className="primary-button" type="submit"><Save size={15} /> Agregar</button>
        </form>
      ) : null}
      <div className="definition-list">
        {rules.map((rule) => (
          <article key={rule.id} className="definition-row rule-row">
            <span className="definition-icon"><BellRing size={16} /></span>
            <div><strong>{rule.name}</strong><p>{rule.source} · {rule.trigger}</p></div>
            <small>{rule.recipients}<br />{rule.channel}</small>
            <span className="status-pill">{rule.severity}</span>
            <button className={`switch ${rule.active ? "switch-active" : ""}`} onClick={() => onChange(rules.map((item) => item.id === rule.id ? { ...item, active: !item.active } : item))} aria-label={rule.active ? `Desactivar ${rule.name}` : `Activar ${rule.name}`}><i /></button>
          </article>
        ))}
      </div>
    </div>
  );
}

function WorkflowTab({ onCreate }: Readonly<{ onCreate: () => void }>) {
  const [selected, setSelected] = useState(workflowTemplates[0].id);
  const workflow = workflowTemplates.find((item) => item.id === selected) ?? workflowTemplates[0];
  return (
    <div>
      <div className="section-heading"><div><h2>Flujos continuos y entendibles</h2><p>Cada cambio de estado tiene responsables, requisitos y trazabilidad. Los flujos publicados se versionan.</p></div><button className="secondary-button" onClick={onCreate}><Plus size={15} /> Nuevo flujo</button></div>
      <div className="workflow-selector">
        {workflowTemplates.map((item) => <button key={item.id} className={selected === item.id ? "workflow-selector-active" : ""} onClick={() => setSelected(item.id)}><GitBranch size={15} /><span><strong>{item.name}</strong><small>{item.appliesTo} · {item.version}</small></span></button>)}
      </div>
      <div className="workflow-detail">
        {workflow.stages.map((stage, index) => (
          <article key={stage.name}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{stage.name}</strong><p>{stage.help}</p>{stage.requirement ? <small>Requisito: {stage.requirement}</small> : null}</div>
            {index < workflow.stages.length - 1 ? <ChevronRight size={17} /> : <CheckCircle2 size={17} />}
          </article>
        ))}
      </div>
    </div>
  );
}

function RolesTab({ onCreate }: Readonly<{ onCreate: () => void }>) {
  return (
    <div>
      <div className="section-heading"><div><h2>Roles sugeridos y editables</h2><p>Usa permisos mínimos por función. Un rol define qué puede ver, registrar, revisar, aprobar o configurar.</p></div><button className="secondary-button" onClick={onCreate}><Plus size={15} /> Nuevo rol</button></div>
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
