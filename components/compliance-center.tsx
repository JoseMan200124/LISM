"use client";

import { useMemo, useState } from "react";
import { BookCheck, CheckCircle2, CircleAlert, CircleDashed, FileCheck2, ShieldCheck } from "lucide-react";
import { complianceControls } from "@/lib/compliance-data";
import { InlineNotice, PageIntro, RuleState, StatGrid } from "@/components/lims-ui";
import { Toast, downloadCsv, useToast } from "@/components/action-kit";

const standards = ["Todos", ...Array.from(new Set(complianceControls.map((item) => item.standard)))];

export function ComplianceCenter() {
  const [selected, setSelected] = useState("Todos");
  const { message, showToast, clearToast } = useToast();
  const filtered = useMemo(() => selected === "Todos" ? complianceControls : complianceControls.filter((item) => item.standard === selected), [selected]);
  const implemented = complianceControls.filter((item) => item.state === "IMPLEMENTED").length;
  const configure = complianceControls.filter((item) => item.state === "CONFIGURE").length;
  const procedure = complianceControls.filter((item) => item.state === "PROCEDURE").length;

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CALIDAD Y CUMPLIMIENTO" title="Centro de cumplimiento" description="Consulta cómo cada control del sistema apoya los requisitos aplicables y qué debe completar el laboratorio.">
        <button className="secondary-button" onClick={() => { downloadCsv("nexalab-matriz-cumplimiento.csv", filtered); showToast("Matriz de cumplimiento exportada en CSV."); }}><FileCheck2 size={15} /> Exportar matriz</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Controles implementados", value: String(implemented), hint: "Disponibles en la plataforma", icon: CheckCircle2 },
        { label: "Por configurar", value: String(configure), hint: "Dependen del laboratorio", icon: CircleAlert },
        { label: "Procedimientos externos", value: String(procedure), hint: "Requieren evidencia organizacional", icon: CircleDashed },
      ]} />

      <InlineNotice title="Cumplimiento asistido, no certificación automática">NexaLab conserva evidencia, controles y trazabilidad. La acreditación también requiere procedimientos, validación, capacitación, auditorías y aprobación formal del laboratorio.</InlineNotice>

      <article className="panel compliance-panel">
        <div className="section-heading compliance-heading">
          <div><h2>Matriz simplificada de controles</h2><p>Filtra por marco normativo y revisa la evidencia esperada.</p></div>
          <label className="compact-select"><span>Marco</span><select value={selected} onChange={(event) => setSelected(event.target.value)}>{standards.map((standard) => <option key={standard}>{standard}</option>)}</select></label>
        </div>
        <div className="compliance-list">
          {filtered.map((control) => (
            <article className="compliance-card" key={control.id}>
              <header><span><BookCheck size={15} /> {control.standard}</span><RuleState state={control.state} /></header>
              <div className="compliance-card-grid">
                <div><small>Área</small><strong>{control.area}</strong></div>
                <div><small>Requisito</small><strong>{control.requirement}</strong></div>
                <div><small>Responsable sugerido</small><strong>{control.owner}</strong></div>
              </div>
              <p><ShieldCheck size={15} /><span><strong>Cómo lo apoya NexaLab:</strong> {control.implementation}</span></p>
              <p><FileCheck2 size={15} /><span><strong>Evidencia esperada:</strong> {control.evidence}</span></p>
            </article>
          ))}
        </div>
      </article>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}
