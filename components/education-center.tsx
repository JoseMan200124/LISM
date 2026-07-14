"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  PackageCheck,
  Plus,
  UsersRound,
} from "lucide-react";
import type { UserSession } from "@/lib/session";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";

type PracticeRow = TableRow & {
  id?: string;
  practice_code?: string;
  code?: string;
  title?: string;
  course_name?: string;
  teacher_name?: string;
  starts_at?: string;
  status?: string;
};

type ReservationRow = TableRow & {
  id?: string;
  reservation_code?: string;
  resource_type?: string;
  resource_name?: string;
  practice_title?: string;
  quantity?: number;
  unit?: string;
  status?: string;
};

type NotificationRow = TableRow & {
  id?: string;
  title?: string;
  body?: string;
  audience?: string;
  publish_at?: string;
  practice_title?: string;
  group_name?: string;
  created_by_name?: string;
};

type AddTarget = "practice" | "reservation" | "notification" | null;
type ModalOpen = "notification" | null;

type PracticePayload = {
  title: string;
  courseName?: string;
  startsAt: string;
  endsAt?: string;
  instructions?: string;
  status?: string;
};

type ReservationPayload = {
  practiceId?: string | null;
  resourceType: "INVENTORY_ITEM" | "EQUIPMENT" | "OTHER";
  resourceId?: string | null;
  resourceName?: string;
  quantity?: number;
  unit?: string;
  neededAt?: string | null;
  notes?: string;
};

type ResourceOption = { id: string; label: string };

// Extrae el mensaje seguro devuelto por la API (estructura estándar { message })
// para mostrar el error real en vez de un texto genérico.
async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

// Combina una fecha (YYYY-MM-DD) y una hora (HH:MM) en un ISO con offset local.
function combineDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const composed = new Date(`${date}T${time}`);
  if (Number.isNaN(composed.getTime())) return null;
  return composed.toISOString();
}

function formatDate(value: string | undefined | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(value);
  }
}

function statusLabel(status: string | undefined | null): string {
  const map: Record<string, string> = {
    DRAFT: "Borrador", PLANNED: "Planificada", PREPARING: "En preparación",
    READY: "Lista", IN_PROGRESS: "En curso", COMPLETED: "Completada",
    CANCELLED: "Cancelada", PENDING: "Pendiente", APPROVED: "Aprobada",
    REJECTED: "Rechazada", FULFILLED: "Entregada", RETURNED: "Devuelta",
    PARTIAL: "Parcial", NO_SHOW: "Inasistencia",
  };
  return map[String(status)] ?? String(status ?? "—");
}

function resourceTypeLabel(type: string | undefined | null): string {
  if (type === "INVENTORY_ITEM") return "Inventario";
  if (type === "EQUIPMENT") return "Equipo";
  return "Otro";
}

// ─── Admin ────────────────────────────────────────────────────────────────────

function AdminEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [notifModal, setNotifModal] = useState<ModalOpen>(null);
  const [practices, setPractices] = useState<PracticeRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes, nRes] = await Promise.all([
        fetch("/api/education/practices"),
        fetch("/api/education/reservations"),
        fetch("/api/education/notifications"),
      ]);
      if (pRes.status === 403 || rRes.status === 403 || nRes.status === 403) {
        setError("No tienes permiso para ver esta sección. Contacta al administrador del laboratorio si crees que es un error.");
        return;
      }
      if (!pRes.ok || !rRes.ok || !nRes.ok) {
        setError("El servidor no pudo procesar la solicitud. Intenta de nuevo en unos segundos.");
        return;
      }
      const [pData, rData, nData] = await Promise.all([
        pRes.json() as Promise<{ data?: PracticeRow[] }>,
        rRes.json() as Promise<{ data?: ReservationRow[] }>,
        nRes.json() as Promise<{ data?: NotificationRow[] }>,
      ]);
      setPractices(pData.data ?? []);
      setReservations(rData.data ?? []);
      setNotifications(nData.data ?? []);
    } catch {
      setError("No se pudo cargar la información de prácticas. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createPractice(payload: PracticePayload): Promise<boolean> {
    try {
      const response = await fetch("/api/education/practices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setAddTarget(null);
        showToast("Práctica creada correctamente.");
        await load();
        return true;
      }
      showError(await apiErrorMessage(response, "No se pudo crear la práctica. Revisa los campos e intenta de nuevo."));
      return false;
    } catch {
      showError("No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.");
      return false;
    }
  }

  async function createReservation(payload: ReservationPayload): Promise<boolean> {
    try {
      const response = await fetch("/api/education/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setAddTarget(null);
        showToast("Reserva creada. Queda pendiente de aprobación.");
        await load();
        return true;
      }
      showError(await apiErrorMessage(response, "No se pudo crear la reserva. Revisa los campos e intenta de nuevo."));
      return false;
    } catch {
      showError("No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.");
      return false;
    }
  }

  async function updateReservationStatus(id: string, status: "APPROVED" | "REJECTED") {
    try {
      const response = await fetch("/api/education/reservations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (response.ok) {
        showToast(status === "APPROVED" ? "Reserva aprobada." : "Reserva rechazada.");
        await load();
      } else {
        showError(await apiErrorMessage(response, "No se pudo actualizar la reserva."));
      }
    } catch {
      showError("No se pudo conectar con el servidor. Intenta de nuevo.");
    }
  }

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/education/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: String(data.get("title")), body: String(data.get("body")), audience: String(data.get("audience")) }),
    });
    if (response.ok) {
      showToast("Aviso publicado. Los destinatarios ya pueden verlo.");
      setNotifModal(null);
      void load();
    } else {
      showError("No se pudo publicar el aviso. Verifica los campos e intenta de nuevo.");
    }
  }

  const practiceRows: TableRow[] = practices.map((p) => ({
    code: p.practice_code ?? p.code ?? "—",
    title: p.title ?? "—",
    course: p.course_name ?? "—",
    teacher: p.teacher_name ?? "—",
    scheduled: formatDate(p.starts_at),
    status: statusLabel(p.status),
  }));

  const reservationRows: TableRow[] = reservations.map((r) => ({
    code: r.reservation_code ?? "—",
    resource: r.resource_name ?? "—",
    type: resourceTypeLabel(r.resource_type),
    quantity: r.quantity ? `${r.quantity} ${r.unit ?? ""}`.trim() : "—",
    practice: r.practice_title ?? "—",
    status: statusLabel(r.status),
  }));

  const notifRows: TableRow[] = notifications.map((n) => ({
    title: n.title ?? "—",
    audience: n.audience === "STUDENTS" ? "Estudiantes" : n.audience === "PROFESSORS" ? "Profesores" : "Todos",
    practice: n.practice_title ?? "—",
    group: n.group_name ?? "—",
    from: n.created_by_name ?? "—",
    published: formatDate(n.publish_at),
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="PROGRAMA EDUCATIVO" title="Prácticas y reservas" description="Administra prácticas, reservas de recursos y avisos para el laboratorio educativo." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={5} cols={6} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="PROGRAMA EDUCATIVO" title="Prácticas y reservas" description="Administra prácticas, reservas de recursos y avisos para el laboratorio educativo." />
        <ErrorState description={error} onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="PROGRAMA EDUCATIVO" title="Prácticas y reservas" description="Administra prácticas, reservas de recursos y avisos para el laboratorio educativo.">
        <button className="primary-button" data-tutorial="education-new-practice" onClick={() => setAddTarget("practice")}><Plus size={15} /> Nueva práctica</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Prácticas programadas", value: String(practices.filter((p) => ["PLANNED", "PREPARING", "READY"].includes(String(p.status))).length), hint: "Próximas", icon: CalendarDays },
        { label: "Reservas pendientes", value: String(reservations.filter((r) => r.status === "PENDING").length), hint: "Por aprobar", icon: PackageCheck },
        { label: "Avisos publicados", value: String(notifications.length), hint: "Visibles a usuarios", icon: Bell },
      ]} />
      <article className="panel configuration-panel">
        <Tabs items={[
          { key: "practices", label: "Cronograma" },
          { key: "reservations", label: "Reservas" },
          { key: "notifications", label: "Avisos" },
        ]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "practices" ? (
            <section>
              <div className="section-heading">
                <div><h2>Cronograma de prácticas</h2><p>Cada práctica puede reservar materiales, equipos y reactivos con antelación.</p></div>
                <button className="secondary-button" onClick={() => setAddTarget("practice")}><Plus size={15} /> Nueva práctica</button>
              </div>
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "teacher", label: "Responsable" }, { key: "scheduled", label: "Fecha inicio" }, { key: "status", label: "Estado" }]}
                rows={practiceRows}
                searchPlaceholder="Buscar práctica o curso…"
              />
            </section>
          ) : null}
          {tab === "reservations" ? (
            <section>
              <div className="section-heading">
                <div><h2>Solicitudes de recursos</h2><p>Aprueba, rechaza o prepara materiales y equipos para cada práctica.</p></div>
                <button className="secondary-button" onClick={() => setAddTarget("reservation")}><Plus size={15} /> Nueva reserva</button>
              </div>
              <PendingReservations reservations={reservations} onDecide={updateReservationStatus} />
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "resource", label: "Recurso" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "practice", label: "Práctica" }, { key: "status", label: "Estado" }]}
                rows={reservationRows}
                searchPlaceholder="Buscar reserva…"
              />
            </section>
          ) : null}
          {tab === "notifications" ? (
            <section>
              <div className="section-heading">
                <div><h2>Avisos educativos</h2><p>Publica recordatorios, instrucciones y cambios visibles para estudiantes y profesores.</p></div>
                <button className="secondary-button" onClick={() => setNotifModal("notification")}><Plus size={15} /> Publicar aviso</button>
              </div>
              <SimpleTable
                columns={[{ key: "title", label: "Título" }, { key: "audience", label: "Destinatario" }, { key: "practice", label: "Práctica" }, { key: "from", label: "Publicado por" }, { key: "published", label: "Fecha" }]}
                rows={notifRows}
                searchPlaceholder="Buscar aviso…"
              />
            </section>
          ) : null}
        </div>
      </article>
      {addTarget === "practice" ? (
        <PracticeModal onClose={() => setAddTarget(null)} onSave={createPractice} />
      ) : null}
      {addTarget === "reservation" ? (
        <ReservationModal practices={practices} onClose={() => setAddTarget(null)} onSave={createReservation} />
      ) : null}
      <NotificationModal open={notifModal === "notification"} onClose={() => setNotifModal(null)} onSave={createNotification} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Profesor ─────────────────────────────────────────────────────────────────

function ProfessorEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [notifModal, setNotifModal] = useState<ModalOpen>(null);
  const [practices, setPractices] = useState<PracticeRow[]>([]);
  const [reservations, setReservations] = useState<ReservationRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, rRes, nRes] = await Promise.all([
        fetch("/api/education/practices"),
        fetch("/api/education/reservations"),
        fetch("/api/education/notifications"),
      ]);
      if (pRes.status === 403 || rRes.status === 403 || nRes.status === 403) {
        setError("No tienes permiso para ver esta sección. Contacta al administrador del laboratorio si crees que es un error.");
        return;
      }
      if (!pRes.ok || !rRes.ok || !nRes.ok) {
        setError("El servidor no pudo procesar la solicitud. Intenta de nuevo en unos segundos.");
        return;
      }
      const [pData, rData, nData] = await Promise.all([
        pRes.json() as Promise<{ data?: PracticeRow[] }>,
        rRes.json() as Promise<{ data?: ReservationRow[] }>,
        nRes.json() as Promise<{ data?: NotificationRow[] }>,
      ]);
      setPractices(pData.data ?? []);
      setReservations(rData.data ?? []);
      setNotifications(nData.data ?? []);
    } catch {
      setError("No se pudo cargar la información. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/education/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: String(data.get("title")), body: String(data.get("body")), audience: String(data.get("audience")) }),
    });
    if (response.ok) {
      showToast("Aviso publicado. Los destinatarios ya pueden verlo.");
      setNotifModal(null);
    } else {
      showError("No se pudo publicar el aviso. Revisa los campos e intenta de nuevo.");
    }
  }

  const practiceRows: TableRow[] = practices.map((p) => ({
    code: p.practice_code ?? p.code ?? "—",
    title: p.title ?? "—",
    course: p.course_name ?? "—",
    starts: formatDate(p.starts_at),
    status: statusLabel(p.status),
  }));

  const reservationRows: TableRow[] = reservations.map((r) => ({
    code: r.reservation_code ?? "—",
    type: r.resource_type === "INVENTORY_ITEM" ? "Inventario" : "Equipo",
    quantity: r.quantity ? `${r.quantity} ${r.unit ?? ""}` : "—",
    status: statusLabel(r.status),
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="MI PROGRAMA" title="Mis prácticas" description="Consulta el cronograma, tus reservas de recursos y publica avisos para tus grupos." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={4} cols={5} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="MI PROGRAMA" title="Mis prácticas" description="Consulta el cronograma, tus reservas de recursos y publica avisos para tus grupos." />
        <ErrorState description={error} onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="MI PROGRAMA" title="Mis prácticas" description="Consulta el cronograma, tus reservas de recursos y publica avisos para tus grupos.">
        <button className="secondary-button" data-tutorial="education-new-notification" onClick={() => setNotifModal("notification")}><Bell size={15} /> Publicar aviso</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Mis prácticas", value: String(practices.length), hint: "Asignadas a mí", icon: CalendarDays },
        { label: "Reservas activas", value: String(reservations.filter((r) => !["REJECTED", "CANCELLED"].includes(String(r.status))).length), hint: "Recursos reservados", icon: PackageCheck },
        { label: "Avisos enviados", value: String(notifications.length), hint: "A mis grupos", icon: Bell },
      ]} />
      <article className="panel configuration-panel">
        <Tabs items={[
          { key: "practices", label: "Cronograma" },
          { key: "reservations", label: "Mis reservas" },
          { key: "notifications", label: "Avisos" },
        ]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "practices" ? (
            <section>
              <div className="section-heading">
                <div><h2>Cronograma de prácticas</h2><p>Prácticas asignadas a tu cuenta este período.</p></div>
              </div>
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "starts", label: "Inicio" }, { key: "status", label: "Estado" }]}
                rows={practiceRows}
                searchPlaceholder="Buscar práctica…"
              />
            </section>
          ) : null}
          {tab === "reservations" ? (
            <section>
              <div className="section-heading">
                <div><h2>Mis reservas de recursos</h2><p>Recursos solicitados para tus prácticas. Consulta el estado de cada uno.</p></div>
              </div>
              <SimpleTable
                columns={[{ key: "code", label: "Reserva" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "status", label: "Estado" }]}
                rows={reservationRows}
                searchPlaceholder="Buscar reserva…"
              />
            </section>
          ) : null}
          {tab === "notifications" ? (
            <section>
              <div className="section-heading">
                <div><h2>Avisos publicados</h2><p>Mensajes enviados a tus grupos desde esta cuenta.</p></div>
                <button className="secondary-button" onClick={() => setNotifModal("notification")}><Plus size={15} /> Publicar aviso</button>
              </div>
              <SimpleTable
                columns={[{ key: "title", label: "Título" }, { key: "audience", label: "Destinatario" }, { key: "from", label: "Publicado por" }, { key: "published", label: "Fecha" }]}
                rows={notifications.map((n) => ({
                  title: n.title ?? "—",
                  audience: n.audience === "STUDENTS" ? "Estudiantes" : n.audience === "PROFESSORS" ? "Profesores" : "Todos",
                  from: n.created_by_name ?? "—",
                  published: formatDate(n.publish_at),
                }))}
                searchPlaceholder="Buscar aviso…"
              />
            </section>
          ) : null}
        </div>
      </article>
      <NotificationModal open={notifModal === "notification"} onClose={() => setNotifModal(null)} onSave={createNotification} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Estudiante ───────────────────────────────────────────────────────────────

function StudentEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [practices, setPractices] = useState<PracticeRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { message, toastType, clearToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, nRes] = await Promise.all([
        fetch("/api/education/practices"),
        fetch("/api/education/notifications"),
      ]);
      if (pRes.status === 403 || nRes.status === 403) {
        setError("No tienes permiso para ver esta sección. Contacta a tu docente o administrador si crees que es un error.");
        return;
      }
      if (!pRes.ok || !nRes.ok) {
        setError("El servidor no pudo procesar la solicitud. Intenta de nuevo en unos segundos.");
        return;
      }
      const [pData, nData] = await Promise.all([
        pRes.json() as Promise<{ data?: PracticeRow[] }>,
        nRes.json() as Promise<{ data?: NotificationRow[] }>,
      ]);
      setPractices(pData.data ?? []);
      setNotifications(nData.data ?? []);
    } catch {
      setError("No se pudo cargar la información. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const next = practices.find((p) => ["READY", "IN_PROGRESS", "PLANNED"].includes(String(p.status)));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="MIS PRÁCTICAS" title="Laboratorio educativo" description="Consulta tus prácticas asignadas, avisos del docente e instrucciones previas." />
        <SkeletonKpiGrid cols={3} />
        <SkeletonTable rows={3} cols={5} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="MIS PRÁCTICAS" title="Laboratorio educativo" description="Consulta tus prácticas asignadas, avisos del docente e instrucciones previas." />
        <ErrorState description={error} onRetry={() => void load()} />
        <Toast message={message} type={toastType} onClose={clearToast} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="MIS PRÁCTICAS" title="Laboratorio educativo" description="Consulta tus prácticas asignadas, avisos del docente e instrucciones previas." />
      <StatGrid items={[
        { label: "Próxima práctica", value: next ? (next.practice_code ?? next.code ?? "—") : "Ninguna", hint: next ? formatDate(next.starts_at) : "Sin prácticas próximas", icon: CalendarDays },
        { label: "Avisos sin leer", value: String(notifications.length), hint: "De docentes y admin", icon: Bell },
        { label: "Prácticas este período", value: String(practices.length), hint: "Asignadas a ti", icon: GraduationCap },
      ]} />
      <InlineNotice title="Acceso de consulta">
        Solo puedes ver la información que tu docente o administrador haya publicado. No puedes modificar inventario, equipos ni reservas.
      </InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[
          { key: "practices", label: "Mis prácticas" },
          { key: "notifications", label: "Avisos" },
          { key: "instructions", label: "Instrucciones" },
        ]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "practices" ? (
            <section>
              <div className="section-heading">
                <div><h2>Prácticas asignadas</h2><p>Información de las prácticas programadas para ti este período.</p></div>
              </div>
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "starts", label: "Inicio" }, { key: "status", label: "Estado" }]}
                rows={practices.map((p) => ({
                  code: p.practice_code ?? p.code ?? "—",
                  title: p.title ?? "—",
                  course: p.course_name ?? "—",
                  starts: formatDate(p.starts_at),
                  status: statusLabel(p.status),
                }))}
                searchPlaceholder="Buscar práctica…"
              />
            </section>
          ) : null}
          {tab === "notifications" ? (
            <section>
              <div className="section-heading">
                <div><h2>Avisos del docente</h2><p>Mensajes publicados por tus profesores y el administrador del laboratorio.</p></div>
              </div>
              {notifications.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon"><Bell size={22} /></div>
                  <h3>Sin avisos por ahora</h3>
                  <p>Cuando tu docente publique un mensaje o instrucción aparecerá aquí.</p>
                </div>
              ) : (
                <div className="notif-feed notif-feed-panel">
                  {notifications.map((n, i) => {
                    const initials = (n.created_by_name ?? "D").split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
                    return (
                      <div key={String(n.id)} className={`notif-item ${i < 2 ? "notif-item-unread" : ""}`}>
                        <div className="notif-avatar notif-avatar-teal">{initials}</div>
                        <div>
                          <div className="notif-row-top">
                            <span className="notif-author">{n.created_by_name ?? "Docente"}</span>
                            <span className="notif-sep">·</span>
                            <span className="notif-time">{formatDate(n.publish_at)}</span>
                            {i < 2 ? <span className="notif-unread-dot" aria-label="No leído" /> : null}
                          </div>
                          <p className="notif-title">{n.title}</p>
                          {n.body ? <p className="notif-body">{n.body}</p> : null}
                          <div className="notif-foot">
                            <span className="notification-badge notification-badge-info">Aviso</span>
                            {n.practice_title ? <span className="notification-badge notification-badge-success">{n.practice_title}</span> : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}
          {tab === "instructions" ? (
            <section>
              <div className="section-heading">
                <div><h2>Instrucciones previas</h2><p>Guías y materiales que tu docente publicó antes de cada práctica.</p></div>
              </div>
              <div className="mini-card-grid">
                <article>
                  <BookOpenCheck size={18} />
                  <h3>Normas de seguridad</h3>
                  <p>Usa siempre bata, guantes y lentes de seguridad. Prohibido ingerir alimentos en el laboratorio.</p>
                </article>
                <article>
                  <PackageCheck size={18} />
                  <h3>Protocolo QR</h3>
                  <p>Escanea el código QR de cada recurso antes de usarlo y anota el código temporal de 6 dígitos.</p>
                </article>
                <article>
                  <UsersRound size={18} />
                  <h3>Trabajo en equipo</h3>
                  <p>Cada grupo es responsable de dejar limpia y ordenada su área de trabajo al finalizar.</p>
                </article>
              </div>
            </section>
          ) : null}
        </div>
      </article>
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Modales compartidos ───────────────────────────────────────────────────────

function PendingReservations({
  reservations,
  onDecide,
}: Readonly<{
  reservations: ReservationRow[];
  onDecide: (id: string, status: "APPROVED" | "REJECTED") => void | Promise<void>;
}>) {
  const pending = reservations.filter((r) => r.status === "PENDING" && r.id);
  const [busyId, setBusyId] = useState<string | null>(null);
  if (pending.length === 0) return null;

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setBusyId(id);
    try { await onDecide(id, status); } finally { setBusyId(null); }
  }

  return (
    <div className="approval-strip">
      <p className="approval-strip-title">{pending.length} reserva{pending.length === 1 ? "" : "s"} pendiente{pending.length === 1 ? "" : "s"} de aprobación</p>
      {pending.map((r) => (
        <div key={String(r.id)} className="approval-row">
          <div>
            <strong>{r.reservation_code ?? "—"}</strong>
            <span> · {r.resource_name ?? resourceTypeLabel(r.resource_type)}</span>
            {r.quantity ? <span> · {r.quantity} {r.unit ?? ""}</span> : null}
            {r.practice_title ? <span className="approval-practice"> · {r.practice_title}</span> : null}
          </div>
          <div className="approval-actions">
            <button type="button" className="secondary-button" disabled={busyId === r.id} onClick={() => decide(String(r.id), "REJECTED")}>Rechazar</button>
            <button type="button" className="primary-button" disabled={busyId === r.id} onClick={() => decide(String(r.id), "APPROVED")}>Aprobar</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function PracticeModal({
  onClose,
  onSave,
}: Readonly<{
  onClose: () => void;
  onSave: (payload: PracticePayload) => Promise<boolean>;
}>) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const date = String(data.get("date") ?? "");
    const startTime = String(data.get("startTime") ?? "");
    const endTime = String(data.get("endTime") ?? "");

    const startsAt = combineDateTime(date, startTime);
    if (!startsAt) { setError("Indica la fecha y la hora de inicio."); return; }
    let endsAt: string | undefined;
    if (endTime) {
      const composed = combineDateTime(date, endTime);
      if (!composed) { setError("La hora de finalización no es válida."); return; }
      if (new Date(composed) <= new Date(startsAt)) { setError("La hora de finalización debe ser posterior a la de inicio."); return; }
      endsAt = composed;
    }

    setSaving(true);
    const ok = await onSave({
      title,
      courseName: String(data.get("course") ?? "").trim() || undefined,
      startsAt,
      endsAt,
      instructions: String(data.get("instructions") ?? "").trim() || undefined,
      status: String(data.get("status") ?? "PLANNED"),
    });
    setSaving(false);
    if (!ok) return;
  }

  return (
    <ActionModal open title="Nueva práctica" description="El código se genera automáticamente. Programa la fecha, el horario y el curso." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título de la práctica</span><input name="title" required minLength={3} placeholder="Tinción de Gram" /></label>
          <label><span>Curso o asignatura</span><input name="course" placeholder="Microbiología I · Sección A" /></label>
          <label><span>Estado</span>
            <select name="status" defaultValue="PLANNED">
              <option value="DRAFT">Borrador</option>
              <option value="PLANNED">Planificada</option>
              <option value="PREPARING">En preparación</option>
              <option value="READY">Lista</option>
            </select>
          </label>
          <label><span>Fecha</span><input name="date" type="date" required /></label>
          <label><span>Hora de inicio</span><input name="startTime" type="time" required /></label>
          <label><span>Hora de finalización</span><input name="endTime" type="time" /></label>
          <label className="field-span-two"><span>Instrucciones (opcional)</span><textarea name="instructions" rows={3} placeholder="Objetivos, materiales de referencia, indicaciones previas…" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Crear práctica"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function ReservationModal({
  practices,
  onClose,
  onSave,
}: Readonly<{
  practices: PracticeRow[];
  onClose: () => void;
  onSave: (payload: ReservationPayload) => Promise<boolean>;
}>) {
  const [resourceType, setResourceType] = useState<"INVENTORY_ITEM" | "EQUIPMENT" | "OTHER">("EQUIPMENT");
  const [equipment, setEquipment] = useState<ResourceOption[]>([]);
  const [inventory, setInventory] = useState<ResourceOption[]>([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setLoadingResources(true);
    void Promise.all([
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/inventory").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([eq, inv]) => {
      if (!active) return;
      const eqRows = (eq as { data?: Array<{ id?: string; code?: string; name?: string }> }).data ?? [];
      const invRows = (inv as { data?: Array<{ id?: string; sku?: string; name?: string }> }).data ?? [];
      setEquipment(eqRows.filter((e) => e.id).map((e) => ({ id: String(e.id), label: `${e.code ?? ""} · ${e.name ?? ""}`.trim() })));
      setInventory(invRows.filter((i) => i.id).map((i) => ({ id: String(i.id), label: `${i.sku ?? ""} · ${i.name ?? ""}`.trim() })));
      setLoadingResources(false);
    });
    return () => { active = false; };
  }, []);

  const resourceOptions = resourceType === "EQUIPMENT" ? equipment : resourceType === "INVENTORY_ITEM" ? inventory : [];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const data = new FormData(event.currentTarget);
    const resourceId = String(data.get("resourceId") ?? "");
    const resourceName = String(data.get("resourceName") ?? "").trim();

    if (resourceType !== "OTHER" && !resourceId) { setError("Selecciona el recurso a reservar."); return; }
    if (resourceType === "OTHER" && resourceName.length < 2) { setError("Describe el recurso a reservar."); return; }

    const date = String(data.get("date") ?? "");
    const time = String(data.get("time") ?? "");
    const neededAt = date ? combineDateTime(date, time || "00:00") : null;
    const quantityRaw = String(data.get("quantity") ?? "").trim();

    setSaving(true);
    const ok = await onSave({
      practiceId: String(data.get("practiceId") ?? "") || null,
      resourceType,
      resourceId: resourceType === "OTHER" ? null : resourceId,
      resourceName: resourceType === "OTHER" ? resourceName : undefined,
      quantity: quantityRaw ? Number(quantityRaw) : undefined,
      unit: String(data.get("unit") ?? "").trim() || undefined,
      neededAt,
      notes: String(data.get("notes") ?? "").trim() || undefined,
    });
    setSaving(false);
    if (!ok) return;
  }

  return (
    <ActionModal open title="Nueva reserva" description="Reserva un equipo o artículo de inventario para una práctica." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Práctica (opcional)</span>
            <select name="practiceId" defaultValue="">
              <option value="">Sin práctica asociada</option>
              {practices.filter((p) => p.id).map((p) => (
                <option key={String(p.id)} value={String(p.id)}>{(p.practice_code ?? p.code ?? "")} · {p.title ?? ""}</option>
              ))}
            </select>
          </label>
          <label><span>Tipo de recurso</span>
            <select name="resourceType" value={resourceType} onChange={(e) => setResourceType(e.target.value as typeof resourceType)}>
              <option value="EQUIPMENT">Equipo</option>
              <option value="INVENTORY_ITEM">Inventario</option>
              <option value="OTHER">Otro</option>
            </select>
          </label>
          {resourceType === "OTHER" ? (
            <label><span>Recurso</span><input name="resourceName" placeholder="Aula, espacio u otro recurso" /></label>
          ) : (
            <label><span>Recurso</span>
              <select name="resourceId" disabled={loadingResources}>
                <option value="">{loadingResources ? "Cargando…" : resourceOptions.length ? "Selecciona…" : "Sin recursos disponibles"}</option>
                {resourceOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
            </label>
          )}
          <label><span>Cantidad (opcional)</span><input name="quantity" type="number" min="0" step="0.01" /></label>
          <label><span>Unidad (opcional)</span><input name="unit" placeholder="unidades, mL…" /></label>
          <label><span>Fecha requerida</span><input name="date" type="date" /></label>
          <label><span>Hora requerida</span><input name="time" type="time" /></label>
          <label className="field-span-two"><span>Notas (opcional)</span><textarea name="notes" rows={2} placeholder="Detalles para quien prepara el recurso…" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Crear reserva"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function NotificationModal({
  open,
  onClose,
  onSave,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}>) {
  return (
    <ActionModal open={open} title="Publicar aviso" description="El aviso será visible inmediatamente para los destinatarios seleccionados." onClose={onClose}>
      <form className="modal-form" onSubmit={onSave}>
        <div className="form-grid">
          <label><span>Título</span><input name="title" required placeholder="Recordatorio: práctica mañana" /></label>
          <label>
            <span>Destinatarios</span>
            <select name="audience">
              <option value="STUDENTS">Estudiantes</option>
              <option value="PROFESSORS">Profesores</option>
              <option value="ALL">Todos</option>
            </select>
          </label>
          <label><span>Mensaje</span><textarea name="body" required rows={4} placeholder="Describe el aviso o instrucción…" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button">Publicar</button>
        </footer>
      </form>
    </ActionModal>
  );
}

// ─── Exportación principal ────────────────────────────────────────────────────

export function EducationCenter({ role }: Readonly<{ role?: UserSession["role"] }>) {
  if (role === "PROFESSOR") return <ProfessorEducationCenter />;
  if (role === "STUDENT") return <StudentEducationCenter />;
  return <AdminEducationCenter />;
}
