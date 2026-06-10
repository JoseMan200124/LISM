"use client";

import { useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, Clock3, Plus, Route, ShieldAlert } from "lucide-react";
import { defaultAlertRules } from "@/lib/compliance-data";
import { incidentRows } from "@/lib/demo-data";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs } from "@/components/lims-ui";

export function AlertsCenter() {
  const [tab, setTab] = useState("active");
  const rules = defaultAlertRules.map((rule) => ({ ...rule, active: rule.active ? "Activa" : "Inactiva" }));
  const escalations = [
    { code: "ESC-01", rule: "Calibración vencida", first: "Calidad", after: "Jefatura después de 2 h", final: "Administrador después de 8 h", status: "Activa" },
    { code: "ESC-02", rule: "Resultado fuera de especificación", first: "Analista y revisor", after: "Calidad después de 30 min", final: "Jefatura después de 2 h", status: "Activa" },
    { code: "ESC-03", rule: "Reserva educativa pendiente", first: "Inventario", after: "Profesor después de 4 h", final: "Jefatura después de 12 h", status: "Activa" },
  ];

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CONTROL OPERATIVO" title="Alertas, incidencias y escalamiento" description="Atiende primero lo crítico y configura avisos útiles sin saturar a los usuarios.">
        <button className="primary-button"><Plus size={15} /> Nueva incidencia</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Abiertas", value: "3", hint: "Una prioridad alta", icon: AlertTriangle },
        { label: "Reglas configuradas", value: String(defaultAlertRules.length), hint: "Por fecha, evento o condición", icon: BellRing },
        { label: "Tiempo medio de atención", value: "42 min", hint: "−8 min este mes", icon: Clock3 },
      ]} />
      <InlineNotice title="Evita el ruido">Las alertas se agrupan, dejan de repetirse al ser reconocidas y escalan únicamente cuando no reciben atención dentro del tiempo definido.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "active", label: "Incidencias activas" }, { key: "rules", label: "Reglas" }, { key: "escalations", label: "Escalamientos" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "active" ? <AlertSection title="Incidencias y seguimiento" copy="Cada alerta puede asignarse, reconocerse, investigarse y cerrarse con evidencia."><SimpleTable columns={[{ key: "id", label: "Incidencia" }, { key: "type", label: "Tipo" }, { key: "title", label: "Descripción" }, { key: "severity", label: "Severidad" }, { key: "owner", label: "Responsable" }, { key: "opened", label: "Creada" }, { key: "status", label: "Estado" }]} rows={incidentRows} /></AlertSection> : null}
          {tab === "rules" ? <AlertSection title="Reglas sencillas y personalizables" copy="Estas reglas son plantillas iniciales. El administrador puede crear más desde Configuración."><SimpleTable columns={[{ key: "name", label: "Regla" }, { key: "source", label: "Origen" }, { key: "trigger", label: "Condición" }, { key: "severity", label: "Severidad" }, { key: "recipients", label: "Destinatarios" }, { key: "channel", label: "Canal" }, { key: "active", label: "Estado" }]} rows={rules} /></AlertSection> : null}
          {tab === "escalations" ? <AlertSection title="Rutas de escalamiento" copy="Una ruta define a quién informar cuando una alerta no ha sido atendida."><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "rule", label: "Regla" }, { key: "first", label: "Primer aviso" }, { key: "after", label: "Escalamiento" }, { key: "final", label: "Escalamiento final" }, { key: "status", label: "Estado" }]} rows={escalations} /></AlertSection> : null}
        </div>
      </article>
    </div>
  );
}

function AlertSection({ title, copy, children }: Readonly<{ title: string; copy: string; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button"><CheckCircle2 size={15} /> Revisar flujo</button></div>{children}</section>;
}
