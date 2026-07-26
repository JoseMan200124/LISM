"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileCheck2, GitBranch, History, LockKeyhole, PenLine, Plus, Send } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import {
  PROTOCOL_KINDS,
  PROTOCOL_KIND_LABEL,
  PROTOCOL_STATUS_LABEL,
  VERSION_STATUS_LABEL,
  type ProtocolKind,
  type ProtocolStatus,
} from "@/lib/research";
import { apiMessage, formatDay, formatMoment, useDirectory, useQueryParam, useResearchList } from "@/components/research/research-kit";

// Protocolos y SOP: versiones, historial de cambios y aprobaciones firmadas.
// Una versión aprobada nunca se edita; cualquier cambio nace como versión nueva.

type ProtocolRow = {
  id: string; code: string; title: string; kind: string; area: string | null; summary: string | null;
  status: string; next_review_on: string | null; owner_name: string | null;
  current_version: number | null; current_version_status: string | null; version_count: number;
};

type Version = {
  id: string; version_number: number; status: string; content: string; change_summary: string | null;
  effective_from: string | null; created_at: string; created_by_name: string | null;
};

type Approval = { id: string; version_number: number; decision: string; note: string | null; decided_at: string; approved_by_name: string | null };

type ProtocolDetail = ProtocolRow & {
  objectives?: string | null;
  review_interval_months: number | null;
  versions: Version[];
  approvals: Approval[];
  projects: Array<{ id: string; code: string; title: string }>;
  canApprove: boolean;
};

