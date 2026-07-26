"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FileText, Upload } from "lucide-react";
import { FileDropZone } from "@/components/action-kit";
import { formatDateTime } from "@/lib/dates";

// Documentos de un registro de cumplimiento: licencias, facturas, actas, SDS.
// Se suben al mismo sitio (/api/attachments) y nunca se reemplazan: cada
// archivo nuevo es una versión más, porque el anterior es la evidencia de lo
// que se hizo entonces.

type Attachment = {
  id: string;
  original_filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  version_number: number;
  uploaded_at: string;
  uploaded_by_name: string | null;
};

export function DocumentUploader({
  entityType,
  entityId,
  label = "Documentos",
  hint = "Arrastra el PDF o la imagen del documento",
  canUpload = true,
}: Readonly<{
  entityType: string;
  entityId: string;
  label?: string;
  hint?: string;
  canUpload?: boolean;
}>) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`);
      if (!response.ok) return;
      const payload = await response.json() as { data?: Attachment[] };
      setItems(payload.data ?? []);
    } catch {
      // La lista de documentos no es crítica para operar: si falla, se reintenta al subir.
    }
  }, [entityType, entityId]);

  useEffect(() => { void load(); }, [load]);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) { setError("Selecciona el archivo que quieres adjuntar."); return; }
    form.set("entityType", entityType);
    form.set("entityId", entityId);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/attachments", { method: "POST", body: form });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: undefined })) as { message?: string };
        setError(payload.message || "No se pudo adjuntar el documento.");
        return;
      }
      event.currentTarget.reset();
      await load();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compliance-documents">
      <span className="form-section-title">{label}</span>
      {items.length ? (
        <ul className="research-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>v{item.version_number}</strong>
              <span>{item.original_filename}</span>
              <em>{formatDateTime(item.uploaded_at)}{item.uploaded_by_name ? ` · ${item.uploaded_by_name}` : ""}</em>
              <a className="text-button" href={`/api/attachments/${item.id}`} target="_blank" rel="noreferrer">
                <FileText size={14} /> Abrir
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="modal-note">Todavía no hay documentos adjuntos.</p>
      )}

      {canUpload ? (
        <form className="form-grid" onSubmit={upload}>
          <FileDropZone name="file" hint={hint} />
          <label><span>Nombre del documento <small>(opcional)</small></span><input name="label" placeholder="Licencia MINGOB 2026" /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="submit" className="secondary-button" disabled={busy}>
              <Upload size={15} /> {busy ? "Subiendo…" : "Adjuntar documento"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
