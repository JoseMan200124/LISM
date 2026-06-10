"use client";

import { useState } from "react";
import { BellRing, BookOpenCheck, CalendarDays, GraduationCap, PackageCheck, Plus, UsersRound } from "lucide-react";
import { educationalPractices, educationalReservations } from "@/lib/compliance-data";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs } from "@/components/lims-ui";

export function EducationCenter() {
  const [tab, setTab] = useState("practices");
  return (
    <div className="page-stack">
      <PageIntro eyebrow="PERFIL EDUCATIVO" title="Prácticas y reservas" description="Prepara actividades de laboratorio y permite consultas sencillas para docentes y estudiantes.">
        <button className="primary-button"><Plus size={15} /> Nueva práctica</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Prácticas próximas", value: "2", hint: "Una programada para mañana", icon: CalendarDays },
        { label: "Reservas pendientes", value: "1", hint: "Requiere preparación", icon: PackageCheck },
        { label: "Estudiantes con acceso", value: "34", hint: "Solo lectura autorizada", icon: UsersRound },
      ]} />
      <InlineNotice title="Acceso simplificado">Los estudiantes consultan prácticas, disponibilidad y ubicaciones autorizadas. No pueden modificar inventario, aprobar salidas ni consultar información sensible.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "practices", label: "Prácticas" }, { key: "reservations", label: "Reservas" }, { key: "notifications", label: "Avisos" }, { key: "students", label: "Acceso estudiantil" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "practices" ? <EducationSection title="Cronograma de prácticas" copy="Cada actividad puede reservar materiales, equipos y reactivos con antelación."><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "teacher", label: "Responsable" }, { key: "scheduled", label: "Fecha" }, { key: "resources", label: "Recursos" }, { key: "status", label: "Estado" }]} rows={educationalPractices} /></EducationSection> : null}
          {tab === "reservations" ? <EducationSection title="Solicitudes y reservas" copy="Inventario confirma disponibilidad y deja listos los materiales antes de cada práctica."><SimpleTable columns={[{ key: "code", label: "Reserva" }, { key: "requester", label: "Solicitante" }, { key: "practice", label: "Práctica" }, { key: "resource", label: "Recurso" }, { key: "quantity", label: "Cantidad" }, { key: "needed", label: "Requerido" }, { key: "status", label: "Estado" }]} rows={educationalReservations} /></EducationSection> : null}
          {tab === "notifications" ? <NotificationCards /> : null}
          {tab === "students" ? <StudentAccess /> : null}
        </div>
      </article>
    </div>
  );
}

function EducationSection({ title, copy, children }: Readonly<{ title: string; copy: string; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button"><Plus size={15} /> Agregar</button></div>{children}</section>;
}

function NotificationCards() {
  return <section><div className="section-heading"><div><h2>Avisos educativos</h2><p>Las alertas se configuran con la misma herramienta del resto del sistema.</p></div></div><div className="mini-card-grid"><article><BellRing size={18} /><h3>Recordatorio de práctica</h3><p>Avisa 24 horas antes a docentes y estudiantes inscritos.</p></article><article><PackageCheck size={18} /><h3>Material pendiente</h3><p>Notifica a inventario si una reserva aún no está preparada.</p></article><article><BookOpenCheck size={18} /><h3>Instrucciones previas</h3><p>Comparte una guía o documento vigente antes de ingresar al laboratorio.</p></article></div></section>;
}

function StudentAccess() {
  const rows = [
    { name: "María Fernanda López", course: "Microbiología I", access: "Consulta", modules: "Prácticas, avisos, disponibilidad", status: "Activo" },
    { name: "Juan Pablo Gómez", course: "Laboratorio básico", access: "Consulta", modules: "Prácticas, avisos, ubicación", status: "Activo" },
  ];
  return <EducationSection title="Usuarios de consulta" copy="Los permisos son mínimos y pueden limitarse por curso, práctica o periodo académico."><SimpleTable columns={[{ key: "name", label: "Estudiante" }, { key: "course", label: "Curso" }, { key: "access", label: "Acceso" }, { key: "modules", label: "Puede consultar" }, { key: "status", label: "Estado" }]} rows={rows} /></EducationSection>;
}
