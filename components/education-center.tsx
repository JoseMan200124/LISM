"use client";

import { useState } from "react";
import { BellRing, BookOpenCheck, CalendarDays, PackageCheck, Plus, UsersRound } from "lucide-react";
import { educationalPractices as seedPractices, educationalReservations as seedReservations } from "@/lib/compliance-data";
import { QuickRecordModal, Toast, useToast } from "@/components/action-kit";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type AddTarget = "practice" | "reservation" | "student" | null;

export function EducationCenter() {
  const [tab, setTab] = useState("practices");
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [practices, setPractices] = useState<TableRow[]>(seedPractices);
  const [reservations, setReservations] = useState<TableRow[]>(seedReservations);
  const [students, setStudents] = useState<TableRow[]>([
    { name: "María Fernanda López", course: "Microbiología I", access: "Consulta", modules: "Prácticas, avisos, disponibilidad", status: "Activo" },
    { name: "Juan Pablo Gómez", course: "Laboratorio básico", access: "Consulta", modules: "Prácticas, avisos, ubicación", status: "Activo" },
  ]);
  const { message, showToast, clearToast } = useToast();

  function save(record: { name: string; detail: string; status: string }) {
    if (addTarget === "practice") {
      setPractices((current) => [{ code: `PRA-2026-${String(current.length + 23).padStart(3, "0")}`, title: record.name, course: record.detail, teacher: "Profesor asignado", scheduled: "Por programar", resources: "Pendiente de reserva", status: record.status }, ...current]);
      showToast("Práctica creada. Ya puedes programar recursos y avisos.");
    }
    if (addTarget === "reservation") {
      setReservations((current) => [{ code: `RES-2026-${String(current.length + 89).padStart(3, "0")}`, requester: "Usuario actual", practice: record.name, resource: record.detail, quantity: "Por definir", needed: "Por programar", status: record.status }, ...current]);
      showToast("Reserva creada y enviada a inventario.");
    }
    if (addTarget === "student") {
      setStudents((current) => [{ name: record.name, course: record.detail, access: "Consulta", modules: "Prácticas, avisos, disponibilidad", status: record.status }, ...current]);
      showToast("Acceso estudiantil registrado con permisos de consulta.");
    }
    setAddTarget(null);
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="PERFIL EDUCATIVO" title="Prácticas y reservas" description="Prepara actividades de laboratorio y permite consultas sencillas para docentes y estudiantes.">
        <button className="primary-button" onClick={() => setAddTarget("practice")}><Plus size={15} /> Nueva práctica</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Prácticas próximas", value: String(practices.length), hint: "Cronograma visible", icon: CalendarDays },
        { label: "Reservas", value: String(reservations.length), hint: "Preparación trazable", icon: PackageCheck },
        { label: "Estudiantes visibles", value: String(students.length), hint: "Solo lectura autorizada", icon: UsersRound },
      ]} />
      <InlineNotice title="Acceso simplificado">Los estudiantes consultan prácticas, disponibilidad y ubicaciones autorizadas. No pueden modificar inventario, aprobar salidas ni consultar información sensible.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "practices", label: "Prácticas" }, { key: "reservations", label: "Reservas" }, { key: "notifications", label: "Avisos" }, { key: "students", label: "Acceso estudiantil" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "practices" ? <EducationSection title="Cronograma de prácticas" copy="Cada actividad puede reservar materiales, equipos y reactivos con antelación." action="Agregar práctica" onAdd={() => setAddTarget("practice")}><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "teacher", label: "Responsable" }, { key: "scheduled", label: "Fecha" }, { key: "resources", label: "Recursos" }, { key: "status", label: "Estado" }]} rows={practices} /></EducationSection> : null}
          {tab === "reservations" ? <EducationSection title="Solicitudes y reservas" copy="Inventario confirma disponibilidad y deja listos los materiales antes de cada práctica." action="Agregar reserva" onAdd={() => setAddTarget("reservation")}><SimpleTable columns={[{ key: "code", label: "Reserva" }, { key: "requester", label: "Solicitante" }, { key: "practice", label: "Práctica" }, { key: "resource", label: "Recurso" }, { key: "quantity", label: "Cantidad" }, { key: "needed", label: "Requerido" }, { key: "status", label: "Estado" }]} rows={reservations} /></EducationSection> : null}
          {tab === "notifications" ? <NotificationCards /> : null}
          {tab === "students" ? <EducationSection title="Usuarios de consulta" copy="Los permisos son mínimos y pueden limitarse por curso, práctica o periodo académico." action="Agregar estudiante" onAdd={() => setAddTarget("student")}><SimpleTable columns={[{ key: "name", label: "Estudiante" }, { key: "course", label: "Curso" }, { key: "access", label: "Acceso" }, { key: "modules", label: "Puede consultar" }, { key: "status", label: "Estado" }]} rows={students} /></EducationSection> : null}
        </div>
      </article>
      <QuickRecordModal open={Boolean(addTarget)} title={addTarget === "reservation" ? "Nueva reserva" : addTarget === "student" ? "Nuevo acceso estudiantil" : "Nueva práctica"} description="Completa la referencia y el detalle principal. Los datos ampliados pueden ajustarse desde el registro creado." onClose={() => setAddTarget(null)} onSave={save} />
      <Toast message={message} onClose={clearToast} />
    </div>
  );
}

function EducationSection({ title, copy, children, action, onAdd }: Readonly<{ title: string; copy: string; children: React.ReactNode; action: string; onAdd: () => void }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button" onClick={onAdd}><Plus size={15} /> {action}</button></div>{children}</section>;
}

function NotificationCards() {
  return <section><div className="section-heading"><div><h2>Avisos educativos</h2><p>Las alertas se configuran con la misma herramienta del resto del sistema.</p></div></div><div className="mini-card-grid"><article><BellRing size={18} /><h3>Recordatorio de práctica</h3><p>Avisa 24 horas antes a docentes y estudiantes inscritos.</p></article><article><PackageCheck size={18} /><h3>Material pendiente</h3><p>Notifica a inventario si una reserva aún no está preparada.</p></article><article><BookOpenCheck size={18} /><h3>Instrucciones previas</h3><p>Comparte una guía o documento vigente antes de ingresar al laboratorio.</p></article></div></section>;
}
