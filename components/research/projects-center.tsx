"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarRange, FlaskConical, FolderKanban, Link2, Plus, Trash2, UsersRound } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import {
  MILESTONE_STATUSES,
  MILESTONE_STATUS_LABEL,
  PROJECT_LINK_LABEL,
  PROJECT_LINK_TYPES,
  PROJECT_ROLES,
  PROJECT_ROLE_LABEL,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABEL,
  type MilestoneStatus,
  type ProjectLinkType,
  type ProjectRole,
  type ProjectStatus,
} from "@/lib/research";
import { apiMessage, formatDay, formatMoment, useDirectory, useQueryParam, useResearchList } from "@/components/research/research-kit";

// Gestión de proyectos de investigación: objetivos, cronograma, equipo,
// relaciones con el resto del laboratorio y el historial de todo lo hecho.

type ProjectRow = {
  id: string; code: string; title: string; summary: string | null; status: string;
  funding_source: string | null; starts_on: string | null; ends_on: string | null;
  principal_investigator_name: string | null; member_count: number; sample_count: number;
  milestone_count: number; milestone_done_count: number;
};

type Member = { id: string; user_id: string; full_name: string; email: string; role_in_project: string };
type Milestone = {
  id: string; title: string; detail: string | null; starts_on: string | null; due_on: string | null;
  completed_on: string | null; status: string; responsible_name: string | null;
};
type ProjectLink = { id: string; entity_type: string; entity_id: string; entity_label: string | null; entity_code: string | null; note: string | null };
type HistoryRow = { action: string; reason: string | null; created_at: string; actor_name: string | null };

type ProjectDetail = ProjectRow & {
  objectives: string | null;
  principal_investigator_id: string | null;
  members: Member[];
  milestones: Milestone[];
  links: ProjectLink[];
  samples: Array<{ id: string; code: string; alias: string | null; status: string; registered_at: string }>;
  notebooks: Array<{ id: string; code: string; title: string; status: string }>;
  documents: Array<{ id: string; code: string; title: string; category: string; current_version: number }>;
  entries: Array<{ id: string; entry_code: string; title: string; performed_on: string; status: string; created_by_name: string | null }>;
  history: HistoryRow[];
};

const HISTORY_LABEL: Record<string, string> = {
  RESEARCH_PROJECT_CREATED: "Proyecto creado",
  RESEARCH_PROJECT_UPDATED: "Proyecto actualizado",
  RESEARCH_PROJECT_MEMBER_ADDED: "Investigador añadido",
  RESEARCH_PROJECT_MEMBER_REMOVED: "Investigador retirado",
  RESEARCH_MILESTONE_CREATED: "Hito añadido",
  RESEARCH_MILESTONE_UPDATED: "Hito actualizado",
  RESEARCH_MILESTONE_REMOVED: "Hito eliminado",
  RESEARCH_PROJECT_LINKED: "Recurso vinculado",
  RESEARCH_PROJECT_UNLINKED: "Vínculo eliminado",
  RESEARCH_SAMPLE_REGISTERED: "Muestra registrada",
  RESEARCH_SAMPLE_UPDATED: "Muestra actualizada",
  RESEARCH_SAMPLE_STATUS_CHANGED: "Muestra: cambio de estado",
  BIOBANK_ENTRY_CREATED: "Ingreso al biobanco",
  BIOBANK_ENTRY_UPDATED: "Biobanco actualizado",
  BIOBANK_MOVEMENT_REGISTERED: "Movimiento de biobanco",
  BIOBANK_QUALITY_CHECK: "Control de calidad",
  NOTEBOOK_CREATED: "Cuaderno creado",
  NOTEBOOK_ENTRY_CREATED: "Experimento registrado",
  NOTEBOOK_ENTRY_UPDATED: "Experimento modificado",
  NOTEBOOK_ENTRY_SIGNED: "Experimento firmado",
  NOTEBOOK_ENTRY_WITNESSED: "Experimento atestiguado",
  NOTEBOOK_ENTRY_COMPLETED: "Experimento completado",
  PROTOCOL_CREATED: "Protocolo creado",
  RESEARCH_DOCUMENT_CREATED: "Documento cargado",
};

