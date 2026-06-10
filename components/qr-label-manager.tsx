"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Clipboard, ExternalLink, KeyRound, Printer, QrCode, RefreshCw, ScanLine, ShieldCheck, TriangleAlert } from "lucide-react";
import { ActionModal, Toast, copyText, useToast } from "@/components/action-kit";
import type { QrEntityType } from "@/lib/qr-security";

type LabelRow = {
  id: string;
  entityType: QrEntityType;
  entityId: string;
  opaqueToken: string;
  labelCode: string;
  status: string;
  displayName: string;
  location: string;
  createdAt: string;
  scanUrl: string;
};

type OneTimeCode = { code: string; expiresAt: string; ttlMinutes: number };

export function QrLabelManager({ entityType }: Readonly<{ entityType: QrEntityType }>) {
  const [labels, setLabels] = useState<LabelRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issuedCode, setIssuedCode] = useState<OneTimeCode | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { message, showToast, clearToast } = useToast();
  const selected = useMemo(() => labels.find((label) => label.id === selectedId) ?? labels[0], [labels, selectedId]);

  async function loadLabels() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/qr/labels?entityType=${entityType}`, { cache: "no-store" });
      const payload = await response.json() as { data?: LabelRow[]; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "No fue posible cargar las etiquetas.");
      setLabels(payload.data);
      setSelectedId((current) => current || payload.data?.[0]?.id || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible cargar las etiquetas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadLabels(); }, [entityType]);

  async function issueCode() {
    if (!selected) return;
    setError("");
    try {
      const response = await fetch(`/api/qr/labels/${encodeURIComponent(selected.id)}/access-code`, { method: "POST" });
      const payload = await response.json() as { data?: OneTimeCode; message?: string };
      if (!response.ok || !payload.data) throw new Error(payload.message || "No fue posible generar el código temporal.");
      setIssuedCode(payload.data);
      showToast("Código temporal generado correctamente.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible generar el código temporal.");
    }
  }

  async function copyScanUrl() {
    if (!selected) return;
    await copyText(selected.scanUrl);
    showToast("Enlace de escaneo copiado.");
  }

  function printSelected() {
    if (!selected) return;
    window.print();
  }

  return (
    <section>
      <div className="section-heading">
        <div><h2>Etiquetas QR seguras</h2><p>El QR contiene un identificador opaco. Para consultar la ficha desde un celular se necesita un código temporal de seis dígitos que vence y se consume después del primer uso.</p></div>
        <div className="qr-heading-actions"><button className="secondary-button" onClick={() => setScannerOpen(true)}><ScanLine size={15} /> Probar escaneo</button><button className="secondary-button" onClick={() => void loadLabels()}><RefreshCw size={15} /> Actualizar</button></div>
      </div>
      {error ? <p className="form-error qr-manager-error"><TriangleAlert size={14} /> {error}</p> : null}
      {loading ? <div className="qr-loading">Cargando etiquetas…</div> : labels.length === 0 ? <div className="qr-loading">Todavía no hay etiquetas. Al crear un recurso nuevo se generará una automáticamente.</div> : (
        <div className="qr-manager-grid">
          <aside className="qr-label-list">
            {labels.map((label) => <button key={label.id} className={selected?.id === label.id ? "qr-label-option qr-label-option-active" : "qr-label-option"} onClick={() => { setSelectedId(label.id); setIssuedCode(null); }}><QrCode size={17} /><span><strong>{label.labelCode}</strong><small>{label.displayName}</small><em>{label.location}</em></span></button>)}
          </aside>
          {selected ? (
            <div className="qr-label-workspace">
              <article className="qr-print-zone">
                <div className="qr-print-brand"><strong>NexaLab</strong><small>Etiqueta segura</small></div>
                <img src={`/api/qr/image/${encodeURIComponent(selected.opaqueToken)}`} alt={`Código QR de ${selected.labelCode}`} />
                <div className="qr-print-copy"><small>{selected.entityType === "EQUIPMENT" ? "EQUIPO" : "REACTIVO / MATERIAL"}</small><h3>{selected.labelCode}</h3><p>{selected.displayName}</p><span>{selected.location}</span></div>
                <p className="qr-print-note">Escanea e ingresa el código temporal generado por NexaLab.</p>
              </article>
              <div className="qr-label-actions">
                <button className="primary-button" onClick={() => void issueCode()}><KeyRound size={15} /> Generar código temporal</button>
                <button className="secondary-button" onClick={printSelected}><Printer size={15} /> Imprimir etiqueta</button>
                <button className="secondary-button" onClick={() => void copyScanUrl()}><Clipboard size={15} /> Copiar enlace</button>
                <a className="secondary-button" href={selected.scanUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Abrir consulta</a>
              </div>
              <div className="qr-security-card"><ShieldCheck size={17} /><p><strong>No imprime datos sensibles</strong><span>La etiqueta física no revela el lote, el stock, la ubicación completa ni el historial. Esa información se entrega después de validar el código temporal.</span></p></div>
              {issuedCode ? <div className="qr-code-result"><small>CÓDIGO TEMPORAL DE UN SOLO USO</small><strong>{issuedCode.code}</strong><p>Vence en {issuedCode.ttlMinutes} minutos. Compártelo únicamente con la persona que acaba de escanear la etiqueta.</p></div> : null}
            </div>
          ) : null}
        </div>
      )}
      <QrScanTester open={scannerOpen} onClose={() => setScannerOpen(false)} />
      <Toast message={message} onClose={clearToast} />
    </section>
  );
}

export function QrScanTester({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = value.trim();
    const match = trimmed.match(/\/qr\/([^/?#]+)/);
    const token = match?.[1] || (/^[a-zA-Z0-9_-]{12,}$/.test(trimmed) ? trimmed : "");
    if (!token) {
      setError("Pega el enlace completo de la etiqueta o el token opaco leído por el escáner.");
      return;
    }
    window.open(`/qr/${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
    setValue("");
    setError("");
    onClose();
  }

  return (
    <ActionModal open={open} title="Probar escaneo QR" description="En un celular, la cámara abre la URL automáticamente. En escritorio puedes pegar el enlace para probar el mismo flujo protegido." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label><span>Enlace o token leído</span><textarea required rows={4} value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://tu-dominio.example/qr/token-opaco" /></label>
        {error ? <p className="form-error"><TriangleAlert size={14} /> {error}</p> : null}
        <footer className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-button"><ScanLine size={15} /> Abrir consulta</button></footer>
      </form>
    </ActionModal>
  );
}
