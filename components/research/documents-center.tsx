"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, FolderOpen, Library, Plus, Upload } from "lucide-react";
import { ActionModal, FileDropZone, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, type TableRow } from "@/components/lims-ui";
import { DOCUMENT_CATEGORIES, DOCUMENT_CATEGORY_LABEL, type DocumentCategory } from "@/lib/research";
import { apiMessage, formatDay, formatMoment, useResearchList } from "@/components/research/research-kit";

// Gestión documental: el centro de todos los documentos del laboratorio, con
// versionado y descarga. Complementa a los archivos que ya viven en cada módulo.

type DocumentRow = {
  id: string; code: string; title: string; category: string; description: string | null;
  status: string; current_version: number; expires_on: string | null; tags: string[] | null;
  updated_at: string; project_code: string | null; project_title: string | null;
  created_by_name: string | null; original_filename: string | null; external_url: string | null;
};

type DocumentVersion = {
  id: string; version_number: number; change_summary: string | null; original_filename: string | null;
  mime_type: string | null; size_bytes: number | null; external_url: string | null;
  uploaded_at: string; uploaded_by_name: string | null;
};

type DocumentDetail = DocumentRow & { versions: DocumentVersion[] };

export function DocumentsCenter() {
  const [category, setCategory] = useState<"ALL" | DocumentCategory>("ALL");
  const { items, loading, error, reload } = useResearchList<DocumentRow>(
    category === "ALL" ? "/api/research/documents" : `/api/research/documents?category=${category}`,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const expiring = items.filter((document) => {
    if (!document.expires_on) return false;
    const days = (new Date(document.expires_on).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return days <= 60;
  });

  const rows: TableRow[] = items.map((document) => ({
    id: document.id,
    code: document.code,
    title: document.title,
    category: DOCUMENT_CATEGORY_LABEL[document.category as DocumentCategory] ?? document.category,
    project: document.project_code ?? "—",
    version: document.current_version ? `v${document.current_version}` : "Sin archivo",
    file: document.original_filename ?? (document.external_url ? "Enlace externo" : "—"),
    expires: formatDay(document.expires_on),
    updated: formatDay(document.updated_at),
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Gestión documental" description="Artículos, protocolos, consentimientos, permisos, certificados y licencias, con versiones." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={7} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Gestión documental" description="Artículos, protocolos, consentimientos, permisos, certificados y licencias, con versiones." />
        <ErrorState description={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Gestión documental" description="Artículos, protocolos, consentimientos, permisos, certificados y licencias, con versiones.">
        <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Nuevo documento</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Documentos", value: String(items.length), hint: "En el repositorio", icon: Library },
        { label: "Con archivo", value: String(items.filter((document) => document.current_version > 0).length), hint: "Versionados", icon: FileText },
        { label: "Por vencer", value: String(expiring.length), hint: "En los próximos 60 días", icon: FolderOpen },
      ]} />

      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <div className="filter-chip-row" role="group" aria-label="Filtrar por categoría">
            <button type="button" className={`filter-chip${category === "ALL" ? " filter-chip-active" : ""}`} onClick={() => setCategory("ALL")}>Todos</button>
            {DOCUMENT_CATEGORIES.map((option) => (
              <button key={option} type="button" className={`filter-chip${category === option ? " filter-chip-active" : ""}`} onClick={() => setCategory(option)}>
                {DOCUMENT_CATEGORY_LABEL[option]}
              </button>
            ))}
          </div>
          <SimpleTable
            columns={[
              { key: "code", label: "Código" }, { key: "title", label: "Documento" }, { key: "category", label: "Categoría" },
              { key: "project", label: "Proyecto" }, { key: "version", label: "Versión" }, { key: "file", label: "Archivo" },
              { key: "expires", label: "Vence" }, { key: "updated", label: "Actualizado" },
            ]}
            rows={rows}
            onRowClick={(row) => setDetailId(String(row.id))}
            searchPlaceholder="Buscar documento, categoría o proyecto…"
            emptyTitle="Repositorio vacío"
            emptyMessage="Carga el primer documento: un artículo, un consentimiento o un permiso."
          />
        </div>
      </article>

      {createOpen ? (
        <DocumentFormModal onClose={() => setCreateOpen(false)} onSaved={async (id, code) => { setCreateOpen(false); showToast(`Documento ${code} creado. Sube su archivo para versionarlo.`); await reload(); setDetailId(id); }} onError={showError} />
      ) : null}
      {detailId ? (
        <DocumentDetailModal documentId={detailId} onClose={() => setDetailId(null)} onChanged={reload} onToast={showToast} onError={showError} />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function DocumentFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (id: string, code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
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
      const externalUrl = String(data.get("externalUrl") ?? "").trim();
      const response = await fetch("/api/research/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title") ?? "").trim(),
          category: String(data.get("category") ?? "OTHER"),
          description: String(data.get("description") ?? "").trim() || undefined,
          projectId: String(data.get("projectId") ?? "") || null,
          expiresOn: String(data.get("expiresOn") ?? "") || null,
          tags: String(data.get("tags") ?? "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 20),
          externalUrl: externalUrl || undefined,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo crear el documento.")); return; }
      const payload = await response.json() as { data?: { id?: string; code?: string } };
      await onSaved(String(payload.data?.id ?? ""), String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="DOCUMENTOS" title="Nuevo documento" description="Crea la ficha y después sube el archivo. Cada archivo nuevo genera una versión." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Título *</span><input name="title" required minLength={3} /></label>
          <label><span>Categoría</span>
            <select name="category" defaultValue="ARTICLE">
              {DOCUMENT_CATEGORIES.map((option) => <option key={option} value={option}>{DOCUMENT_CATEGORY_LABEL[option]}</option>)}
            </select>
          </label>
          <label><span>Proyecto</span>
            <select name="projectId" defaultValue="">
              <option value="">Sin proyecto</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.title}</option>)}
            </select>
          </label>
          <label><span>Vence el</span><input name="expiresOn" type="date" /><small className="field-hint">Para permisos, licencias y certificados.</small></label>
          <label><span>Etiquetas</span><input name="tags" placeholder="microbiología, 2026, CONCYT" /></label>
          <label className="field-span-two"><span>Descripción</span><textarea name="description" rows={2} /></label>
          <label className="field-span-two"><span>Enlace externo</span><input name="externalUrl" type="url" placeholder="https://doi.org/… (si el documento vive fuera)" /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Creando…" : "Crear documento"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function DocumentDetailModal({ documentId, onClose, onChanged, onToast, onError }: Readonly<{
  documentId: string; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/documents/${documentId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el documento.")); return; }
      const payload = await response.json() as { data?: DocumentDetail };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [documentId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) { onError("Selecciona el archivo que quieres subir."); return; }
    setUploading(true);
    try {
      const response = await fetch(`/api/research/documents/${documentId}`, { method: "PUT", body: form });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo subir el archivo.")); return; }
      const payload = await response.json() as { data?: { version?: number } };
      onToast(`Versión ${payload.data?.version ?? ""} cargada.`);
      await load();
      await onChanged();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <ActionModal
      open wide eyebrow="DOCUMENTO"
      title={detail ? `${detail.code} · ${detail.title}` : "Documento"}
      description="Ficha, versiones y descarga."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando documento…</p> : (
          <>
            <div className="details-grid">
              <div><small>Categoría</small><strong>{DOCUMENT_CATEGORY_LABEL[detail.category as DocumentCategory] ?? detail.category}</strong></div>
              <div><small>Proyecto</small><strong>{detail.project_code ? `${detail.project_code} · ${detail.project_title}` : "Sin proyecto"}</strong></div>
              <div><small>Versión vigente</small><strong>{detail.current_version ? `v${detail.current_version}` : "Sin archivo"}</strong></div>
              <div><small>Vence</small><strong>{formatDay(detail.expires_on)}</strong></div>
              <div><small>Creado por</small><strong>{detail.created_by_name ?? "—"}</strong></div>
              <div><small>Actualizado</small><strong>{formatMoment(detail.updated_at)}</strong></div>
            </div>
            {detail.description ? <p className="research-preserve">{detail.description}</p> : null}

            {detail.current_version > 0 ? (
              <div className="modal-actions research-actions">
                <a className="secondary-button" href={`/api/research/documents/${documentId}?download=1`} target="_blank" rel="noreferrer">
                  <FileText size={15} /> Abrir versión vigente
                </a>
              </div>
            ) : null}

            <form className="form-grid" onSubmit={upload}>
              <span className="form-section-title">Subir una versión nueva</span>
              <FileDropZone name="file" hint="Arrastra el PDF, imagen o documento de Office (hasta 25 MB)" />
              <label><span>Resumen del cambio</span><input name="changeSummary" placeholder="Qué cambia respecto a la versión anterior" /></label>
              <div className="modal-actions">
                <button type="submit" className="primary-button" disabled={uploading}><Upload size={15} /> {uploading ? "Subiendo…" : "Subir versión"}</button>
              </div>
            </form>

            <span className="form-section-title">Versiones</span>
            {detail.versions.length ? (
              <div className="definition-list">
                {detail.versions.map((version) => (
                  <article className="definition-row" key={version.id}>
                    <div>
                      <strong>v{version.version_number}</strong>
                      <p>{version.change_summary ?? "—"}{version.original_filename ? ` · ${version.original_filename}` : ""}</p>
                    </div>
                    <small>{version.uploaded_by_name ?? "—"}</small>
                    <em>{formatMoment(version.uploaded_at)}</em>
                    <a className="text-button" href={`/api/research/documents/${documentId}?download=1&version=${version.version_number}`} target="_blank" rel="noreferrer">Abrir</a>
                  </article>
                ))}
              </div>
            ) : <p className="modal-note">Este documento todavía no tiene archivo cargado.</p>}
          </>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </ActionModal>
  );
}
