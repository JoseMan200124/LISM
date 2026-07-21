"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Bell,
  BookOpenCheck,
  CalendarDays,
  GraduationCap,
  PackageCheck,
  Plus,
  Trash2,
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
  groupId?: string | null;
  location?: string;
  resources?: Array<{ resourceType: "INVENTORY_ITEM" | "EQUIPMENT"; resourceId: string; quantity: number; unit: string; neededAt: string }>;
  externalLinks?: Array<{ title: string; url: string; description?: string }>;
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

type PracticeDetail = {
  id: string;
  practice_code?: string;
  title?: string;
  course_name?: string | null;
  starts_at?: string;
  ends_at?: string | null;
  instructions?: string | null;
  status?: string;
  teacher_name?: string | null;
  shareToken?: string | null;
};

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

// Lee filtros de la URL (?tab=&status=) enviados desde el dashboard clicable.
function normalizeEducationTab(tab: string | null): string | undefined {
  if (tab === "schedule") return "practices";
  if (tab === "notices") return "notifications";
  if (tab === "practices" || tab === "reservations" || tab === "notifications" || tab === "instructions") return tab;
  return undefined;
}

function readEducationQuery(): { tab?: string; status?: string; filter?: string; practiceId?: string; reservationId?: string; noticeId?: string; action?: string } {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  return { tab: normalizeEducationTab(params.get("tab")), status: params.get("status")?.toUpperCase() ?? undefined, filter: params.get("filter") ?? undefined, practiceId: params.get("practiceId") ?? undefined, reservationId: params.get("reservationId") ?? undefined, noticeId: params.get("noticeId") ?? undefined, action: params.get("action") ?? undefined };
}

function AdminEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [practiceFilter, setPracticeFilter] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [notifModal, setNotifModal] = useState<ModalOpen>(null);
  const [practiceDetail, setPracticeDetail] = useState<PracticeDetail | null>(null);
  const [reservationDetail, setReservationDetail] = useState<Record<string, unknown> | null>(null);
  const [noticeDetail, setNoticeDetail] = useState<Record<string, unknown> | null>(null);
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

  useEffect(() => {
    const { tab: t, status, filter, practiceId, reservationId, noticeId, action } = readEducationQuery();
    if (t === "practices" || t === "reservations" || t === "notifications") setTab(t);
    if (status) setStatusFilter(status);
    if (filter) setPracticeFilter(filter);
    if (practiceId) void openPracticeDetail(practiceId);
    if (reservationId) void openEducationDetail("reservations", reservationId, setReservationDetail);
    if (noticeId) void openEducationDetail("notifications", noticeId, setNoticeDetail);
    if (action === "create") setAddTarget("practice");
  }, []);

  async function createPractice(payload: PracticePayload): Promise<boolean> {
    try {
      const response = await fetch("/api/education/practices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        const created = await response.json() as { data?: { id?: string } };
        setAddTarget(null);
        showToast("Práctica creada correctamente.");
        await load();
        if (created.data?.id) await openPracticeDetail(created.data.id);
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

  async function openPracticeDetail(id: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/education/practices/${id}`);
      if (res.ok) { const p = await res.json() as { data?: PracticeDetail }; if (p.data) setPracticeDetail(p.data); }
      else showError(await apiErrorMessage(res, "No se pudo abrir la práctica."));
    } catch { showError("No se pudo conectar con el servidor."); }
  }

  async function openEducationDetail(resource: "reservations" | "notifications", id: string, setter: (value: Record<string, unknown> | null) => void) {
    try { const response = await fetch(`/api/education/${resource}/${id}`); if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo abrir el registro.")); return; } const payload = await response.json() as { data?: Record<string, unknown> }; setter(payload.data ?? null); } catch { showError("No se pudo conectar con el servidor."); }
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
      body: JSON.stringify({ notificationType: String(data.get("notificationType") ?? "GENERAL"), practiceId: String(data.get("practiceId") ?? "") || null, title: String(data.get("title")), body: String(data.get("body")), audience: String(data.get("audience")) }),
    });
    if (response.ok) {
      showToast("Aviso publicado. Los destinatarios ya pueden verlo.");
      setNotifModal(null);
      void load();
    } else {
      showError("No se pudo publicar el aviso. Verifica los campos e intenta de nuevo.");
    }
  }

  const shownPractices = practiceFilter === "upcoming" ? practices.filter((p) => Boolean(p.starts_at) && new Date(String(p.starts_at)) >= new Date() && ["PLANNED", "PREPARING", "READY"].includes(String(p.status))) : practices;
  const practiceRows: TableRow[] = shownPractices.map((p) => ({
    id: p.id ?? "",
    code: p.practice_code ?? p.code ?? "—",
    title: p.title ?? "—",
    course: p.course_name ?? "—",
    teacher: p.teacher_name ?? "—",
    scheduled: formatDate(p.starts_at),
    status: statusLabel(p.status),
  }));

  const shownReservations = statusFilter ? reservations.filter((r) => String(r.status) === statusFilter) : reservations;
  const reservationRows: TableRow[] = shownReservations.map((r) => ({
    id: r.id ?? "",
    code: r.reservation_code ?? "—",
    resource: r.resource_name ?? "—",
    type: resourceTypeLabel(r.resource_type),
    quantity: r.quantity ? `${r.quantity} ${r.unit ?? ""}`.trim() : "—",
    practice: r.practice_title ?? "—",
    status: statusLabel(r.status),
  }));

  const notifRows: TableRow[] = notifications.map((n) => ({
    id: n.id ?? "",
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
              </div>
              {practiceFilter ? <div className="filter-active-chip">Filtro activo: <strong>Próximas prácticas</strong><button type="button" onClick={() => setPracticeFilter(null)} aria-label="Quitar filtro">✕</button></div> : null}
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "title", label: "Práctica" }, { key: "course", label: "Curso" }, { key: "teacher", label: "Responsable" }, { key: "scheduled", label: "Fecha inicio" }, { key: "status", label: "Estado" }]}
                rows={practiceRows}
                onRowClick={(row) => { if (row.id) void openPracticeDetail(String(row.id)); }}
                searchPlaceholder="Buscar práctica o curso…"
                emptyTitle="No hay prácticas programadas."
                emptyMessage="Crea una nueva práctica para comenzar a organizar fechas, recursos, equipos y estudiantes."
              />
              {practices.length === 0 ? <div className="empty-state-actions"><button type="button" className="primary-button" onClick={() => setAddTarget("practice")}><Plus size={15} /> Crear nueva práctica</button></div> : null}
            </section>
          ) : null}
          {tab === "reservations" ? (
            <section>
              <div className="section-heading">
                <div><h2>Solicitudes de recursos</h2><p>Aprueba, rechaza o prepara materiales y equipos para cada práctica.</p></div>
                <button className="secondary-button" onClick={() => setAddTarget("reservation")}><Plus size={15} /> Nueva reserva</button>
              </div>
              {statusFilter ? (
                <div className="filter-active-chip">Filtrando por estado: <strong>{statusLabel(statusFilter)}</strong><button type="button" onClick={() => setStatusFilter(null)} aria-label="Quitar filtro">✕</button></div>
              ) : null}
              <PendingReservations reservations={reservations} onDecide={updateReservationStatus} />
              <SimpleTable
                columns={[{ key: "code", label: "Código" }, { key: "resource", label: "Recurso" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "practice", label: "Práctica" }, { key: "status", label: "Estado" }]}
                rows={reservationRows}
                onRowClick={(row) => { if (row.id) void openEducationDetail("reservations", String(row.id), setReservationDetail); }}
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
                onRowClick={(row) => { if (row.id) void openEducationDetail("notifications", String(row.id), setNoticeDetail); }}
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
      <PracticeDetailModal detail={practiceDetail} onClose={() => setPracticeDetail(null)} />
      <ReservationDetailModal detail={reservationDetail} onClose={() => setReservationDetail(null)} onChanged={async () => { setReservationDetail(null); await load(); }} />
      <NoticeDetailModal detail={noticeDetail} onClose={() => setNoticeDetail(null)} onChanged={async () => { setNoticeDetail(null); await load(); }} />
      <NotificationModal open={notifModal === "notification"} practices={practices} onClose={() => setNotifModal(null)} onSave={createNotification} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Profesor ─────────────────────────────────────────────────────────────────

function ProfessorEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [notifModal, setNotifModal] = useState<ModalOpen>(null);
  const [practiceModal, setPracticeModal] = useState(false);
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
  useEffect(() => { const query = readEducationQuery(); if (query.tab) setTab(query.tab); if (query.action === "create") setPracticeModal(true); }, []);

  async function createPractice(payload: PracticePayload): Promise<boolean> {
    try {
      const response = await fetch("/api/education/practices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo crear la práctica.")); return false; }
      setPracticeModal(false); showToast("Práctica creada correctamente."); await load(); return true;
    } catch { showError("No se pudo conectar con el servidor."); return false; }
  }

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/education/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationType: String(data.get("notificationType") ?? "GENERAL"), practiceId: String(data.get("practiceId") ?? "") || null, title: String(data.get("title")), body: String(data.get("body")), audience: String(data.get("audience")) }),
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
        <button className="primary-button" data-tutorial="education-new-practice" onClick={() => setPracticeModal(true)}><Plus size={15} /> Nueva práctica</button>
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
      {practiceModal ? <PracticeModal onClose={() => setPracticeModal(false)} onSave={createPractice} /> : null}
      <NotificationModal open={notifModal === "notification"} practices={practices} onClose={() => setNotifModal(null)} onSave={createNotification} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

// ─── Estudiante ───────────────────────────────────────────────────────────────

function StudentEducationCenter() {
  const [tab, setTab] = useState("practices");
  const [practices, setPractices] = useState<PracticeRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [noticeDetail, setNoticeDetail] = useState<Record<string, unknown> | null>(null);
  const [practiceDetail, setPracticeDetail] = useState<PracticeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { message, toastType, showError, clearToast } = useToast();

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
  useEffect(() => { const query = readEducationQuery(); if (query.tab) setTab(query.tab); if (query.noticeId) void openNotice(query.noticeId); if (query.practiceId) void openStudentPractice(query.practiceId); }, []);

  async function openNotice(id: string) { try { const response = await fetch(`/api/education/notifications/${id}`); if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo abrir el aviso.")); return; } const payload = await response.json() as { data?: Record<string, unknown> }; setNoticeDetail(payload.data ?? null); } catch { showError("No se pudo conectar con el servidor."); } }
  async function openStudentPractice(id: string) { try { const response = await fetch(`/api/education/practices/${id}`); if (!response.ok) { showError(await apiErrorMessage(response, "No se pudo abrir la práctica.")); return; } const payload = await response.json() as { data?: PracticeDetail }; setPracticeDetail(payload.data ?? null); } catch { showError("No se pudo conectar con el servidor."); } }

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
                  id: p.id ?? "",
                  code: p.practice_code ?? p.code ?? "—",
                  title: p.title ?? "—",
                  course: p.course_name ?? "—",
                  starts: formatDate(p.starts_at),
                  status: statusLabel(p.status),
                }))}
                onRowClick={(row) => { if (row.id) void openStudentPractice(String(row.id)); }}
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
                      <button type="button" key={String(n.id)} className={`notif-item ${i < 2 ? "notif-item-unread" : ""}`} onClick={() => { if (n.id) void openNotice(String(n.id)); }}>
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
                      </button>
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
      <PracticeDetailModal detail={practiceDetail} onClose={() => setPracticeDetail(null)} />
      <NoticeDetailModal detail={noticeDetail} readOnly onClose={() => setNoticeDetail(null)} onChanged={async () => setNoticeDetail(null)} />
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
  const [step, setStep] = useState(1);
  const [resourceType, setResourceType] = useState<"INVENTORY_ITEM" | "EQUIPMENT">("INVENTORY_ITEM");
  const [inventory, setInventory] = useState<ResourceOption[]>([]);
  const [equipment, setEquipment] = useState<ResourceOption[]>([]);
  const [groups, setGroups] = useState<ResourceOption[]>([]);
  // Una práctica puede reservar varios reactivos y equipos a la vez: se
  // acumulan aquí y se envían como arreglo. El backend ya soportaba múltiples
  // recursos por práctica; antes la UI solo dejaba elegir uno.
  const [resources, setResources] = useState<Array<{ resourceType: "INVENTORY_ITEM" | "EQUIPMENT"; resourceId: string; label: string; quantity: number; unit: string }>>([]);
  const [draftResourceId, setDraftResourceId] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftUnit, setDraftUnit] = useState("unidades");

  useEffect(() => {
    let active = true;
    void Promise.all([fetch("/api/inventory"), fetch("/api/equipment"), fetch("/api/education/groups")]).then(async ([inventoryResponse, equipmentResponse, groupsResponse]) => {
      const inventoryData = inventoryResponse.ok ? await inventoryResponse.json() as { data?: Array<{ id?: string; sku?: string; name?: string }> } : { data: [] };
      const equipmentData = equipmentResponse.ok ? await equipmentResponse.json() as { data?: Array<{ id?: string; code?: string; name?: string }> } : { data: [] };
      const groupData = groupsResponse.ok ? await groupsResponse.json() as { data?: Array<{ id?: string; code?: string; name?: string }> } : { data: [] };
      if (!active) return;
      setInventory((inventoryData.data ?? []).filter((item) => item.id).map((item) => ({ id: String(item.id), label: `${item.sku ?? ""} · ${item.name ?? ""}` })));
      setEquipment((equipmentData.data ?? []).filter((item) => item.id).map((item) => ({ id: String(item.id), label: `${item.code ?? ""} · ${item.name ?? ""}` })));
      setGroups((groupData.data ?? []).filter((item) => item.id).map((item) => ({ id: String(item.id), label: `${item.code ?? ""} · ${item.name ?? ""}` })));
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const currentResourceOptions = resourceType === "INVENTORY_ITEM" ? inventory : equipment;

  function addDraftResource() {
    if (!draftResourceId) { setError("Selecciona un recurso para añadirlo a la lista."); return; }
    const option = currentResourceOptions.find((item) => item.id === draftResourceId);
    if (!option) return;
    if (resources.some((resource) => resource.resourceId === draftResourceId && resource.resourceType === resourceType)) {
      setError("Ese recurso ya está en la lista."); return;
    }
    const quantity = Number(draftQuantity);
    setResources((current) => [...current, {
      resourceType,
      resourceId: draftResourceId,
      label: option.label,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: draftUnit.trim() || "unidades",
    }]);
    setDraftResourceId(""); setDraftQuantity("1"); setDraftUnit("unidades"); setError(null);
  }

  function removeDraftResource(index: number) {
    setResources((current) => current.filter((_, position) => position !== index));
  }

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
    const documentUrl = String(data.get("documentUrl") ?? "").trim();
    const ok = await onSave({
      title,
      courseName: String(data.get("course") ?? "").trim() || undefined,
      startsAt,
      endsAt,
      instructions: String(data.get("instructions") ?? "").trim() || undefined,
      status: String(data.get("status") ?? "PLANNED"),
      groupId: String(data.get("groupId") ?? "") || null,
      location: String(data.get("location") ?? "").trim() || undefined,
      resources: resources.map((resource) => ({ resourceType: resource.resourceType, resourceId: resource.resourceId, quantity: resource.quantity, unit: resource.unit, neededAt: startsAt })),
      externalLinks: documentUrl ? [{ title: String(data.get("documentTitle") ?? "Guía de práctica").trim() || "Guía de práctica", url: documentUrl, description: String(data.get("documentDescription") ?? "").trim() || undefined }] : [],
    });
    setSaving(false);
    if (!ok) return;
  }

  return (
    <ActionModal open title="Nueva práctica" description={`Paso ${step} de 5 · ${["Información general", "Recursos y reservas", "Documentos e instrucciones", "Participantes", "Revisar y publicar"][step - 1]}`} onClose={onClose} wide>
      <form className="modal-form" onSubmit={submit}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="tutorial-dots" aria-label={`Paso ${step} de 5`}>{[1, 2, 3, 4, 5].map((number) => <span key={number} className={`tutorial-dot ${number === step ? "tutorial-dot-active" : ""}`} />)}</div>
        <div className="form-grid form-grid-two" hidden={step !== 1}>
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
          <label className="field-span-two"><span>Ubicación</span><input name="location" placeholder="Laboratorio B" /></label>
        </div>
        <div className="modal-form" hidden={step !== 2}>
          <p className="modal-note">Añade todos los reactivos, materiales y equipos que la práctica necesita reservar. Puedes agregar tantos como quieras; también puedes crear la práctica sin recursos y añadirlos después.</p>
          <div className="form-grid form-grid-two">
            <label><span>Tipo de recurso</span><select value={resourceType} onChange={(event) => { setResourceType(event.target.value as typeof resourceType); setDraftResourceId(""); }}><option value="INVENTORY_ITEM">Artículo de inventario</option><option value="EQUIPMENT">Equipo</option></select></label>
            <label><span>Recurso</span><select value={draftResourceId} onChange={(event) => setDraftResourceId(event.target.value)}><option value="">Selecciona…</option>{currentResourceOptions.map((resource) => <option key={resource.id} value={resource.id}>{resource.label}</option>)}</select></label>
            <label><span>Cantidad</span><input type="number" min="0.001" step="0.001" value={draftQuantity} onChange={(event) => setDraftQuantity(event.target.value)} /></label>
            <label><span>Unidad</span><input value={draftUnit} onChange={(event) => setDraftUnit(event.target.value)} /></label>
          </div>
          <div className="line-item-add"><button type="button" className="secondary-button" onClick={addDraftResource}><Plus size={15} /> Añadir recurso</button></div>
          {resources.length === 0 ? (
            <p className="line-item-empty">Aún no has añadido recursos.</p>
          ) : (
            <ul className="line-item-list">
              {resources.map((resource, index) => (
                <li key={`${resource.resourceType}-${resource.resourceId}`} className="line-item-row">
                  <div className="line-item-info">
                    <strong>{resource.label}</strong>
                    <span>{resourceTypeLabel(resource.resourceType)} · {resource.quantity} {resource.unit}</span>
                  </div>
                  <button type="button" className="icon-button" aria-label={`Quitar ${resource.label}`} onClick={() => removeDraftResource(index)}><Trash2 size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="form-grid" hidden={step !== 3}><label><span>Instrucciones</span><textarea name="instructions" rows={4} placeholder="Objetivos, indicaciones previas y procedimiento…" /></label><label><span>Título del documento o enlace</span><input name="documentTitle" placeholder="Guía de la práctica" /></label><label><span>Enlace externo (opcional)</span><input name="documentUrl" type="url" placeholder="https://…" /></label><label><span>Descripción</span><textarea name="documentDescription" rows={2} /></label></div>
        <div className="form-grid" hidden={step !== 4}><label><span>Grupo educativo (opcional)</span><select name="groupId" defaultValue=""><option value="">Sin grupo</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label><p className="modal-note">Los estudiantes del grupo verán la práctica y sus avisos publicados. Los participantes individuales pueden administrarse desde la ficha.</p></div>
        <div className="modal-form" hidden={step !== 5}><InlineNotice title="Lista para crear">Se generará el código automáticamente y se guardarán la práctica, la reserva inicial, el documento enlazado y la auditoría de forma transaccional.</InlineNotice><p>Después podrás ver la práctica, copiar el enlace seguro, compartir por correo o WhatsApp y crear un aviso relacionado.</p></div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          {step > 1 ? <button type="button" className="secondary-button" onClick={() => setStep((current) => current - 1)}>Atrás</button> : null}
          {step < 5 ? <button type="button" className="primary-button" onClick={(event) => { if (step === 1 && !event.currentTarget.form?.reportValidity()) return; setStep((current) => current + 1); }}>Siguiente</button> : <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Crear práctica"}</button>}
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

function PracticeDetailModal({ detail, onClose }: Readonly<{ detail: PracticeDetail | null; onClose: () => void }>) {
  const [copied, setCopied] = useState(false);
  if (!detail) return null;
  const shareUrl = detail.shareToken && typeof window !== "undefined" ? `${window.location.origin}/p/${detail.shareToken}` : "";
  const shareTitle = `Práctica: ${detail.title ?? ""}`;
  const shareText = `Práctica ${detail.practice_code ?? ""} — ${detail.title ?? ""}${detail.course_name ? ` (${detail.course_name})` : ""}. Detalles: ${shareUrl}`;

  async function copyLink() {
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
  }
  async function webShare() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try { await (navigator as Navigator & { share: (d: { title: string; text: string; url: string }) => Promise<void> }).share({ title: shareTitle, text: shareText, url: shareUrl }); } catch { /* cancelado */ }
    }
  }
  const canWebShare = typeof navigator !== "undefined" && "share" in navigator;
  const mailto = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  return (
    <ActionModal open title={`${detail.practice_code ?? ""} · ${detail.title ?? "Práctica"}`} description="Detalle de la práctica y opciones para compartirla." onClose={onClose}>
      <div className="modal-form">
        <div className="details-grid">
          <div><small>Curso</small><strong>{detail.course_name ?? "—"}</strong></div>
          <div><small>Responsable</small><strong>{detail.teacher_name ?? "—"}</strong></div>
          <div><small>Inicio</small><strong>{formatDate(detail.starts_at)}</strong></div>
          <div><small>Fin</small><strong>{detail.ends_at ? formatDate(detail.ends_at) : "—"}</strong></div>
          <div><small>Estado</small><strong>{statusLabel(detail.status)}</strong></div>
          {detail.instructions ? <div className="field-span-two"><small>Instrucciones</small><strong>{detail.instructions}</strong></div> : null}
        </div>
        {detail.shareToken ? (
          <>
            <p className="form-section-title" style={{ marginTop: 14 }}>Compartir con estudiantes</p>
            <p className="modal-note">Genera un enlace de solo lectura. Correo y WhatsApp abren la app correspondiente con el mensaje listo; el envío lo confirmas tú (no se envía automáticamente).</p>
            <div className="share-actions">
              <button type="button" className="secondary-button" onClick={() => void copyLink()}>{copied ? "¡Copiado!" : "Copiar enlace"}</button>
              <a className="secondary-button" href={mailto}>Abrir correo</a>
              <a className="secondary-button" href={whatsapp} target="_blank" rel="noreferrer">Abrir WhatsApp</a>
              {canWebShare ? <button type="button" className="secondary-button" onClick={() => void webShare()}>Compartir…</button> : null}
            </div>
          </>
        ) : null}
        <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button></footer>
      </div>
    </ActionModal>
  );
}

function ReservationDetailModal({ detail, onClose, onChanged }: Readonly<{ detail: Record<string, unknown> | null; onClose: () => void; onChanged: () => Promise<void> }>) {
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  async function update(status: string) { setBusy(true); try { const response = await fetch(`/api/education/reservations/${detail!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (response.ok) await onChanged(); } finally { setBusy(false); } }
  return <ActionModal open title={`Reserva ${String(detail.reservation_code ?? "")}`} description="Detalle, preparación y estado de la reserva." onClose={onClose}><div className="modal-form"><div className="details-grid"><div><small>Tipo de recurso</small><strong>{resourceTypeLabel(String(detail.resource_type ?? ""))}</strong></div><div><small>Cantidad</small><strong>{String(detail.quantity ?? "—")} {String(detail.unit ?? "")}</strong></div><div><small>Necesaria el</small><strong>{formatDate(String(detail.needed_at ?? ""))}</strong></div><div><small>Estado</small><strong>{statusLabel(String(detail.status ?? ""))}</strong></div>{detail.notes ? <div className="field-span-two"><small>Notas</small><strong>{String(detail.notes)}</strong></div> : null}</div><footer className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void update("REJECTED")}>Rechazar</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void update("PREPARING")}>Preparar</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void update("READY")}>Marcar lista</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void update("CANCELLED")}>Cancelar</button><button type="button" className="primary-button" disabled={busy} onClick={() => void update("APPROVED")}>Aprobar</button></footer></div></ActionModal>;
}

