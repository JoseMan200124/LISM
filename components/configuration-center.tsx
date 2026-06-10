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
  defaultCustomFields,
  laboratoryProfiles,
  roleTemplates,
  workflowTemplates,
  type AlertRule,
  type CustomFieldDefinition,
  type LaboratoryProfileKey,
} from "@/lib/compliance-data";
import { InlineNotice, PageIntro, StatGrid, Tabs } from "@/components/lims-ui";

const storageKeys = {
  profile: "nexalab.demo.profile",
  fields: "nexalab.demo.custom-fields",
  rules: "nexalab.demo.alert-rules",
};

const tabs = [
  { key: "profile", label: "Perfil del laboratorio" },
  { key: "fields", label: "Campos personalizados" },
  { key: "alerts", label: "Reglas de alerta" },
  { key: "workflows", label: "Flujos" },
  { key: "roles", label: "Roles y permisos" },
];

export function ConfigurationCenter() {
  const [activeTab, setActiveTab] = useState("profile");
  const [profile, setProfile] = useState<LaboratoryProfileKey>("PHARMA_QC");
  const [fields, setFields] = useState<CustomFieldDefinition[]>(defaultCustomFields);
  const [rules, setRules] = useState<AlertRule[]>(defaultAlertRules);
  const [message, setMessage] = useState("Configuración vigente: versión 3 · aprobada por Calidad");

  useEffect(() => {
    const savedProfile = window.localStorage.getItem(storageKeys.profile) as LaboratoryProfileKey | null;
    const savedFields = window.localStorage.getItem(storageKeys.fields);
    const savedRules = window.localStorage.getItem(storageKeys.rules);
    if (savedProfile) setProfile(savedProfile);
    if (savedFields) setFields(JSON.parse(savedFields) as CustomFieldDefinition[]);
    if (savedRules) setRules(JSON.parse(savedRules) as AlertRule[]);
  }, []);

  function persist(nextProfile = profile, nextFields = fields, nextRules = rules) {
    window.localStorage.setItem(storageKeys.profile, nextProfile);
    window.localStorage.setItem(storageKeys.fields, JSON.stringify(nextFields));
    window.localStorage.setItem(storageKeys.rules, JSON.stringify(nextRules));
    setMessage(`Cambios guardados como borrador · ${new Date().toLocaleTimeString("es-GT", { hour: "2-digit", minute: "2-digit" })}`);
  }

  const selectedProfile = laboratoryProfiles.find((item) => item.key === profile) ?? laboratoryProfiles[0];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONFIGURACIÓN SIN PROGRAMACIÓN" title="Centro de configuración" description="Adapta NexaLab a cada laboratorio sin perder trazabilidad ni control de versiones.">
        <button className="secondary-button"><FileCog size={15} /> Ver historial</button>
        <button className="primary-button" onClick={() => persist()}><Save size={15} /> Guardar borrador</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Perfil activo", value: selectedProfile.name, hint: "Plantilla configurable", icon: Layers3 },
        { label: "Campos adicionales", value: String(fields.length), hint: "Versionados por módulo", icon: SlidersHorizontal },
        { label: "Reglas activas", value: String(rules.filter((rule) => rule.active).length), hint: "Alertas y recordatorios", icon: BellRing },
      ]} />

      <InlineNotice title="Cambios controlados">{message}. Al publicar una nueva versión, los registros históricos conservan la estructura y el flujo con los que fueron creados.</InlineNotice>

      <article className="panel configuration-panel">
        <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="configuration-body">
          {activeTab === "profile" ? <ProfileTab value={profile} onChange={(value) => { setProfile(value); persist(value, fields, rules); }} /> : null}
          {activeTab === "fields" ? <FieldsTab fields={fields} onChange={(next) => { setFields(next); persist(profile, next, rules); }} /> : null}
          {activeTab === "alerts" ? <AlertsTab rules={rules} onChange={(next) => { setRules(next); persist(profile, fields, next); }} /> : null}
          {activeTab === "workflows" ? <WorkflowTab /> : null}
          {activeTab === "roles" ? <RolesTab /> : null}
        </div>
      </article>
    </div>
  );
}

