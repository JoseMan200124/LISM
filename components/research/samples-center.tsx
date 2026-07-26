"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FlaskConical, MapPin, Plus, Snowflake, TestTube2 } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import {
  SAMPLE_STATUSES,
  SAMPLE_STATUS_LABEL,
  SAMPLE_TYPES,
  SAMPLE_TYPE_LABEL,
  sampleSourceFields,
  sampleTypeFields,
  type SampleField,
  type SampleStatus,
  type SampleType,
} from "@/lib/research";
import { apiMessage, formatDay, formatMoment, useDirectory, useQueryParam, useResearchList } from "@/components/research/research-kit";

// Registro de muestras de investigación. El formulario es dinámico: el tipo de
// muestra decide qué secciones aparecen y qué datos de origen se piden.

type SampleRow = {
  id: string; code: string; alias: string | null; sample_type: string; status: string;
  registered_at: string; collected_on: string | null; collection_place: string | null;
  municipality: string | null; department: string | null;
  project_code: string | null; project_title: string | null; responsible_name: string | null;
  biobank_count: number;
};

type SampleEvent = {
  id: string; event_type: string; previous_status: string | null; new_status: string | null;
  detail: string | null; performed_at: string; performed_by_name: string | null; performed_by_full_name: string | null;
};

type SampleDetail = SampleRow & {
  project_id: string | null;
  source_institution: string | null; collected_by: string | null; collected_at_time: string | null;
  collection_method: string | null; gps_latitude: string | null; gps_longitude: string | null;
  country: string | null; specific_site: string | null; storage_note: string | null;
  storage_location_name: string | null; notes: string | null; registered_by_name: string | null;
  source_details: Record<string, string> | null; type_details: Record<string, string> | null;
  events: SampleEvent[];
  protocols: Array<{ id: string; code: string; title: string; status: string }>;
  biobank: Array<{ id: string; code: string; status: string; storage_kind: string | null; stored_on: string | null; expires_on: string | null }>;
};

const EVENT_LABEL: Record<string, string> = {
  REGISTERED: "Ingresada",
  STATUS_CHANGED: "Cambio de estado",
  ANALYZED: "Analizada",
  REPORTED: "Reportada",
  MOVED: "Movida",
  LINKED_PROTOCOL: "Protocolo asociado",
  STORED: "Ingresada al biobanco",
  NOTE: "Nota",
  DISCARDED: "Descartada",
};

function DynamicFields({ fields, prefix, values }: Readonly<{ fields: readonly SampleField[]; prefix: string; values?: Record<string, string> | null }>) {
  if (!fields.length) return null;
  return (
    <>
      {fields.map((field) => {
        const name = `${prefix}.${field.key}`;
        const defaultValue = values?.[field.key] ?? "";
        if (field.type === "select") {
          return (
            <label key={name}>
              <span>{field.label}</span>
              <select name={name} defaultValue={defaultValue}>
                <option value="">Sin especificar</option>
                {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          );
        }
        if (field.type === "textarea") {
          return <label className="field-span-two" key={name}><span>{field.label}</span><textarea name={name} rows={2} defaultValue={defaultValue} /></label>;
        }
        return (
          <label key={name}>
            <span>{field.label}{field.hint ? <small> ({field.hint})</small> : null}</span>
            <input name={name} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} step={field.type === "number" ? "any" : undefined} defaultValue={defaultValue} />
          </label>
        );
      })}
    </>
  );
}

function collectDynamic(data: FormData, prefix: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (!key.startsWith(`${prefix}.`)) continue;
    const text = String(value).trim();
    if (text) result[key.slice(prefix.length + 1)] = text;
  }
  return result;
}

