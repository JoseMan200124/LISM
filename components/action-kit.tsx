"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, FileDown, Info, TriangleAlert, UploadCloud, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export function ActionModal({
  open,
  title,
  description,
  children,
  onClose,
  eyebrow = "NEXALAB",
  wide = false,
}: Readonly<{
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  eyebrow?: string;
  wide?: boolean;
}>) {
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
    }, 0);
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" aria-label="Cerrar" onClick={onClose} />
      <section ref={dialogRef} className={`modal-card ${wide ? "modal-card-wide" : ""}`}>
        <header className="modal-header">
          <div className="modal-icon"><Info size={18} /></div>
          <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{description ? <p className="modal-description">{description}</p> : null}</div>
          <button className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error:   AlertTriangle,
  warning: TriangleAlert,
  info:    Info,
};

const TOAST_DURATION: Record<ToastType, number> = {
  success: 3600,
  error:   6000,
  warning: 5000,
  info:    4000,
};

export function Toast({
  message,
  type = "success",
  onClose,
}: Readonly<{ message: string; type?: ToastType; onClose: () => void }>) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, TOAST_DURATION[type]);
    return () => window.clearTimeout(timer);
  }, [message, type, onClose]);

  if (!message) return null;

  const Icon = TOAST_ICONS[type];
  const variantClass = type !== "success" ? ` app-toast-${type}` : "";

  return (
    <div className={`app-toast${variantClass}`} role={type === "error" ? "alert" : "status"}>
      <Icon size={17} />
      <span>{message}</span>
      <button onClick={onClose} aria-label="Cerrar"><X size={15} /></button>
    </div>
  );
}

export function useToast() {
  const [state, setState] = useState<{ message: string; type: ToastType }>({ message: "", type: "success" });

  // Memoizadas con dependencias vacías (setState de React es siempre
  // estable): sin esto, cada consumidor de useToast() recibía funciones
  // nuevas en cada render, lo que rompía cualquier useEffect/useCallback
  // que las tomara como dependencia (ver components/education-center.tsx,
  // causaba un loop de refetch infinito en el módulo Programa).
  const clearToast = useCallback(() => setState({ message: "", type: "success" }), []);
  const showToast = useCallback((msg: string) => setState({ message: msg, type: "success" }), []);
  const showError = useCallback((msg: string) => setState({ message: msg, type: "error" }), []);
  const showWarning = useCallback((msg: string) => setState({ message: msg, type: "warning" }), []);
  const showInfo = useCallback((msg: string) => setState({ message: msg, type: "info" }), []);

  return {
    message:   state.message,
    toastType: state.type,
    showToast,
    showError,
    showWarning,
    showInfo,
    clearToast,
  };
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, columns?: Array<{ key: string; label: string }>) {
  const resolvedColumns = columns ?? Object.keys(rows[0] ?? {}).map((key) => ({ key, label: key }));
  const csv = [
    resolvedColumns.map((column) => escapeCsv(column.label)).join(","),
    ...rows.map((row) => resolvedColumns.map((column) => escapeCsv(row[column.key])).join(",")),
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function DetailsModal({ open, title, row, onClose }: Readonly<{ open: boolean; title: string; row: Record<string, unknown> | null; onClose: () => void }>) {
  return (
    <ActionModal open={open} title={title} description="Consulta rápida del registro seleccionado." onClose={onClose}>
      <div className="modal-form details-grid">
        {row ? Object.entries(row).map(([key, value]) => <div key={key}><small>{key.replaceAll("_", " ")}</small><strong>{String(value ?? "—")}</strong></div>) : null}
        <footer className="modal-actions field-span-two"><button className="secondary-button" onClick={onClose}>Cerrar</button></footer>
      </div>
    </ActionModal>
  );
}

export function QuickRecordModal({
  open,
  title,
  description,
  onClose,
  onSave,
}: Readonly<{
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  onSave: (record: { name: string; detail: string; status: string }) => void;
}>) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState("Activo");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ name: name.trim(), detail: detail.trim(), status });
    setName("");
    setDetail("");
    setStatus("Activo");
    onClose();
  }

  return (
    <ActionModal open={open} title={title} description={description} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid">
          <label><span>Nombre o referencia</span><input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ingresa un nombre identificable" /></label>
          <label><span>Detalle</span><textarea required rows={4} value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Describe la información necesaria" /></label>
          <label><span>Estado inicial</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Activo</option><option>Pendiente</option><option>En revisión</option><option>Programado</option></select></label>
        </div>
        <footer className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit">Guardar registro</button></footer>
      </form>
    </ActionModal>
  );
}

export function DownloadHint({ children }: Readonly<{ children: ReactNode }>) {
  return <span className="download-hint"><FileDown size={14} />{children}</span>;
}

/**
 * Confirmación con el estilo del sitio: reemplaza a window.confirm para que
 * todas las ventanas de confirmación se vean acordes a la plataforma.
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  busy = false,
  onConfirm,
  onClose,
}: Readonly<{
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}>) {
  return (
    <ActionModal open={open} title={title} description={description} onClose={onClose}>
      <div className="modal-form">
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{cancelLabel}</button>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void onConfirm()}>{busy ? "Aplicando…" : confirmLabel}</button>
        </footer>
      </div>
    </ActionModal>
  );
}

/**
 * Zona de carga con arrastrar y soltar. Mantiene un input file real con `name`
 * para que los formularios sigan leyendo el archivo desde FormData.
 */
export function FileDropZone({
  name,
  accept = "application/pdf,image/png,image/jpeg,image/webp",
  required = false,
  hint,
  onFileSelected,
}: Readonly<{
  name: string;
  accept?: string;
  required?: boolean;
  hint?: string;
  onFileSelected?: (file: File | null) => void;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  function assign(files: FileList | null) {
    const file = files?.[0];
    if (!file || !inputRef.current) return;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    inputRef.current.files = transfer.files;
    setFileName(file.name);
    onFileSelected?.(file);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    assign(event.dataTransfer.files);
  }

  return (
    <div
      className={`file-dropzone${dragOver ? " file-dropzone-active" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="Arrastra y suelta el archivo o haz clic para seleccionarlo"
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={(event) => { if (event.target !== inputRef.current) inputRef.current?.click(); }}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); inputRef.current?.click(); } }}
    >
      <UploadCloud size={19} />
      <p>
        <strong>{fileName || "Arrastra y suelta el archivo aquí"}</strong>
        <span>{fileName ? "Haz clic o suelta otro archivo para reemplazarlo" : hint ?? "o haz clic para seleccionarlo (PDF o imagen, máx. 15 MB)"}</span>
      </p>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        name={name}
        accept={accept}
        required={required}
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          setFileName(file?.name ?? "");
          onFileSelected?.(file);
        }}
      />
    </div>
  );
}

export function CopyButton({ text, onCopied }: Readonly<{ text: string; onCopied?: () => void }>) {
  return <button className="secondary-button" onClick={async () => { await copyText(text); onCopied?.(); }}><Clipboard size={15} /> Copiar</button>;
}
