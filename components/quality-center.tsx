"use client";

import { useState } from "react";
import { AlertTriangle, BookOpenCheck, CheckCircle2, ClipboardCheck, FileSignature, GraduationCap, Leaf, Plus, ShieldCheck } from "lucide-react";
import { qualityRecords } from "@/lib/compliance-data";
import { ActionModal, QuickRecordModal, Toast, useToast } from "@/components/action-kit";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs } from "@/components/lims-ui";

const tabs = [
  { key: "oos", label: "OOS / OOT" },
  { key: "capa", label: "CAPA" },
  { key: "documents", label: "Documentos" },
  { key: "environmental", label: "Ambiental" },
  { key: "logbooks", label: "Bitácoras" },
  { key: "training", label: "Competencia" },
  { key: "signatures", label: "Firmas" },
];

export function QualityCenter({ initialTab = "oos" }: Readonly<{ initialTab?: string }>) {
  const [tab, setTab] = useState(initialTab);
  const [newOpen, setNewOpen] = useState(false);
  const [flowOpen, setFlowOpen] = useState(false);
  const [created, setCreated] = useState(0);
  const { message, showToast, clearToast } = useToast();

  return (
    <div className="page-stack">
      <PageIntro eyebrow="CALIDAD INTEGRADA" title="Calidad, evidencia y mejora" description="Gestiona desviaciones, acciones, documentos y registros sin perder el historial original.">
        <button className="primary-button" onClick={() => setNewOpen(true)}><Plus size={15} /> Nuevo registro</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Investigaciones abiertas", value: String(2 + created), hint: "OOS y OOT en seguimiento", icon: AlertTriangle },
        { label: "CAPA activas", value: "2", hint: "Una en verificación", icon: ClipboardCheck },
        { label: "Evidencia vigente", value: "96%", hint: "Documentos y competencia", icon: ShieldCheck },
      ]} />
      <InlineNotice title="Regla de oro">Los resultados originales, versiones previas y firmas nunca se reemplazan. Toda corrección crea una nueva revisión trazable.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={tabs} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "oos" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Investigaciones OOS y OOT" copy="Cuando un resultado queda fuera de especificación o muestra una tendencia anormal, el sistema abre un expediente guiado." icon={<AlertTriangle size={17} />} table={<SimpleTable columns={[{ key: "code", label: "Código" }, { key: "source", label: "Origen" }, { key: "detail", label: "Detalle" }, { key: "phase", label: "Etapa" }, { key: "owner", label: "Responsable" }, { key: "due", label: "Objetivo" }, { key: "status", label: "Estado" }]} rows={qualityRecords.oos} searchPlaceholder="Buscar investigación…" />} /> : null}
          {tab === "capa" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Acciones correctivas y preventivas" copy="Documenta la causa, las acciones, sus responsables y la comprobación de efectividad." icon={<ClipboardCheck size={17} />} table={<SimpleTable columns={[{ key: "code", label: "Código" }, { key: "origin", label: "Origen" }, { key: "action", label: "Acción" }, { key: "owner", label: "Responsable" }, { key: "target", label: "Fecha objetivo" }, { key: "status", label: "Estado" }]} rows={qualityRecords.capa} />} /> : null}
          {tab === "documents" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Documentos controlados" copy="SOP, POE, instructivos, protocolos y formatos conservan versiones, vigencia y aprobaciones." icon={<BookOpenCheck size={17} />} table={<SimpleTable columns={[{ key: "code", label: "Código" }, { key: "title", label: "Documento" }, { key: "version", label: "Versión" }, { key: "validFrom", label: "Vigente desde" }, { key: "review", label: "Próxima revisión" }, { key: "status", label: "Estado" }]} rows={qualityRecords.documents} />} /> : null}
          {tab === "environmental" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Monitoreo ambiental" copy="Registra resultados por punto y activa alertas según límites configurados por el laboratorio." icon={<Leaf size={17} />} table={<SimpleTable columns={[{ key: "point", label: "Punto" }, { key: "type", label: "Tipo" }, { key: "area", label: "Área" }, { key: "result", label: "Resultado" }, { key: "alert", label: "Alerta" }, { key: "action", label: "Acción" }, { key: "trend", label: "Tendencia" }, { key: "status", label: "Estado" }]} rows={qualityRecords.environmental} />} /> : null}
          {tab === "logbooks" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Bitácoras electrónicas" copy="Crea plantillas sencillas para temperatura, limpieza, humedad, verificaciones e incidencias." icon={<BookOpenCheck size={17} />} table={<SimpleTable columns={[{ key: "code", label: "Código" }, { key: "template", label: "Plantilla" }, { key: "frequency", label: "Frecuencia" }, { key: "responsible", label: "Responsable" }, { key: "last", label: "Último registro" }, { key: "status", label: "Estado" }]} rows={qualityRecords.logbooks} />} /> : null}
          {tab === "training" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Capacitación y competencia" copy="Autoriza personas por método, equipo o actividad y controla la vigencia de la evidencia." icon={<GraduationCap size={17} />} table={<SimpleTable columns={[{ key: "person", label: "Persona" }, { key: "role", label: "Rol" }, { key: "qualification", label: "Autorización" }, { key: "validUntil", label: "Vigente hasta" }, { key: "evidence", label: "Evidencia" }, { key: "status", label: "Estado" }]} rows={qualityRecords.training} />} /> : null}
          {tab === "signatures" ? <QualitySection onFlow={() => setFlowOpen(true)} title="Firmas electrónicas vinculadas" copy="Cada firma registra la identidad, el significado, el momento y la huella del contenido aprobado." icon={<FileSignature size={17} />} table={<SimpleTable columns={[{ key: "code", label: "Firma" }, { key: "actor", label: "Firmante" }, { key: "meaning", label: "Significado" }, { key: "object", label: "Registro" }, { key: "signedAt", label: "Momento" }, { key: "hash", label: "Huella" }]} rows={qualityRecords.signatures} />} /> : null}
        </div>
      </article>
      <QuickRecordModal open={newOpen} title="Nuevo registro de calidad" description="Registra el hallazgo o evidencia. El sistema mantiene versiones y trazabilidad." onClose={() => setNewOpen(false)} onSave={(record) => { setCreated((current) => current + 1); showToast(`Registro “${record.name}” creado en calidad.`); }} />
      <ActionModal open={flowOpen} title="Flujo controlado de calidad" description="El flujo conserva el dato original y crea revisiones trazables." onClose={() => setFlowOpen(false)}><div className="modal-form"><ol className="compact-flow"><li>Registrar evidencia u observación.</li><li>Asignar responsable y fecha objetivo.</li><li>Revisar, adjuntar respaldo y aprobar.</li><li>Cerrar con firma o crear CAPA cuando aplique.</li></ol><footer className="modal-actions"><button className="primary-button" onClick={() => setFlowOpen(false)}>Entendido</button></footer></div></ActionModal>
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function QualitySection({ title, copy, icon, table, onFlow }: Readonly<{ title: string; copy: string; icon: React.ReactNode; table: React.ReactNode; onFlow: () => void }>) {
  return <section className="quality-section"><div className="section-heading"><div><h2>{icon} {title}</h2><p>{copy}</p></div><button className="secondary-button" onClick={onFlow}><CheckCircle2 size={15} /> Ver flujo</button></div>{table}</section>;
}