export function ProjectsCenter() {
  const { items, loading, error, reload } = useResearchList<ProjectRow>("/api/research/projects");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const initialId = useQueryParam("projectId");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => { if (initialId) setDetailId(initialId); }, [initialId]);

  const active = items.filter((project) => project.status === "ACTIVE");
  const rows: TableRow[] = items.map((project) => ({
    id: project.id,
    code: project.code,
    title: project.title,
    pi: project.principal_investigator_name ?? "—",
    team: `${project.member_count} persona(s)`,
    samples: String(project.sample_count),
    schedule: project.milestone_count ? `${project.milestone_done_count}/${project.milestone_count} hitos` : "Sin cronograma",
    period: `${formatDay(project.starts_on)} → ${formatDay(project.ends_on)}`,
    status: PROJECT_STATUS_LABEL[project.status as ProjectStatus] ?? project.status,
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Proyectos" description="Objetivos, cronograma, equipo y todo lo que se ha hecho en cada línea de trabajo." />
        <SkeletonKpiGrid cols={4} />
        <SkeletonTable rows={5} cols={8} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Proyectos" description="Objetivos, cronograma, equipo y todo lo que se ha hecho en cada línea de trabajo." />
        <ErrorState description={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Proyectos" description="Objetivos, cronograma, equipo y todo lo que se ha hecho en cada línea de trabajo.">
        <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nuevo proyecto</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Proyectos activos", value: String(active.length), hint: `${items.length} en total`, icon: FolderKanban },
        { label: "Investigadores", value: String(active.reduce((sum, project) => sum + Number(project.member_count ?? 0), 0)), hint: "En proyectos activos", icon: UsersRound },
        { label: "Muestras asociadas", value: String(items.reduce((sum, project) => sum + Number(project.sample_count ?? 0), 0)), hint: "Registradas por proyecto", icon: FlaskConical },
        { label: "Hitos cumplidos", value: `${items.reduce((sum, p) => sum + Number(p.milestone_done_count ?? 0), 0)}/${items.reduce((sum, p) => sum + Number(p.milestone_count ?? 0), 0)}`, hint: "Cronograma general", icon: CalendarRange },
      ]} />

      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <SimpleTable
            columns={[
              { key: "code", label: "Código" }, { key: "title", label: "Proyecto" },
              { key: "pi", label: "Investigador principal" }, { key: "team", label: "Equipo" },
              { key: "samples", label: "Muestras" }, { key: "schedule", label: "Cronograma" },
              { key: "period", label: "Periodo" }, { key: "status", label: "Estado" },
            ]}
            rows={rows}
            onRowClick={(row) => setDetailId(String(row.id))}
            searchPlaceholder="Buscar proyecto o investigador…"
            emptyTitle="Sin proyectos"
            emptyMessage="Crea el primer proyecto para agrupar muestras, protocolos, cuadernos y documentos."
          />
        </div>
      </article>

      {createOpen ? (
        <ProjectFormModal
          onClose={() => setCreateOpen(false)}
          onSaved={async (code) => { setCreateOpen(false); showToast(`Proyecto ${code} creado.`); await reload(); }}
          onError={showError}
        />
      ) : null}
      {detailId ? (
        <ProjectDetailModal
          projectId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={reload}
          onToast={showToast}
          onError={showError}
        />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ProjectFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void;
  onSaved: (code: string) => void | Promise<void>;
  onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<string[]>([]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? "").trim(),
          summary: String(data.get("summary") ?? "").trim() || undefined,
          objectives: String(data.get("objectives") ?? "").trim() || undefined,
          status: String(data.get("status") ?? "DRAFT"),
          fundingSource: String(data.get("fundingSource") ?? "").trim() || undefined,
          startsOn: String(data.get("startsOn") ?? "") || null,
          endsOn: String(data.get("endsOn") ?? "") || null,
          principalInvestigatorId: String(data.get("principalInvestigatorId") ?? "") || null,
          memberIds: members,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo crear el proyecto.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="INVESTIGACIÓN" title="Nuevo proyecto" description="Define el alcance, el periodo y el equipo. Todo lo demás se irá asociando al proyecto conforme se trabaje." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título del proyecto *</span><input name="title" required minLength={3} maxLength={240} /></label>
          <label className="field-span-two"><span>Descripción</span><textarea name="summary" rows={2} placeholder="De qué trata el proyecto" /></label>
          <label className="field-span-two"><span>Objetivos</span><textarea name="objectives" rows={4} placeholder="Objetivo general y objetivos específicos" /></label>
          <label><span>Estado</span>
            <select name="status" defaultValue="ACTIVE">
              {PROJECT_STATUSES.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABEL[status]}</option>)}
            </select>
          </label>
          <label><span>Financiamiento</span><input name="fundingSource" placeholder="Fondo, convocatoria o institución" /></label>
          <label><span>Inicio</span><input name="startsOn" type="date" /></label>
          <label><span>Fin previsto</span><input name="endsOn" type="date" /></label>
          <label className="field-span-two"><span>Investigador principal</span>
            <select name="principalInvestigatorId" defaultValue="">
              <option value="">Sin asignar</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <div className="field-span-two">
            <span className="weekday-picker-label">Investigadores participantes</span>
            <div className="checkbox-grid">
              {directory.map((user) => (
                <label className="check-line" key={user.id}>
                  <input
                    type="checkbox"
                    checked={members.includes(user.id)}
                    onChange={(event) => setMembers((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))}
                  />
                  <span>{user.full_name}</span>
                </label>
              ))}
              {directory.length === 0 ? <p className="modal-note">Aún no hay usuarios en el laboratorio.</p> : null}
            </div>
          </div>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando…" : "Crear proyecto"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function ProjectDetailModal({ projectId, onClose, onChanged, onToast, onError }: Readonly<{
  projectId: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [linkOptions, setLinkOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [linkType, setLinkType] = useState<ProjectLinkType>("PROTOCOL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/projects/${projectId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el proyecto.")); return; }
      const payload = await response.json() as { data?: ProjectDetail };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [projectId, onError]);

  useEffect(() => { void load(); }, [load]);

  // Opciones vinculables según el tipo elegido: se leen del módulo que
  // corresponde para no duplicar catálogos.
  useEffect(() => {
    const endpoints: Record<ProjectLinkType, string> = {
      PROTOCOL: "/api/research/protocols",
      SAMPLE: "/api/research/samples",
      EQUIPMENT: "/api/equipment",
      INVENTORY_ITEM: "/api/inventory",
      BIOBANK_ENTRY: "/api/research/biobank",
      NOTEBOOK: "/api/research/notebooks",
      DOCUMENT: "/api/research/documents",
    };
    let active = true;
    void fetch(endpoints[linkType])
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .catch(() => ({ data: [] }))
      .then((payload: { data?: Array<Record<string, unknown>> }) => {
        if (!active) return;
        setLinkOptions((payload.data ?? []).map((row) => ({
          id: String(row.id ?? ""),
          label: [row.code ?? row.sku, row.title ?? row.name ?? row.alias].filter(Boolean).join(" · ") || String(row.id ?? ""),
        })).filter((option) => option.id));
      });
    return () => { active = false; };
  }, [linkType]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/research/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo completar la acción.")); return; }
      onToast(successMessage);
      await load();
      await onChanged();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionModal
      open
      wide
      eyebrow="PROYECTO"
      title={detail ? `${detail.code} · ${detail.title}` : "Proyecto"}
      description="Todo lo relacionado con el proyecto: cronograma, equipo, recursos e historial."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando proyecto…</p> : (
          <>
            <Tabs
              items={[
                { key: "overview", label: "Resumen" },
                { key: "schedule", label: "Cronograma" },
                { key: "team", label: "Equipo" },
                { key: "links", label: "Relaciones" },
                { key: "history", label: "Historial" },
              ]}
              active={tab}
              onChange={setTab}
            />

            {tab === "overview" ? (
              <div className="research-panel">
                <div className="details-grid">
                  <div><small>Estado</small><strong>{PROJECT_STATUS_LABEL[detail.status as ProjectStatus] ?? detail.status}</strong></div>
                  <div><small>Investigador principal</small><strong>{detail.principal_investigator_name ?? "—"}</strong></div>
                  <div><small>Periodo</small><strong>{formatDay(detail.starts_on)} → {formatDay(detail.ends_on)}</strong></div>
                  <div><small>Financiamiento</small><strong>{detail.funding_source ?? "—"}</strong></div>
                  <div><small>Muestras</small><strong>{detail.samples.length}</strong></div>
                  <div><small>Experimentos</small><strong>{detail.entries.length}</strong></div>
                </div>
                {detail.summary ? <div className="definition-row"><div><strong>Descripción</strong><p>{detail.summary}</p></div></div> : null}
                {detail.objectives ? <div className="definition-row"><div><strong>Objetivos</strong><p className="research-preserve">{detail.objectives}</p></div></div> : null}

                <ProjectStatusBar detail={detail} disabled={busy} onChange={(status) => void act({ action: "UPDATE", status }, "Estado del proyecto actualizado.")} />

                <div className="research-columns">
                  <section>
                    <h4>Muestras del proyecto</h4>
                    {detail.samples.length ? (
                      <ul className="research-list">
                        {detail.samples.slice(0, 8).map((sample) => (
                          <li key={sample.id}><strong>{sample.code}</strong><span>{sample.alias ?? "Sin alias"}</span><em>{formatDay(sample.registered_at)}</em></li>
                        ))}
                      </ul>
                    ) : <p className="modal-note">Sin muestras asociadas todavía.</p>}
                  </section>
                  <section>
                    <h4>Cuadernos</h4>
                    {detail.notebooks.length ? (
                      <ul className="research-list">
                        {detail.notebooks.map((notebook) => <li key={notebook.id}><strong>{notebook.code}</strong><span>{notebook.title}</span></li>)}
                      </ul>
                    ) : <p className="modal-note">Sin cuadernos asociados.</p>}
                  </section>
                  <section>
                    <h4>Documentos</h4>
                    {detail.documents.length ? (
                      <ul className="research-list">
                        {detail.documents.slice(0, 8).map((document) => <li key={document.id}><strong>{document.code}</strong><span>{document.title}</span><em>v{document.current_version}</em></li>)}
                      </ul>
                    ) : <p className="modal-note">Sin documentos asociados.</p>}
                  </section>
                </div>
              </div>
            ) : null}

            {tab === "schedule" ? (
              <ScheduleTab detail={detail} directory={directory} busy={busy} onAct={act} />
            ) : null}

            {tab === "team" ? (
              <TeamTab detail={detail} directory={directory} busy={busy} onAct={act} />
            ) : null}

            {tab === "links" ? (
              <div className="research-panel">
                <p className="form-help">Vincula lo que el proyecto usa: protocolos, muestras, equipos, reactivos, biobancos, cuadernos y documentos.</p>
                <div className="form-grid form-grid-two">
                  <label>
                    <span>Tipo</span>
                    <select value={linkType} onChange={(event) => setLinkType(event.target.value as ProjectLinkType)}>
                      {PROJECT_LINK_TYPES.map((type) => <option key={type} value={type}>{PROJECT_LINK_LABEL[type]}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Registro</span>
                    <select id="project-link-entity" defaultValue="">
                      <option value="">Selecciona…</option>
                      {linkOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <div className="field-span-two">
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => {
                        const select = document.getElementById("project-link-entity") as HTMLSelectElement | null;
                        const entityId = select?.value;
                        if (!entityId) { onError("Elige el registro que quieres vincular."); return; }
                        void act({ action: "ADD_LINK", entityType: linkType, entityId }, "Recurso vinculado al proyecto.");
                      }}
                    >
                      <Link2 size={15} /> Vincular
                    </button>
                  </div>
                </div>
                {detail.links.length ? (
                  <ul className="research-list">
                    {detail.links.map((link) => (
                      <li key={link.id}>
                        <strong>{PROJECT_LINK_LABEL[link.entity_type as ProjectLinkType] ?? link.entity_type}</strong>
                        <span>{link.entity_code ? `${link.entity_code} · ` : ""}{link.entity_label ?? "Registro"}</span>
                        <button type="button" className="icon-button" aria-label="Quitar vínculo" disabled={busy} onClick={() => void act({ action: "REMOVE_LINK", linkId: link.id }, "Vínculo eliminado.")}>
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="modal-note">Todavía no hay recursos vinculados.</p>}
              </div>
            ) : null}

            {tab === "history" ? (
              <div className="research-panel">
                <p className="form-help">Todo lo que ha pasado en el proyecto, de lo más reciente a lo más antiguo.</p>
                {detail.history.length ? (
                  <div className="definition-list">
                    {detail.history.map((event, index) => (
                      <article className="definition-row" key={`${event.created_at}-${index}`}>
                        <div>
                          <strong>{HISTORY_LABEL[event.action] ?? event.action}</strong>
                          <p>{event.reason ?? "—"}</p>
                        </div>
                        <small>{event.actor_name ?? "Sistema"}</small>
                        <em>{formatMoment(event.created_at)}</em>
                      </article>
                    ))}
                  </div>
                ) : <p className="modal-note">Sin movimientos registrados todavía.</p>}
              </div>
            ) : null}
          </>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </ActionModal>
  );
}

function ProjectStatusBar({ detail, disabled, onChange }: Readonly<{ detail: ProjectDetail; disabled: boolean; onChange: (status: ProjectStatus) => void }>) {
  return (
    <div className="research-status-bar">
      <span className="field-label">Cambiar estado</span>
      <div className="filter-chip-row">
        {PROJECT_STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className={`filter-chip${detail.status === status ? " filter-chip-active" : ""}`}
            disabled={disabled || detail.status === status}
            onClick={() => onChange(status)}
          >
            {PROJECT_STATUS_LABEL[status]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScheduleTab({ detail, directory, busy, onAct }: Readonly<{
  detail: ProjectDetail;
  directory: ReturnType<typeof useDirectory>;
  busy: boolean;
  onAct: (body: Record<string, unknown>, message: string) => Promise<void>;
}>) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="research-panel">
      <div className="section-heading">
        <div><h4>Cronograma</h4><p>Etapas del proyecto con responsable y fecha objetivo.</p></div>
        <button type="button" className="secondary-button" onClick={() => setAdding((current) => !current)}>
          <Plus size={15} /> {adding ? "Cancelar" : "Nuevo hito"}
        </button>
      </div>

      {adding ? (
        <form
          className="form-grid form-grid-two"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onAct({
              action: "ADD_MILESTONE",
              title: String(data.get("title") ?? "").trim(),
              detail: String(data.get("detail") ?? "").trim() || undefined,
              startsOn: String(data.get("startsOn") ?? "") || null,
              dueOn: String(data.get("dueOn") ?? "") || null,
              responsibleUserId: String(data.get("responsibleUserId") ?? "") || null,
            }, "Hito añadido al cronograma.").then(() => setAdding(false));
          }}
        >
          <label className="field-span-two"><span>Etapa o hito *</span><input name="title" required minLength={2} /></label>
          <label className="field-span-two"><span>Detalle</span><textarea name="detail" rows={2} /></label>
          <label><span>Inicio</span><input name="startsOn" type="date" /></label>
          <label><span>Fecha objetivo</span><input name="dueOn" type="date" /></label>
          <label className="field-span-two"><span>Responsable</span>
            <select name="responsibleUserId" defaultValue="">
              <option value="">Sin asignar</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <footer className="modal-actions field-span-two">
            <button type="submit" className="primary-button" disabled={busy}>Añadir hito</button>
          </footer>
        </form>
      ) : null}

      {detail.milestones.length ? (
        <ol className="research-timeline">
          {detail.milestones.map((milestone) => (
            <li key={milestone.id} className={`research-timeline-item research-milestone-${milestone.status.toLowerCase()}`}>
              <div>
                <strong>{milestone.title}</strong>
                {milestone.detail ? <p>{milestone.detail}</p> : null}
                <small>
                  {formatDay(milestone.starts_on)} → {formatDay(milestone.due_on)}
                  {milestone.responsible_name ? ` · ${milestone.responsible_name}` : ""}
                  {milestone.completed_on ? ` · Completado el ${formatDay(milestone.completed_on)}` : ""}
                </small>
              </div>
              <div className="research-timeline-actions">
                <select
                  value={milestone.status}
                  disabled={busy}
                  onChange={(event) => void onAct({ action: "UPDATE_MILESTONE", milestoneId: milestone.id, status: event.target.value as MilestoneStatus }, "Cronograma actualizado.")}
                >
                  {MILESTONE_STATUSES.map((status) => <option key={status} value={status}>{MILESTONE_STATUS_LABEL[status]}</option>)}
                </select>
                <button type="button" className="icon-button" aria-label="Eliminar hito" disabled={busy} onClick={() => void onAct({ action: "REMOVE_MILESTONE", milestoneId: milestone.id }, "Hito eliminado.")}>
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : <p className="modal-note">El proyecto todavía no tiene cronograma.</p>}
    </div>
  );
}

function TeamTab({ detail, directory, busy, onAct }: Readonly<{
  detail: ProjectDetail;
  directory: ReturnType<typeof useDirectory>;
  busy: boolean;
  onAct: (body: Record<string, unknown>, message: string) => Promise<void>;
}>) {
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<ProjectRole>("RESEARCHER");
  const assigned = new Set(detail.members.map((member) => member.user_id));

  return (
    <div className="research-panel">
      <div className="form-grid form-grid-two">
        <label><span>Investigador</span>
          <select value={userId} onChange={(event) => setUserId(event.target.value)}>
            <option value="">Selecciona…</option>
            {directory.filter((user) => !assigned.has(user.id)).map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
          </select>
        </label>
        <label><span>Rol en el proyecto</span>
          <select value={role} onChange={(event) => setRole(event.target.value as ProjectRole)}>
            {PROJECT_ROLES.map((option) => <option key={option} value={option}>{PROJECT_ROLE_LABEL[option]}</option>)}
          </select>
        </label>
        <div className="field-span-two">
          <button type="button" className="secondary-button" disabled={busy || !userId} onClick={() => void onAct({ action: "ADD_MEMBER", userId, roleInProject: role }, "Investigador añadido.").then(() => setUserId(""))}>
            <Plus size={15} /> Añadir al proyecto
          </button>
        </div>
      </div>

      {detail.members.length ? (
        <ul className="research-list">
          {detail.members.map((member) => (
            <li key={member.id}>
              <strong>{member.full_name}</strong>
              <span>{PROJECT_ROLE_LABEL[member.role_in_project as ProjectRole] ?? member.role_in_project}</span>
              <em>{member.email}</em>
              <button type="button" className="icon-button" aria-label="Quitar del proyecto" disabled={busy} onClick={() => void onAct({ action: "REMOVE_MEMBER", userId: member.user_id }, "Investigador retirado.")}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="modal-note">El proyecto no tiene investigadores asignados.</p>}
    </div>
  );
}
