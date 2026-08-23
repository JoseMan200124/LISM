"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  CheckCircle2,
} from "lucide-react";
import {
  laboratoryProfiles,
  type LaboratoryProfileKey,
} from "@/lib/compliance-data";
import { InlineNotice, PageIntro, Tabs } from "@/components/lims-ui";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { CustomFieldsManager } from "@/components/custom-fields-manager";
import { MyProfileTab, InstitutionTab, NotificationsPrefsTab } from "@/components/configuration-account-tabs";
import { BillingCenter } from "@/components/billing-center";
import { hasPermission } from "@/lib/authorization";
import type { UserSession } from "@/lib/session";
import { DEMO_LAB_PROFILE, RESEARCH_LAB_PROFILE } from "@/lib/lab-profile";
import { SignatureSetup } from "@/components/signature";
import {
  DEFAULT_SIGNATURE_POLICY,
  SIGNATURE_POLICY_KEYS,
  SIGNATURE_POLICY_LABEL,
  type SignaturePolicy,
  type SignaturePolicyKey,
} from "@/lib/signatures";

const labTabs = [
  { key: "profile", label: "Perfil del laboratorio" },
  { key: "fields", label: "Campos personalizados" },
];

// Perfiles que el laboratorio puede activar por sí mismo. Los demás siguen
// mostrándose bloqueados como parte del plan.
const SELECTABLE_PROFILES = [
  {
    code: DEMO_LAB_PROFILE,
    name: "Laboratorio educativo",
    description: "Inventario, equipos, prácticas, reservas y avisos para colegios y universidades.",
    modules: ["Inventario", "Equipos", "Programa", "Compras", "Alertas"],
  },
  {
    code: RESEARCH_LAB_PROFILE,
    name: "Laboratorio de investigación",
    description: "Trabajo por proyecto o por muestra: además de los recursos, activa proyectos, protocolos, muestras, biobancos, cuaderno electrónico y gestión documental.",
    modules: ["Proyectos", "Protocolos y SOP", "Muestras", "Biobancos", "Cuaderno electrónico", "Gestión documental"],
  },
] as const;

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

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONFIGURACIÓN" title="Configuración" description="Personaliza el laboratorio, los campos, reglas, permisos y preferencias." />

      <article className="panel configuration-panel">
        <Tabs items={tabs} active={activeTab} onChange={setActiveTab} />
        <div className="configuration-body">
          {activeTab === "my-profile" ? (
            <>
              <MyProfileTab />
              <section className="configuration-section">
                <div className="section-heading">
                  <div>
                    <h2>Mi firma electrónica</h2>
                    <p>Se estampa cuando solicitas o autorizas una compra y cuando pides o autorizas el uso de un reactivo controlado.</p>
                  </div>
                </div>
                <SignatureSetup fallbackName={session?.name ?? ""} />
              </section>
            </>
          ) : null}
          {activeTab === "institution" && canManageInstitution ? <InstitutionTab canManage={canManageInstitution} /> : null}
          {activeTab === "notifications-prefs" ? <NotificationsPrefsTab /> : null}
          {activeTab === "billing-summary" ? <BillingCenter /> : null}
          {activeTab === "profile" ? (
            <>
              <LabProfileSelector
                current={session?.profileCode ?? DEMO_LAB_PROFILE}
                canManage={canManageInstitution}
                onSaved={(message) => showToast(message)}
              />
              <ProfileTab value={profile} onLocked={() => showToast("Este perfil no está incluido en tu plan. Mejora tu plan para habilitarlo.")} />
            </>
          ) : null}
          {activeTab === "fields" ? <CustomFieldsManager /> : null}
        </div>
      </article>
      <Toast message={toastMessage} onClose={clearToast} />
    </div>
  );
}

/**
 * Selector del perfil de laboratorio. Cambiarlo reordena la navegación al
 * instante: el perfil viaja en la sesión y el servidor la vuelve a firmar.
 */
function LabProfileSelector({
  current,
  canManage,
  onSaved,
}: Readonly<{ current: string; canManage: boolean; onSaved: (message: string) => void }>) {
  const [saving, setSaving] = useState<string | null>(null);
  const [policy, setPolicy] = useState<SignaturePolicy>(DEFAULT_SIGNATURE_POLICY);

  useEffect(() => {
    if (!canManage) return;
    let active = true;
    void fetch("/api/configuration/profile")
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null)
      .then((payload: { data?: { signaturePolicy?: SignaturePolicy } } | null) => {
        if (active && payload?.data?.signaturePolicy) setPolicy(payload.data.signaturePolicy);
      });
    return () => { active = false; };
  }, [canManage]);

  async function selectProfile(profileCode: string) {
    if (profileCode === current) return;
    setSaving(profileCode);
    try {
      const response = await fetch("/api/configuration/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileCode }),
      });
      if (!response.ok) throw new Error();
      onSaved("Perfil del laboratorio actualizado. Actualizando módulos…");
      // La navegación depende del perfil: se recarga para aplicarlo.
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      onSaved("No se pudo cambiar el perfil del laboratorio.");
      setSaving(null);
    }
  }

  async function togglePolicy(key: SignaturePolicyKey, value: boolean) {
    const next = { ...policy, [key]: value };
    setPolicy(next);
    try {
      await fetch("/api/configuration/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signaturePolicy: { [key]: value } }),
      });
    } catch {
      onSaved("No se pudo guardar la política de firma.");
    }
  }

  return (
    <div className="configuration-section">
      <div className="section-heading">
        <div>
          <h2>Tipo de laboratorio</h2>
          <p>Define qué módulos se muestran. Cambiarlo no elimina información: los módulos que se ocultan conservan sus datos.</p>
        </div>
      </div>
      <div className="profile-card-grid">
        {SELECTABLE_PROFILES.map((profile) => {
          const active = current === profile.code;
          return (
            <button
              key={profile.code}
              type="button"
              className={`profile-card ${active ? "profile-card-active" : ""}`}
              disabled={!canManage || Boolean(saving)}
              onClick={() => void selectProfile(profile.code)}
            >
              <span className="profile-card-icon"><Boxes size={17} /></span>
              <strong>{profile.name}</strong>
              <p>{profile.description}</p>
              <div>{profile.modules.map((module) => <em key={module}>{module}</em>)}</div>
              {active ? <i><CheckCircle2 size={14} /> Perfil activo</i> : <i>{saving === profile.code ? "Activando…" : "Activar este perfil"}</i>}
            </button>
          );
        })}
      </div>

      {canManage ? (
        <>
          <div className="section-heading" style={{ marginTop: 18 }}>
            <div>
              <h2>Firma electrónica obligatoria</h2>
              <p>Elige qué actos exigen la firma de quien los realiza. Por omisión se exige en todos.</p>
            </div>
          </div>
          <div className="signature-policy-list">
            {SIGNATURE_POLICY_KEYS.map((key) => (
              <label className="check-line" key={key}>
                <input type="checkbox" checked={policy[key]} onChange={(event) => void togglePolicy(key, event.target.checked)} />
                <span>{SIGNATURE_POLICY_LABEL[key]}</span>
              </label>
            ))}
          </div>
        </>
      ) : null}
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
