"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpenCheck, History, LockKeyhole, NotebookPen, PenLine, Plus } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import { NOTEBOOK_ENTRY_STATUS_LABEL, requiresChangeReason } from "@/lib/research";
import { SignatureList, type StampedSignature } from "@/components/signature";
import { apiMessage, formatDay, formatMoment, toDateInput, useDirectory, useResearchList } from "@/components/research/research-kit";

// Cuaderno electrónico de laboratorio: experimentos con resultados,
// observaciones, versionado, historial de modificaciones y firma electrónica.

type Notebook = {
  id: string; code: string; title: string; description: string | null; status: string;
  project_code: string | null; project_title: string | null; owner_name: string | null;
  entry_count: number; last_entry_on: string | null;
};

type EntryRow = {
  id: string; entry_code: string; title: string; performed_on: string; status: string;
  version_number: number; signed_at: string | null;
  notebook_code: string; notebook_title: string;
  project_code: string | null; sample_code: string | null; protocol_code: string | null;
  created_by_name: string | null;
};

type EntryVersion = { id: string; version_number: number; change_reason: string | null; changed_at: string; changed_by_name: string | null };

type EntryDetail = EntryRow & {
  objective: string | null; procedure_text: string | null; results: string | null;
  conclusions: string | null; observations: string | null;
  project_title: string | null; sample_alias: string | null; protocol_title: string | null;
  versions: EntryVersion[];
  signatures: StampedSignature[];
};

