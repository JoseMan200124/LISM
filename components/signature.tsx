"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Eraser, LockKeyhole, PenLine, ShieldCheck } from "lucide-react";
import { ActionModal } from "@/components/action-kit";
import { formatDateTime } from "@/lib/dates";
import { SIGNATURE_MEANING_LABEL, type SignatureMeaning } from "@/lib/signatures";

// Firma electrónica en la interfaz: captura de la rúbrica, confirmación de
// identidad al firmar y presentación de las firmas ya estampadas.

export type SignatureProfile = {
  display_name: string;
  credentials: string | null;
  signature_image: string | null;
};

// ─── Captura de la rúbrica ──────────────────────────────────────────────────

export function SignaturePad({
  value,
  onChange,
  height = 150,
}: Readonly<{ value: string | null; onChange: (dataUrl: string | null) => void; height?: number }>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(Boolean(value));

  // Se dibuja a resolución del dispositivo para que el trazo no salga borroso.
  const prepare = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#111827";
    return context;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 320;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    if (value) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, width, height);
      image.src = value;
    }
  }, [height, value]);

  function pointerPosition(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event: ReactPointerEvent<HTMLCanvasElement>) {
    const context = prepare();
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const { x, y } = pointerPosition(event);
    context.beginPath();
    context.moveTo(x, y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const { x, y } = pointerPosition(event);
    context.lineTo(x, y);
    context.stroke();
    setHasInk(true);
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="signature-pad">
      <canvas
        ref={canvasRef}
        style={{ height }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        aria-label="Área para dibujar tu firma"
      />
      <div className="signature-pad-actions">
        <span>{hasInk ? "Rúbrica capturada" : "Dibuja tu firma con el dedo o el ratón"}</span>
        <button type="button" className="text-button" onClick={clear}><Eraser size={14} /> Borrar</button>
      </div>
    </div>
  );
}

// ─── Firma registrada del usuario ───────────────────────────────────────────

export function SignatureSetup({ fallbackName }: Readonly<{ fallbackName: string }>) {
  const [displayName, setDisplayName] = useState(fallbackName);
  const [credentials, setCredentials] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/users/me/signature")
      .then((response) => (response.ok ? response.json() : { data: null }))
      .catch(() => ({ data: null }))
      .then((payload: { data?: SignatureProfile | null }) => {
        if (!active) return;
        if (payload.data) {
          setDisplayName(payload.data.display_name || fallbackName);
          setCredentials(payload.data.credentials ?? "");
          setImage(payload.data.signature_image ?? null);
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [fallbackName]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFeedback("");
    try {
      const response = await fetch("/api/users/me/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, credentials: credentials || null, signatureImage: image }),
      });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No se pudo guardar tu firma.");
      setFeedback("Firma electrónica guardada. Se estampará en los registros que autorices.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar tu firma.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="form-help">Cargando tu firma…</p>;

  return (
    <form className="signature-setup" onSubmit={save}>
      <p className="form-help">
        Tu firma electrónica identifica quién solicita y quién autoriza. Al firmar se te pedirá tu contraseña:
        eso es lo que da validez al acto y queda registrado con fecha, hora y huella del contenido firmado.
      </p>
      <label>
        <span>Nombre con el que firmas</span>
        <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={3} maxLength={200} />
      </label>
      <label>
        <span>Cargo o colegiado <small>(opcional)</small></span>
        <input value={credentials} onChange={(event) => setCredentials(event.target.value)} placeholder="Q.B. · Colegiado 4821 · Jefa de laboratorio" maxLength={200} />
      </label>
      <div className="signature-setup-pad">
        <span className="field-label">Rúbrica</span>
        <SignaturePad value={image} onChange={setImage} />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {feedback ? <p className="form-help">{feedback}</p> : null}
      <footer className="modal-actions">
        <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Guardar firma"}</button>
      </footer>
    </form>
  );
}

// ─── Confirmación al firmar ─────────────────────────────────────────────────

export function SignatureConfirmModal({
  open,
  title,
  meaning,
  summary,
  actionLabel,
  onClose,
  onConfirm,
  optional = false,
}: Readonly<{
  open: boolean;
  title: string;
  meaning: SignatureMeaning;
  summary: Array<{ label: string; value: string }>;
  actionLabel: string;
  onClose: () => void;
  onConfirm: (password: string) => Promise<boolean>;
  optional?: boolean;
}>) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  useEffect(() => { if (open) { setPassword(""); setError(""); } }, [open]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const ok = await onConfirm(password);
    setWorking(false);
    if (ok) setPassword("");
    else setError("No se pudo completar la firma. Revisa tu contraseña e inténtalo de nuevo.");
  }

  return (
    <ActionModal
      open={open}
      onClose={onClose}
      eyebrow="FIRMA ELECTRÓNICA"
      title={title}
      description={`Vas a firmar como ${SIGNATURE_MEANING_LABEL[meaning].toLowerCase()}. Confirma tu identidad para dejar constancia.`}
    >
      <form className="modal-form signature-confirm" onSubmit={submit}>
        <div className="details-grid">
          {summary.map((entry) => (
            <div key={entry.label}><small>{entry.label}</small><strong>{entry.value}</strong></div>
          ))}
        </div>
        <label>
          <span>Tu contraseña</span>
          <div className="input-with-icon">
            <LockKeyhole size={16} />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required={!optional}
              minLength={optional ? 0 : 8}
            />
          </div>
        </label>
        <p className="form-help">
          <ShieldCheck size={14} /> La firma queda ligada al contenido exacto que ves ahora. Si el registro cambia después, la firma deja de ampararlo.
        </p>
        {error ? <p className="form-error">{error}</p> : null}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={working}>
            <PenLine size={15} /> {working ? "Firmando…" : actionLabel}
          </button>
        </footer>
      </form>
    </ActionModal>
  );
}

// ─── Firmas estampadas ──────────────────────────────────────────────────────

export type StampedSignature = {
  id: string;
  meaning: string;
  signed_at: string;
  content_hash: string;
  signer_name: string | null;
  signer_display_name: string | null;
  signer_credentials: string | null;
  signature_image: string | null;
};

export function SignatureStamp({ signature }: Readonly<{ signature: StampedSignature }>) {
  const name = signature.signer_display_name || signature.signer_name || "Firmante";
  const meaning = SIGNATURE_MEANING_LABEL[signature.meaning as SignatureMeaning] ?? signature.meaning;
  return (
    <figure className="signature-stamp">
      {signature.signature_image ? (
        // eslint-disable-next-line @next/next/no-img-element -- rúbrica en data URL, sin optimización remota
        <img src={signature.signature_image} alt={`Firma de ${name}`} />
      ) : (
        <span className="signature-stamp-script">{name}</span>
      )}
      <figcaption>
        <strong>{name}</strong>
        {signature.signer_credentials ? <small>{signature.signer_credentials}</small> : null}
        <small>{meaning} · {formatDateTime(signature.signed_at)}</small>
        <code title="Huella del contenido firmado">{signature.content_hash.slice(0, 16)}…</code>
      </figcaption>
    </figure>
  );
}

export function SignatureList({ signatures }: Readonly<{ signatures: readonly StampedSignature[] }>) {
  if (!signatures.length) return null;
  return (
    <div className="signature-list">
      {signatures.map((signature) => <SignatureStamp key={signature.id} signature={signature} />)}
    </div>
  );
}
