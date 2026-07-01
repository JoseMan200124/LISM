"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Clipboard, FileDown, Info, TriangleAlert, X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label={title}>
      <button className="modal-backdrop" aria-label="Cerrar" onClick={onClose} />
      <section className={`modal-card ${wide ? "modal-card-wide" : ""}`}>
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

export function CopyButton({ text, onCopied }: Readonly<{ text: string; onCopied?: () => void }>) {
  return <button className="secondary-button" onClick={async () => { await copyText(text); onCopied?.(); }}><Clipboard size={15} /> Copiar</button>;
}