export function NotebookCenter() {
  const notebooks = useResearchList<Notebook>("/api/research/notebooks");
  const entries = useResearchList<EntryRow>("/api/research/notebooks/entries");
  const [tab, setTab] = useState("entries");
  const [notebookOpen, setNotebookOpen] = useState(false);
  const [entryOpen, setEntryOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const loading = notebooks.loading || entries.loading;
  const error = notebooks.error ?? entries.error;

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Cuaderno electrónico" description="Registra experimentos con resultados, observaciones, versionado y firma." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={7} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Cuaderno electrónico" description="Registra experimentos con resultados, observaciones, versionado y firma." />
        <ErrorState description={error} onRetry={() => void Promise.all([notebooks.reload(), entries.reload()])} />
      </div>
    );
  }

  const signed = entries.items.filter((entry) => entry.status === "SIGNED" || entry.status === "WITNESSED");
  const entryRows: TableRow[] = entries.items.map((entry) => ({
    id: entry.id,
    code: entry.entry_code,
    title: entry.title,
    notebook: entry.notebook_code,
    project: entry.project_code ?? "—",
    sample: entry.sample_code ?? "—",
    performed: formatDay(entry.performed_on),
    author: entry.created_by_name ?? "—",
    version: `v${entry.version_number}`,
    status: NOTEBOOK_ENTRY_STATUS_LABEL[entry.status] ?? entry.status,
  }));

  const notebookRows: TableRow[] = notebooks.items.map((notebook) => ({
    id: notebook.id,
    code: notebook.code,
    title: notebook.title,
    project: notebook.project_code ?? "Sin proyecto",
    owner: notebook.owner_name ?? "—",
    entries: String(notebook.entry_count ?? 0),
    last: formatDay(notebook.last_entry_on),
    status: notebook.status === "ACTIVE" ? "Activo" : notebook.status,
  }));

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Cuaderno electrónico" description="Registra experimentos con resultados, observaciones, versionado y firma.">
        <button className="secondary-button" onClick={() => setNotebookOpen(true)}><Plus size={15} /> Nuevo cuaderno</button>
        <button className="primary-button" disabled={!notebooks.items.length} onClick={() => setEntryOpen(true)}><Plus size={15} /> Registrar experimento</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Cuadernos", value: String(notebooks.items.length), hint: "Activos en el laboratorio", icon: NotebookPen },
        { label: "Experimentos", value: String(entries.items.length), hint: "Registrados", icon: BookOpenCheck },
        { label: "Firmados", value: String(signed.length), hint: "Con firma electrónica", icon: PenLine },
      ]} />

      <article className="panel configuration-panel">
        <Tabs items={[{ key: "entries", label: "Experimentos" }, { key: "notebooks", label: "Cuadernos" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "entries" ? (
            <SimpleTable
              columns={[
                { key: "code", label: "Código" }, { key: "title", label: "Experimento" }, { key: "notebook", label: "Cuaderno" },
                { key: "project", label: "Proyecto" }, { key: "sample", label: "Muestra" }, { key: "performed", label: "Fecha" },
                { key: "author", label: "Autor" }, { key: "version", label: "Versión" }, { key: "status", label: "Estado" },
              ]}
              rows={entryRows}
              onRowClick={(row) => setDetailId(String(row.id))}
              searchPlaceholder="Buscar experimento, cuaderno o muestra…"
              emptyTitle="Sin experimentos"
              emptyMessage={notebooks.items.length ? "Registra el primer experimento del cuaderno." : "Crea primero un cuaderno."}
            />
          ) : (
            <SimpleTable
              columns={[
                { key: "code", label: "Código" }, { key: "title", label: "Cuaderno" }, { key: "project", label: "Proyecto" },
                { key: "owner", label: "Responsable" }, { key: "entries", label: "Experimentos" }, { key: "last", label: "Último registro" },
                { key: "status", label: "Estado" },
              ]}
              rows={notebookRows}
              searchPlaceholder="Buscar cuaderno…"
              emptyTitle="Sin cuadernos"
              emptyMessage="Un proyecto puede tener uno o varios cuadernos; también existen cuadernos sin proyecto."
            />
          )}
        </div>
      </article>

      {notebookOpen ? (
        <NotebookFormModal onClose={() => setNotebookOpen(false)} onSaved={async (code) => { setNotebookOpen(false); showToast(`Cuaderno ${code} creado.`); await notebooks.reload(); }} onError={showError} />
      ) : null}
      {entryOpen ? (
        <EntryFormModal
          notebooks={notebooks.items}
          onClose={() => setEntryOpen(false)}
          onSaved={async (code) => { setEntryOpen(false); showToast(`Experimento ${code} registrado.`); await entries.reload(); await notebooks.reload(); }}
          onError={showError}
        />
      ) : null}
      {detailId ? (
        <EntryDetailModal
          entryId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={async () => { await entries.reload(); }}
          onToast={showToast}
          onError={showError}
        />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function NotebookFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [projects, setProjects] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/research/projects").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }))
      .then((payload: { data?: Array<{ id: string; code: string; title: string }> }) => { if (active) setProjects(payload.data ?? []); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? "").trim(),
          description: String(data.get("description") ?? "").trim() || undefined,
          projectId: String(data.get("projectId") ?? "") || null,
          ownerUserId: String(data.get("ownerUserId") ?? "") || null,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo crear el cuaderno.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open eyebrow="CUADERNO" title="Nuevo cuaderno" description="Agrupa los experimentos de un proyecto o de una línea de trabajo." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid">
          <label><span>Título *</span><input name="title" required minLength={3} /></label>
          <label><span>Descripción</span><textarea name="description" rows={2} /></label>
          <label><span>Proyecto</span>
            <select name="projectId" defaultValue="">
              <option value="">Sin proyecto</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
            </select>
          </label>
          <label><span>Responsable</span>
            <select name="ownerUserId" defaultValue="">
              <option value="">Yo mismo</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando…" : "Crear cuaderno"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function EntryFormModal({ notebooks, onClose, onSaved, onError }: Readonly<{
  notebooks: Notebook[]; onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [samples, setSamples] = useState<Array<{ id: string; code: string; alias: string | null }>>([]);
  const [protocols, setProtocols] = useState<Array<{ id: string; code: string; title: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/research/samples").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/research/protocols").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([samplePayload, protocolPayload]) => {
      if (!active) return;
      setSamples((samplePayload as { data?: Array<{ id: string; code: string; alias: string | null }> }).data ?? []);
      setProtocols((protocolPayload as { data?: Array<{ id: string; code: string; title: string }> }).data ?? []);
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/notebooks/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId: String(data.get("notebookId") ?? ""),
          title: String(data.get("title") ?? "").trim(),
          performedOn: String(data.get("performedOn") ?? "") || undefined,
          objective: String(data.get("objective") ?? "").trim() || undefined,
          procedureText: String(data.get("procedureText") ?? "").trim() || undefined,
          results: String(data.get("results") ?? "").trim() || undefined,
          conclusions: String(data.get("conclusions") ?? "").trim() || undefined,
          observations: String(data.get("observations") ?? "").trim() || undefined,
          sampleId: String(data.get("sampleId") ?? "") || null,
          protocolId: String(data.get("protocolId") ?? "") || null,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo registrar el experimento.")); return; }
      const payload = await response.json() as { data?: { entry_code?: string } };
      await onSaved(String(payload.data?.entry_code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="CUADERNO" title="Registrar experimento" description="Queda versionado desde el primer guardado: nada se pierde." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label><span>Cuaderno *</span>
            <select name="notebookId" required defaultValue={notebooks[0]?.id ?? ""}>
              {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.code} · {notebook.title}</option>)}
            </select>
          </label>
          <label><span>Fecha del experimento</span><input name="performedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label className="field-span-two"><span>Título *</span><input name="title" required minLength={3} /></label>
          <label><span>Muestra</span>
            <select name="sampleId" defaultValue="">
              <option value="">Sin muestra</option>
              {samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.code}{sample.alias ? ` · ${sample.alias}` : ""}</option>)}
            </select>
          </label>
          <label><span>Protocolo aplicado</span>
            <select name="protocolId" defaultValue="">
              <option value="">Sin protocolo</option>
              {protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.code} · {protocol.title}</option>)}
            </select>
          </label>
          <label className="field-span-two"><span>Objetivo</span><textarea name="objective" rows={2} /></label>
          <label className="field-span-two"><span>Procedimiento</span><textarea name="procedureText" rows={6} placeholder="Qué se hizo, con qué y en qué condiciones" /></label>
          <label className="field-span-two"><span>Resultados</span><textarea name="results" rows={5} /></label>
          <label className="field-span-two"><span>Conclusiones</span><textarea name="conclusions" rows={3} /></label>
          <label className="field-span-two"><span>Observaciones</span><textarea name="observations" rows={2} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Registrar experimento"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function EntryDetailModal({ entryId, onClose, onChanged, onToast, onError }: Readonly<{
  entryId: string; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<EntryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("content");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "sign">("view");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/notebooks/entries/${entryId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el experimento.")); return; }
      const payload = await response.json() as { data?: EntryDetail };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [entryId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/research/notebooks/entries/${entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo completar la acción.")); return; }
      onToast(successMessage);
      setMode("view");
      await load();
      await onChanged();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  const locked = detail ? requiresChangeReason(detail.status) : false;

  return (
    <ActionModal
      open wide eyebrow="EXPERIMENTO"
      title={detail ? `${detail.entry_code} · ${detail.title}` : "Experimento"}
      description="Contenido, historial de modificaciones y firmas."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando experimento…</p> : (
          <>
            <div className="details-grid">
              <div><small>Cuaderno</small><strong>{detail.notebook_code} · {detail.notebook_title}</strong></div>
              <div><small>Fecha</small><strong>{formatDay(detail.performed_on)}</strong></div>
              <div><small>Autor</small><strong>{detail.created_by_name ?? "—"}</strong></div>
              <div><small>Estado</small><strong>{NOTEBOOK_ENTRY_STATUS_LABEL[detail.status] ?? detail.status}</strong></div>
              <div><small>Versión</small><strong>v{detail.version_number}</strong></div>
              <div><small>Proyecto</small><strong>{detail.project_code ?? "—"}</strong></div>
              <div><small>Muestra</small><strong>{detail.sample_code ?? "—"}</strong></div>
              <div><small>Protocolo</small><strong>{detail.protocol_code ?? "—"}</strong></div>
            </div>

            <Tabs
              items={[{ key: "content", label: "Contenido" }, { key: "versions", label: "Historial" }, { key: "signatures", label: "Firmas" }]}
              active={tab}
              onChange={setTab}
            />

            {tab === "content" ? (
              mode === "edit" ? (
                <form
                  className="form-grid"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void act({
                      action: "UPDATE",
                      title: String(data.get("title") ?? "").trim(),
                      performedOn: String(data.get("performedOn") ?? "") || undefined,
                      objective: String(data.get("objective") ?? ""),
                      procedureText: String(data.get("procedureText") ?? ""),
                      results: String(data.get("results") ?? ""),
                      conclusions: String(data.get("conclusions") ?? ""),
                      observations: String(data.get("observations") ?? ""),
                      changeReason: String(data.get("changeReason") ?? "").trim() || undefined,
                    }, "Experimento actualizado; la versión anterior quedó en el historial.");
                  }}
                >
                  <label><span>Título</span><input name="title" defaultValue={detail.title} required /></label>
                  <label><span>Fecha</span><input name="performedOn" type="date" defaultValue={toDateInput(detail.performed_on)} /></label>
                  <label><span>Objetivo</span><textarea name="objective" rows={2} defaultValue={detail.objective ?? ""} /></label>
                  <label><span>Procedimiento</span><textarea name="procedureText" rows={6} defaultValue={detail.procedure_text ?? ""} /></label>
                  <label><span>Resultados</span><textarea name="results" rows={5} defaultValue={detail.results ?? ""} /></label>
                  <label><span>Conclusiones</span><textarea name="conclusions" rows={3} defaultValue={detail.conclusions ?? ""} /></label>
                  <label><span>Observaciones</span><textarea name="observations" rows={2} defaultValue={detail.observations ?? ""} /></label>
                  {locked ? (
                    <label>
                      <span>Motivo del cambio *</span>
                      <input name="changeReason" required minLength={3} placeholder="Este experimento ya está firmado: explica por qué se modifica" />
                    </label>
                  ) : (
                    <label><span>Motivo del cambio</span><input name="changeReason" placeholder="Opcional" /></label>
                  )}
                  <footer className="modal-actions">
                    <button type="button" className="secondary-button" onClick={() => setMode("view")}>Cancelar</button>
                    <button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Guardar cambios"}</button>
                  </footer>
                </form>
              ) : mode === "sign" ? (
                <form
                  className="form-grid signature-inline"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void act({
                      action: "SIGN",
                      signaturePassword: String(data.get("signaturePassword") ?? ""),
                      asWitness: data.get("asWitness") === "on",
                    }, "Experimento firmado.");
                  }}
                >
                  <p className="form-section-title">Firmar el experimento</p>
                  <p className="form-help">La firma queda ligada al contenido exacto de la versión v{detail.version_number}. Después podrás modificarlo, pero cada cambio exigirá un motivo y quedará en el historial.</p>
                  <label>
                    <span>Tu contraseña</span>
                    <div className="input-with-icon">
                      <LockKeyhole size={16} />
                      <input name="signaturePassword" type="password" minLength={8} required autoComplete="current-password" />
                    </div>
                  </label>
                  {detail.status === "SIGNED" ? (
                    <label className="check-line"><input name="asWitness" type="checkbox" /><span>Firmo como testigo del experimento</span></label>
                  ) : null}
                  <footer className="modal-actions">
                    <button type="button" className="secondary-button" onClick={() => setMode("view")}>Cancelar</button>
                    <button type="submit" className="primary-button" disabled={busy}><PenLine size={15} /> {busy ? "Firmando…" : "Firmar"}</button>
                  </footer>
                </form>
              ) : (
                <div className="research-panel">
                  <article className="research-document">
                    {detail.objective ? <><h4>Objetivo</h4><p className="research-preserve">{detail.objective}</p></> : null}
                    {detail.procedure_text ? <><h4>Procedimiento</h4><p className="research-preserve">{detail.procedure_text}</p></> : null}
                    {detail.results ? <><h4>Resultados</h4><p className="research-preserve">{detail.results}</p></> : null}
                    {detail.conclusions ? <><h4>Conclusiones</h4><p className="research-preserve">{detail.conclusions}</p></> : null}
                    {detail.observations ? <><h4>Observaciones</h4><p className="research-preserve">{detail.observations}</p></> : null}
                  </article>
                  <div className="modal-actions research-actions">
                    <button type="button" className="secondary-button" onClick={() => setMode("edit")}>Editar</button>
                    {detail.status === "DRAFT" ? (
                      <button type="button" className="secondary-button" disabled={busy} onClick={() => void act({ action: "COMPLETE" }, "Experimento marcado como completado.")}>
                        Marcar como completado
                      </button>
                    ) : null}
                    <button type="button" className="primary-button" onClick={() => setMode("sign")}><PenLine size={15} /> Firmar</button>
                  </div>
                </div>
              )
            ) : null}

            {tab === "versions" ? (
              <div className="research-panel">
                <p className="form-help"><History size={14} /> Cada modificación conserva el contenido anterior.</p>
                <div className="definition-list">
                  {detail.versions.map((version) => (
                    <article className="definition-row" key={version.id}>
                      <div>
                        <strong>v{version.version_number}</strong>
                        <p>{version.change_reason ?? "—"}</p>
                      </div>
                      <small>{version.changed_by_name ?? "—"}</small>
                      <em>{formatMoment(version.changed_at)}</em>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "signatures" ? (
              <div className="research-panel">
                {detail.signatures.length ? <SignatureList signatures={detail.signatures} /> : <p className="modal-note">Este experimento todavía no está firmado.</p>}
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