export function ProtocolsCenter() {
  const { items, loading, error, reload } = useResearchList<ProtocolRow>("/api/research/protocols");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const initialId = useQueryParam("protocolId");
  const { message, toastType, showToast, showError, clearToast } = useToast();

  useEffect(() => { if (initialId) setDetailId(initialId); }, [initialId]);

  const approved = items.filter((protocol) => protocol.status === "APPROVED");
  const inReview = items.filter((protocol) => protocol.status === "IN_REVIEW");
  const rows: TableRow[] = items.map((protocol) => ({
    id: protocol.id,
    code: protocol.code,
    title: protocol.title,
    kind: PROTOCOL_KIND_LABEL[protocol.kind as ProtocolKind] ?? protocol.kind,
    area: protocol.area ?? "—",
    version: protocol.current_version ? `v${protocol.current_version} · ${VERSION_STATUS_LABEL[protocol.current_version_status ?? ""] ?? ""}` : "—",
    versions: String(protocol.version_count ?? 0),
    review: formatDay(protocol.next_review_on),
    owner: protocol.owner_name ?? "—",
    status: PROTOCOL_STATUS_LABEL[protocol.status as ProtocolStatus] ?? protocol.status,
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Protocolos y SOP" description="Procedimientos normalizados y protocolos de investigación con versiones, historial y aprobaciones." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={8} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Protocolos y SOP" description="Procedimientos normalizados y protocolos de investigación con versiones, historial y aprobaciones." />
        <ErrorState description={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Protocolos y SOP" description="Procedimientos normalizados y protocolos de investigación con versiones, historial y aprobaciones.">
        <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nuevo protocolo</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Vigentes", value: String(approved.length), hint: "Aprobados y en uso", icon: FileCheck2 },
        { label: "En revisión", value: String(inReview.length), hint: inReview.length ? "Esperan aprobación" : "Sin pendientes", icon: Send },
        { label: "Versiones registradas", value: String(items.reduce((sum, protocol) => sum + Number(protocol.version_count ?? 0), 0)), hint: "Historial completo", icon: GitBranch },
      ]} />

      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <SimpleTable
            columns={[
              { key: "code", label: "Código" }, { key: "title", label: "Protocolo" }, { key: "kind", label: "Tipo" },
              { key: "area", label: "Área" }, { key: "version", label: "Versión vigente" }, { key: "versions", label: "Versiones" },
              { key: "review", label: "Próxima revisión" }, { key: "owner", label: "Responsable" }, { key: "status", label: "Estado" },
            ]}
            rows={rows}
            onRowClick={(row) => setDetailId(String(row.id))}
            searchPlaceholder="Buscar protocolo, área o responsable…"
            emptyTitle="Sin protocolos"
            emptyMessage="Registra el primer SOP o protocolo de investigación."
          />
        </div>
      </article>

      {createOpen ? (
        <ProtocolFormModal onClose={() => setCreateOpen(false)} onSaved={async (code) => { setCreateOpen(false); showToast(`Protocolo ${code} creado en borrador.`); await reload(); }} onError={showError} />
      ) : null}
      {detailId ? (
        <ProtocolDetailModal protocolId={detailId} onClose={() => setDetailId(null)} onChanged={reload} onToast={showToast} onError={showError} />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ProtocolFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/protocols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? "").trim(),
          kind: String(data.get("kind") ?? "SOP"),
          area: String(data.get("area") ?? "").trim() || undefined,
          summary: String(data.get("summary") ?? "").trim() || undefined,
          content: String(data.get("content") ?? ""),
          ownerUserId: String(data.get("ownerUserId") ?? "") || null,
          reviewIntervalMonths: String(data.get("reviewIntervalMonths") ?? "") ? Number(data.get("reviewIntervalMonths")) : null,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo crear el protocolo.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="INVESTIGACIÓN" title="Nuevo protocolo" description="Nace como versión 1 en borrador. Al enviarlo a revisión y aprobarlo pasa a ser la versión vigente." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título *</span><input name="title" required minLength={3} maxLength={240} /></label>
          <label><span>Tipo</span>
            <select name="kind" defaultValue="SOP">
              {PROTOCOL_KINDS.map((kind) => <option key={kind} value={kind}>{PROTOCOL_KIND_LABEL[kind]}</option>)}
            </select>
          </label>
          <label><span>Área</span><input name="area" placeholder="Biología molecular, microbiología…" /></label>
          <label><span>Responsable</span>
            <select name="ownerUserId" defaultValue="">
              <option value="">Yo mismo</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>
          <label><span>Revisar cada (meses)</span><input name="reviewIntervalMonths" type="number" min={1} max={120} placeholder="24" /></label>
          <label className="field-span-two"><span>Resumen</span><textarea name="summary" rows={2} placeholder="Alcance y aplicación del procedimiento" /></label>
          <label className="field-span-two"><span>Contenido del protocolo</span><textarea name="content" rows={10} placeholder="Objetivo, alcance, materiales, procedimiento paso a paso, criterios de aceptación, referencias…" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando…" : "Crear protocolo"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function ProtocolDetailModal({ protocolId, onClose, onChanged, onToast, onError }: Readonly<{
  protocolId: string; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<ProtocolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("content");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"view" | "edit" | "new-version" | "approve" | "reject">("view");
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/protocols/${protocolId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el protocolo.")); return; }
      const payload = await response.json() as { data?: ProtocolDetail };
      setDetail(payload.data ?? null);
      setSelectedVersion(payload.data?.versions?.[0]?.version_number ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [protocolId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/research/protocols/${protocolId}`, {
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

  const current = detail?.versions.find((version) => version.version_number === selectedVersion) ?? detail?.versions[0] ?? null;
  const isCurrentDraft = current?.status === "DRAFT" && current.version_number === detail?.current_version;

  return (
    <ActionModal
      open wide eyebrow="PROTOCOLO"
      title={detail ? `${detail.code} · ${detail.title}` : "Protocolo"}
      description="Contenido, versiones, historial de cambios y aprobaciones."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando protocolo…</p> : (
          <>
            <div className="details-grid">
              <div><small>Tipo</small><strong>{PROTOCOL_KIND_LABEL[detail.kind as ProtocolKind] ?? detail.kind}</strong></div>
              <div><small>Estado</small><strong>{PROTOCOL_STATUS_LABEL[detail.status as ProtocolStatus] ?? detail.status}</strong></div>
              <div><small>Versión vigente</small><strong>{detail.current_version ? `v${detail.current_version}` : "—"}</strong></div>
              <div><small>Responsable</small><strong>{detail.owner_name ?? "—"}</strong></div>
              <div><small>Próxima revisión</small><strong>{formatDay(detail.next_review_on)}</strong></div>
              <div><small>Proyectos</small><strong>{detail.projects.length}</strong></div>
            </div>

            <Tabs
              items={[{ key: "content", label: "Contenido" }, { key: "versions", label: "Versiones" }, { key: "approvals", label: "Aprobaciones" }]}
              active={tab}
              onChange={setTab}
            />

            {tab === "content" ? (
              <div className="research-panel">
                {detail.versions.length > 1 ? (
                  <label className="research-version-picker">
                    <span>Ver versión</span>
                    <select value={selectedVersion ?? ""} onChange={(event) => setSelectedVersion(Number(event.target.value))}>
                      {detail.versions.map((version) => (
                        <option key={version.id} value={version.version_number}>
                          v{version.version_number} · {VERSION_STATUS_LABEL[version.status] ?? version.status}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {mode === "edit" || mode === "new-version" ? (
                  <form
                    className="form-grid"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const content = String(data.get("content") ?? "");
                      if (mode === "edit") void act({ action: "EDIT_DRAFT", content, changeSummary: String(data.get("changeSummary") ?? "").trim() || undefined }, "Borrador actualizado.");
                      else void act({ action: "NEW_VERSION", content, changeSummary: String(data.get("changeSummary") ?? "").trim() }, "Nueva versión creada en borrador.");
                    }}
                  >
                    <label><span>Contenido</span><textarea name="content" rows={14} defaultValue={current?.content ?? ""} /></label>
                    <label>
                      <span>{mode === "new-version" ? "Resumen del cambio *" : "Resumen del cambio"}</span>
                      <input name="changeSummary" required={mode === "new-version"} minLength={mode === "new-version" ? 3 : 0} placeholder="Qué cambia respecto a la versión anterior" />
                    </label>
                    <footer className="modal-actions">
                      <button type="button" className="secondary-button" onClick={() => setMode("view")}>Cancelar</button>
                      <button type="submit" className="primary-button" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
                    </footer>
                  </form>
                ) : (
                  <>
                    <article className="research-document">
                      <header>
                        <strong>v{current?.version_number ?? 1}</strong>
                        <span className="status-pill">{VERSION_STATUS_LABEL[current?.status ?? ""] ?? current?.status}</span>
                        {current?.effective_from ? <em>Vigente desde {formatDay(current.effective_from)}</em> : null}
                      </header>
                      <p className="research-preserve">{current?.content?.trim() || "Esta versión todavía no tiene contenido."}</p>
                      {current?.change_summary ? <footer>Cambio: {current.change_summary}</footer> : null}
                    </article>

                    {mode === "approve" ? (
                      <form
                        className="form-grid form-grid-two signature-inline"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void act({
                            action: "APPROVE",
                            note: String(data.get("note") ?? "").trim() || undefined,
                            effectiveFrom: String(data.get("effectiveFrom") ?? "") || null,
                            signaturePassword: String(data.get("signaturePassword") ?? ""),
                          }, "Versión aprobada y publicada como vigente.");
                        }}
                      >
                        <p className="form-section-title field-span-two">Aprobar con tu firma</p>
                        <label><span>Vigente desde</span><input name="effectiveFrom" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                        <label><span>Nota</span><input name="note" placeholder="Opcional" /></label>
                        <label className="field-span-two">
                          <span>Tu contraseña</span>
                          <div className="input-with-icon">
                            <LockKeyhole size={16} />
                            <input name="signaturePassword" type="password" minLength={8} required autoComplete="current-password" />
                          </div>
                        </label>
                        <p className="modal-note field-span-two">Al aprobar, la versión anterior queda como reemplazada y se avisa a los investigadores de los proyectos que usan este protocolo.</p>
                        <footer className="modal-actions field-span-two">
                          <button type="button" className="secondary-button" onClick={() => setMode("view")}>Cancelar</button>
                          <button type="submit" className="primary-button" disabled={busy}><PenLine size={15} /> {busy ? "Firmando…" : "Firmar y aprobar"}</button>
                        </footer>
                      </form>
                    ) : null}

                    {mode === "reject" ? (
                      <form
                        className="form-grid"
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void act({ action: "REJECT", note: String(data.get("note") ?? "").trim() }, "Versión devuelta a borrador.");
                        }}
                      >
                        <label><span>Motivo de la devolución *</span><textarea name="note" rows={2} required minLength={3} /></label>
                        <footer className="modal-actions">
                          <button type="button" className="secondary-button" onClick={() => setMode("view")}>Cancelar</button>
                          <button type="submit" className="primary-button" disabled={busy}>Devolver a borrador</button>
                        </footer>
                      </form>
                    ) : null}

                    {mode === "view" ? (
                      <div className="modal-actions research-actions">
                        {isCurrentDraft ? <button type="button" className="secondary-button" onClick={() => setMode("edit")}>Editar borrador</button> : null}
                        <button type="button" className="secondary-button" onClick={() => setMode("new-version")}><GitBranch size={15} /> Nueva versión</button>
                        {isCurrentDraft ? (
                          <button type="button" className="secondary-button" disabled={busy} onClick={() => void act({ action: "SUBMIT_REVIEW" }, "Versión enviada a revisión.")}>
                            <Send size={15} /> Enviar a revisión
                          </button>
                        ) : null}
                        {detail.canApprove && current?.status === "IN_REVIEW" ? (
                          <>
                            <button type="button" className="secondary-button" onClick={() => setMode("reject")}>Devolver</button>
                            <button type="button" className="primary-button" onClick={() => setMode("approve")}><CheckCircle2 size={15} /> Aprobar</button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {tab === "versions" ? (
              <div className="research-panel">
                <p className="form-help"><History size={14} /> Historial de cambios: cada versión conserva su contenido tal como se aprobó.</p>
                <div className="definition-list">
                  {detail.versions.map((version) => (
                    <article className="definition-row" key={version.id}>
                      <div>
                        <strong>v{version.version_number} · {VERSION_STATUS_LABEL[version.status] ?? version.status}</strong>
                        <p>{version.change_summary ?? "Sin resumen de cambio"}</p>
                      </div>
                      <small>{version.created_by_name ?? "—"}</small>
                      <em>{formatMoment(version.created_at)}</em>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "approvals" ? (
              <div className="research-panel">
                {detail.approvals.length ? (
                  <div className="definition-list">
                    {detail.approvals.map((approval) => (
                      <article className="definition-row" key={approval.id}>
                        <div>
                          <strong>v{approval.version_number} · {approval.decision === "APPROVED" ? "Aprobada" : "Devuelta"}</strong>
                          <p>{approval.note ?? "—"}</p>
                        </div>
                        <small>{approval.approved_by_name ?? "—"}</small>
                        <em>{formatMoment(approval.decided_at)}</em>
                      </article>
                    ))}
                  </div>
                ) : <p className="modal-note">Todavía no hay decisiones de aprobación.</p>}
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