function NoticeDetailModal({ detail, onClose, onChanged, readOnly = false }: Readonly<{ detail: Record<string, unknown> | null; onClose: () => void; onChanged: () => Promise<void>; readOnly?: boolean }>) {
  const [busy, setBusy] = useState(false);
  if (!detail) return null;
  async function action(actionName: "CANCEL" | "ARCHIVE") { setBusy(true); try { const response = await fetch(`/api/education/notifications/${detail!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }); if (response.ok) await onChanged(); } finally { setBusy(false); } }
  return <ActionModal open title={String(detail.title ?? "Aviso")} description={detail.practice_title ? `Relacionado con ${String(detail.practice_title)}` : "Aviso educativo general"} onClose={onClose}><div className="modal-form"><p>{String(detail.body ?? "")}</p><div className="details-grid"><div><small>Audiencia</small><strong>{String(detail.audience ?? "—")}</strong></div><div><small>Publicación</small><strong>{formatDate(String(detail.publish_at ?? ""))}</strong></div><div><small>Estado</small><strong>{String(detail.status ?? "PUBLICADO")}</strong></div></div><footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>{!readOnly ? <><button type="button" className="secondary-button" disabled={busy} onClick={() => void action("CANCEL")}>Cancelar programación</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void action("ARCHIVE")}>Archivar</button></> : null}</footer></div></ActionModal>;
}

function NotificationModal({
  open,
  practices,
  onClose,
  onSave,
}: Readonly<{
  open: boolean;
  practices: PracticeRow[];
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
}>) {
  const [notificationType, setNotificationType] = useState<"GENERAL" | "PRACTICE">("GENERAL");
  return (
    <ActionModal open={open} title="Publicar aviso" description="El aviso será visible inmediatamente para los destinatarios seleccionados." onClose={onClose}>
      <form className="modal-form" onSubmit={onSave}>
        <div className="form-grid">
          <label><span>Tipo de aviso</span><select name="notificationType" value={notificationType} onChange={(event) => setNotificationType(event.target.value as "GENERAL" | "PRACTICE")}><option value="GENERAL">Aviso general</option><option value="PRACTICE">Relacionado con una práctica</option></select></label>
          {notificationType === "PRACTICE" ? <label><span>Práctica relacionada</span><select name="practiceId" required defaultValue=""><option value="">Selecciona…</option>{practices.filter((practice) => practice.id).map((practice) => <option key={String(practice.id)} value={String(practice.id)}>{practice.practice_code ?? practice.code} · {practice.title}</option>)}</select></label> : null}
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