export function SamplesCenter() {
  const { items, loading, error, reload } = useResearchList<SampleRow>("/api/research/samples");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const initialId = useQueryParam("sampleId");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => { if (initialId) setDetailId(initialId); }, [initialId]);

  const pending = items.filter((sample) => ["REGISTERED", "PENDING_ANALYSIS", "IN_ANALYSIS"].includes(sample.status));
  const stored = items.filter((sample) => Number(sample.biobank_count ?? 0) > 0);
  const rows: TableRow[] = items.map((sample) => ({
    id: sample.id,
    code: sample.code,
    alias: sample.alias ?? "—",
    type: SAMPLE_TYPE_LABEL[sample.sample_type as SampleType] ?? sample.sample_type,
    project: sample.project_code ? `${sample.project_code}` : "Sin proyecto",
    origin: sample.collection_place ?? [sample.municipality, sample.department].filter(Boolean).join(", ") ?? "—",
    collected: formatDay(sample.collected_on),
    responsible: sample.responsible_name ?? "—",
    biobank: Number(sample.biobank_count ?? 0) > 0 ? "En biobanco" : "—",
    status: SAMPLE_STATUS_LABEL[sample.status as SampleStatus] ?? sample.status,
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Muestras" description="Registro único de cada muestra con su origen, responsable, estado e historial." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={9} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Muestras" description="Registro único de cada muestra con su origen, responsable, estado e historial." />
        <ErrorState description={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Muestras" description="Registro único de cada muestra con su origen, responsable, estado e historial.">
        <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Ingresar muestra</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Muestras registradas", value: String(items.length), hint: "Total del laboratorio", icon: TestTube2 },
        { label: "En proceso", value: String(pending.length), hint: "Por analizar o en análisis", icon: FlaskConical },
        { label: "Conservadas", value: String(stored.length), hint: "Con material en biobanco", icon: Snowflake },
      ]} />

      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <SimpleTable
            columns={[
              { key: "code", label: "Código" }, { key: "alias", label: "Alias" }, { key: "type", label: "Tipo" },
              { key: "project", label: "Proyecto" }, { key: "origin", label: "Origen" }, { key: "collected", label: "Recolección" },
              { key: "responsible", label: "Responsable" }, { key: "biobank", label: "Biobanco" }, { key: "status", label: "Estado" },
            ]}
            rows={rows}
            onRowClick={(row) => setDetailId(String(row.id))}
            searchPlaceholder="Buscar por código, alias, origen o proyecto…"
            emptyTitle="Sin muestras"
            emptyMessage="Registra la primera muestra. Puede pertenecer a un proyecto o entrar suelta."
          />
        </div>
      </article>

      {createOpen ? (
        <SampleFormModal onClose={() => setCreateOpen(false)} onSaved={async (code) => { setCreateOpen(false); showToast(`Muestra ${code} registrada.`); await reload(); }} onError={showError} />
      ) : null}
      {detailId ? (
        <SampleDetailModal sampleId={detailId} onClose={() => setDetailId(null)} onChanged={reload} onToast={showToast} onError={showError} />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function SampleFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [sampleType, setSampleType] = useState<SampleType>("BIOLOGICAL");
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [protocols, setProtocols] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [selectedProtocols, setSelectedProtocols] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/research/projects").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/research/protocols").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([projectPayload, protocolPayload]) => {
      if (!active) return;
      setProjects((projectPayload as { data?: Array<{ id: string; code: string; title: string }> }).data ?? []);
      setProtocols((protocolPayload as { data?: Array<{ id: string; code: string; title: string }> }).data ?? []);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alias: String(data.get("alias") ?? "").trim() || undefined,
          sampleType,
          projectId: String(data.get("projectId") ?? "") || null,
          protocolIds: selectedProtocols,
          sourceInstitution: String(data.get("sourceInstitution") ?? "").trim() || undefined,
          collectedBy: String(data.get("collectedBy") ?? "").trim() || undefined,
          collectedOn: String(data.get("collectedOn") ?? "") || null,
          collectedAtTime: String(data.get("collectedAtTime") ?? "") || null,
          collectionPlace: String(data.get("collectionPlace") ?? "").trim() || undefined,
          collectionMethod: String(data.get("collectionMethod") ?? "").trim() || undefined,
          gpsLatitude: String(data.get("gpsLatitude") ?? "") ? Number(data.get("gpsLatitude")) : null,
          gpsLongitude: String(data.get("gpsLongitude") ?? "") ? Number(data.get("gpsLongitude")) : null,
          country: String(data.get("country") ?? "").trim() || undefined,
          department: String(data.get("department") ?? "").trim() || undefined,
          municipality: String(data.get("municipality") ?? "").trim() || undefined,
          specificSite: String(data.get("specificSite") ?? "").trim() || undefined,
          responsibleUserId: String(data.get("responsibleUserId") ?? "") || null,
          storageNote: String(data.get("storageNote") ?? "").trim() || undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
          sourceDetails: collectDynamic(data, "source"),
          typeDetails: collectDynamic(data, "type"),
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo registrar la muestra.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  const typeFields = sampleTypeFields(sampleType);
  const sourceFields = sampleSourceFields(sampleType);

  return (
    <ActionModal open wide eyebrow="INVESTIGACIÓN" title="Ingresar muestra" description="El tipo de muestra decide qué datos se piden. El proyecto es opcional: hay muestras que entran sueltas." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <span className="form-section-title field-span-two">Identificación</span>
          <label><span>Tipo de muestra *</span>
            <select value={sampleType} onChange={(event) => setSampleType(event.target.value as SampleType)} required>
              {SAMPLE_TYPES.map((type) => <option key={type} value={type}>{SAMPLE_TYPE_LABEL[type]}</option>)}
            </select>
          </label>
          <label><span>Nombre o alias</span><input name="alias" maxLength={200} placeholder="Como la identifica el equipo" /></label>
          <label><span>Proyecto asociado</span>
            <select name="projectId" defaultValue="">
              <option value="">Sin proyecto (muestra suelta)</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
            </select>
          </label>
          <label><span>Responsable</span>
            <select name="responsibleUserId" defaultValue="">
              <option value="">Yo mismo</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <p className="modal-note field-span-two">El código interno y su etiqueta QR se generan automáticamente al guardar.</p>

          <span className="form-section-title field-span-two"><MapPin size={14} /> Origen de la muestra</span>
          <label><span>Institución de origen</span><input name="sourceInstitution" /></label>
          <label><span>Persona que recolectó</span><input name="collectedBy" /></label>
          <label><span>Fecha de recolección</span><input name="collectedOn" type="date" /></label>
          <label><span>Hora de recolección</span><input name="collectedAtTime" type="time" /></label>
          <label className="field-span-two"><span>Lugar de recolección</span><input name="collectionPlace" /></label>
          <label><span>Método de recolección</span><input name="collectionMethod" /></label>
          <label><span>País</span><input name="country" defaultValue="Guatemala" /></label>
          <label><span>Departamento</span><input name="department" /></label>
          <label><span>Municipio</span><input name="municipality" /></label>
          <label className="field-span-two"><span>Sitio específico</span><input name="specificSite" /></label>
          <label><span>Latitud GPS</span><input name="gpsLatitude" type="number" step="any" placeholder="Opcional" /></label>
          <label><span>Longitud GPS</span><input name="gpsLongitude" type="number" step="any" placeholder="Opcional" /></label>

          {sourceFields.length ? (
            <>
              <span className="form-section-title field-span-two">Información del donante o fuente</span>
              <DynamicFields fields={sourceFields} prefix="source" />
            </>
          ) : null}

          <span className="form-section-title field-span-two">Datos de la muestra {SAMPLE_TYPE_LABEL[sampleType].toLowerCase()}</span>
          <DynamicFields fields={typeFields} prefix="type" />

          <span className="form-section-title field-span-two">Protocolos y almacenamiento</span>
          <div className="field-span-two">
            <span className="weekday-picker-label">Protocolos asociados</span>
            <div className="checkbox-grid">
              {protocols.map((protocol) => (
                <label className="check-line" key={protocol.id}>
                  <input
                    type="checkbox"
                    checked={selectedProtocols.includes(protocol.id)}
                    onChange={(event) => setSelectedProtocols((current) => event.target.checked ? [...current, protocol.id] : current.filter((id) => id !== protocol.id))}
                  />
                  <span>{protocol.code} · {protocol.title}</span>
                </label>
              ))}
              {protocols.length === 0 ? <p className="modal-note">Todavía no hay protocolos registrados.</p> : null}
            </div>
          </div>
          <label className="field-span-two"><span>Ubicación de almacenamiento</span><input name="storageNote" placeholder="Refrigerador 2, gaveta B" /></label>
          <label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Registrando…" : "Registrar muestra"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function SampleDetailModal({ sampleId, onClose, onChanged, onToast, onError }: Readonly<{
  sampleId: string; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<SampleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("data");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/samples/${sampleId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir la muestra.")); return; }
      const payload = await response.json() as { data?: SampleDetail };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [sampleId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/research/samples/${sampleId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
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

  const typeFields = detail ? sampleTypeFields(detail.sample_type) : [];
  const sourceFields = detail ? sampleSourceFields(detail.sample_type) : [];

  return (
    <ActionModal
      open wide eyebrow="MUESTRA"
      title={detail ? `${detail.code}${detail.alias ? ` · ${detail.alias}` : ""}` : "Muestra"}
      description="Ficha completa: origen, datos por tipo, protocolos, biobanco e historial."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando muestra…</p> : (
          <>
            <div className="details-grid">
              <div><small>Tipo</small><strong>{SAMPLE_TYPE_LABEL[detail.sample_type as SampleType] ?? detail.sample_type}</strong></div>
              <div><small>Estado</small><strong>{SAMPLE_STATUS_LABEL[detail.status as SampleStatus] ?? detail.status}</strong></div>
              <div><small>Proyecto</small><strong>{detail.project_code ? `${detail.project_code} · ${detail.project_title}` : "Sin proyecto"}</strong></div>
              <div><small>Responsable</small><strong>{detail.responsible_name ?? "—"}</strong></div>
              <div><small>Registrada por</small><strong>{detail.registered_by_name ?? "—"}</strong></div>
              <div><small>Fecha de registro</small><strong>{formatMoment(detail.registered_at)}</strong></div>
            </div>

            <div className="research-status-bar">
              <span className="field-label">Cambiar estado</span>
              <div className="filter-chip-row">
                {SAMPLE_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`filter-chip${detail.status === status ? " filter-chip-active" : ""}`}
                    disabled={busy || detail.status === status}
                    onClick={() => void act({ action: "STATUS", status }, `Muestra marcada como ${SAMPLE_STATUS_LABEL[status].toLowerCase()}.`)}
                  >
                    {SAMPLE_STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <Tabs
              items={[{ key: "data", label: "Datos" }, { key: "history", label: "Historial" }, { key: "biobank", label: "Biobanco" }]}
              active={tab}
              onChange={setTab}
            />

            {tab === "data" ? (
              <div className="research-panel">
                <h4>Origen</h4>
                <div className="details-grid">
                  <div><small>Institución</small><strong>{detail.source_institution ?? "—"}</strong></div>
                  <div><small>Recolectó</small><strong>{detail.collected_by ?? "—"}</strong></div>
                  <div><small>Fecha y hora</small><strong>{formatDay(detail.collected_on)}{detail.collected_at_time ? ` · ${String(detail.collected_at_time).slice(0, 5)}` : ""}</strong></div>
                  <div><small>Lugar</small><strong>{detail.collection_place ?? "—"}</strong></div>
                  <div><small>Método</small><strong>{detail.collection_method ?? "—"}</strong></div>
                  <div><small>Ubicación</small><strong>{[detail.specific_site, detail.municipality, detail.department, detail.country].filter(Boolean).join(", ") || "—"}</strong></div>
                  {detail.gps_latitude && detail.gps_longitude ? (
                    <div><small>Coordenadas GPS</small><strong>{detail.gps_latitude}, {detail.gps_longitude}</strong></div>
                  ) : null}
                  <div><small>Almacenamiento</small><strong>{detail.storage_note ?? detail.storage_location_name ?? "—"}</strong></div>
                </div>

                {sourceFields.length && detail.source_details && Object.keys(detail.source_details).length ? (
                  <>
                    <h4>Donante o fuente</h4>
                    <div className="details-grid">
                      {sourceFields.filter((field) => detail.source_details?.[field.key]).map((field) => (
                        <div key={field.key}><small>{field.label}</small><strong>{detail.source_details?.[field.key]}</strong></div>
                      ))}
                    </div>
                  </>
                ) : null}

                {typeFields.length && detail.type_details && Object.keys(detail.type_details).length ? (
                  <>
                    <h4>Datos de la muestra</h4>
                    <div className="details-grid">
                      {typeFields.filter((field) => detail.type_details?.[field.key]).map((field) => (
                        <div key={field.key}><small>{field.label}</small><strong>{detail.type_details?.[field.key]}</strong></div>
                      ))}
                    </div>
                  </>
                ) : null}

                {detail.protocols.length ? (
                  <>
                    <h4>Protocolos asociados</h4>
                    <ul className="research-list">
                      {detail.protocols.map((protocol) => <li key={protocol.id}><strong>{protocol.code}</strong><span>{protocol.title}</span></li>)}
                    </ul>
                  </>
                ) : null}

                {detail.notes ? <><h4>Observaciones</h4><p className="research-preserve">{detail.notes}</p></> : null}

                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const note = String(data.get("note") ?? "").trim();
                    if (note.length < 2) return;
                    void act({ action: "NOTE", detail: note }, "Nota añadida al historial.");
                    event.currentTarget.reset();
                  }}
                >
                  <label><span>Añadir una nota al historial</span><input name="note" placeholder="Qué se hizo con la muestra" /></label>
                  <div className="modal-actions"><button type="submit" className="secondary-button" disabled={busy}>Añadir nota</button></div>
                </form>
              </div>
            ) : null}

            {tab === "history" ? (
              <div className="research-panel">
                <p className="form-help">Quién hizo qué con la muestra, en orden.</p>
                <div className="definition-list">
                  {detail.events.map((event) => (
                    <article className="definition-row" key={event.id}>
                      <div>
                        <strong>{EVENT_LABEL[event.event_type] ?? event.event_type}</strong>
                        <p>
                          {event.detail ?? "—"}
                          {event.previous_status && event.new_status
                            ? ` (${SAMPLE_STATUS_LABEL[event.previous_status as SampleStatus] ?? event.previous_status} → ${SAMPLE_STATUS_LABEL[event.new_status as SampleStatus] ?? event.new_status})`
                            : ""}
                        </p>
                      </div>
                      <small>{event.performed_by_full_name ?? event.performed_by_name ?? "—"}</small>
                      <em>{formatMoment(event.performed_at)}</em>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "biobank" ? (
              <div className="research-panel">
                {detail.biobank.length ? (
                  <ul className="research-list">
                    {detail.biobank.map((entry) => (
                      <li key={entry.id}>
                        <strong>{entry.code}</strong>
                        <span>{entry.status}{entry.storage_kind ? ` · ${entry.storage_kind}` : ""}</span>
                        <em>{formatDay(entry.stored_on)}{entry.expires_on ? ` → ${formatDay(entry.expires_on)}` : ""}</em>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="modal-note">Esta muestra no está en el biobanco. Puedes ingresarla desde el módulo Biobancos seleccionando su código.</p>
                )}
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