function ProfileTab({ value, onChange }: Readonly<{ value: LaboratoryProfileKey; onChange: (value: LaboratoryProfileKey) => void }>) {
  return (
    <div>
      <div className="section-heading"><div><h2>Selecciona una base de trabajo</h2><p>La plantilla habilita módulos y ejemplos iniciales. Después puedes ajustar campos, reglas y flujos.</p></div></div>
      <div className="profile-card-grid">
        {laboratoryProfiles.map((profile) => (
          <button key={profile.key} className={`profile-card ${value === profile.key ? "profile-card-active" : ""}`} onClick={() => onChange(profile.key)}>
            <span className="profile-card-icon"><Boxes size={17} /></span>
            <strong>{profile.name}</strong>
            <p>{profile.description}</p>
            <small>{profile.suggestedFor}</small>
            <div>{profile.modules.map((module) => <em key={module}>{module}</em>)}</div>
            {value === profile.key ? <i><CheckCircle2 size={14} /> Perfil activo</i> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function FieldsTab({ fields, onChange }: Readonly<{ fields: CustomFieldDefinition[]; onChange: (fields: CustomFieldDefinition[]) => void }>) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ module: "Reactivos", label: "", type: "Texto", required: "Opcional", visibility: "Todos" });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.label.trim()) return;
    onChange([...fields, { id: crypto.randomUUID(), ...draft, label: draft.label.trim(), version: "borrador" }]);
    setDraft({ module: "Reactivos", label: "", type: "Texto", required: "Opcional", visibility: "Todos" });
    setOpen(false);
  }

  return (
    <div>
      <div className="section-heading">
        <div><h2>Constructor de formularios</h2><p>Añade información propia sin cambiar el código. Los campos críticos del núcleo no pueden eliminarse.</p></div>
        <button className="primary-button" onClick={() => setOpen((current) => !current)}><Plus size={15} /> Nuevo campo</button>
      </div>
      {open ? (
        <form className="inline-editor" onSubmit={submit}>
          <label><span>Módulo</span><select value={draft.module} onChange={(event) => setDraft({ ...draft, module: event.target.value })}><option>Reactivos</option><option>Inventario</option><option>Equipos</option><option>Muestras</option><option>Prácticas</option><option>Resultados</option></select></label>
          <label><span>Nombre visible</span><input required value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Ej. Temperatura máxima" /></label>
          <label><span>Tipo</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option>Texto</option><option>Número</option><option>Fecha</option><option>Archivo</option><option>Selección</option><option>Número + unidad</option></select></label>
          <label><span>Obligatoriedad</span><select value={draft.required} onChange={(event) => setDraft({ ...draft, required: event.target.value })}><option>Opcional</option><option>Obligatorio</option><option>Condicional</option><option>Según categoría</option></select></label>
          <button className="primary-button" type="submit"><Save size={15} /> Agregar</button>
        </form>
      ) : null}
      <div className="definition-list">
        {fields.map((field) => (
          <article key={field.id} className="definition-row">
            <span className="definition-icon"><SlidersHorizontal size={16} /></span>
            <div><strong>{field.label}</strong><p>{field.module} · {field.type} · {field.required}</p></div>
            <small>{field.visibility}</small>
            <em>{field.version}</em>
          </article>
        ))}
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
          <label><span>Origen</span><select value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option>Inventario</option><option>Reactivos</option><option>Equipos</option><option>Resultados</option><option>Bitácoras</option><option>Educativo</option><option>Documentos</option></select></label>
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

function WorkflowTab() {
  const [selected, setSelected] = useState(workflowTemplates[0].id);
  const workflow = workflowTemplates.find((item) => item.id === selected) ?? workflowTemplates[0];
  return (
    <div>
      <div className="section-heading"><div><h2>Flujos continuos y entendibles</h2><p>Cada cambio de estado tiene responsables, requisitos y trazabilidad. Los flujos publicados se versionan.</p></div><button className="secondary-button"><Plus size={15} /> Nuevo flujo</button></div>
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

function RolesTab() {
  return (
    <div>
      <div className="section-heading"><div><h2>Roles sugeridos y editables</h2><p>Usa permisos mínimos por función. Un rol define qué puede ver, registrar, revisar, aprobar o configurar.</p></div><button className="secondary-button"><Plus size={15} /> Nuevo rol</button></div>
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
