"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, MessageCircle, Sparkles, X } from "lucide-react";
import type { UserSession } from "@/lib/session";

// Botón flotante "Habla con Dilo": vincula el WhatsApp del usuario con su
// cuenta NexaLab (código de un solo uso) y abre la conversación con Dilo con
// el mensaje ya escrito. Una vez vinculado, Dilo responde por WhatsApp con la
// información del laboratorio que ESTE usuario puede ver — misma autorización
// que la web (ver lib/dilo-bridge.ts).

const DILO_WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_DILO_WHATSAPP_NUMBER || "16362460983";

const SUGGESTED_QUESTIONS = [
  "¿Qué artículos de mi inventario están por vencer?",
  "¿Qué equipos del laboratorio necesitan mantenimiento?",
  "¿Tengo alertas abiertas en mi laboratorio?",
];

type LinkStatus = {
  configured: boolean;
  status: "NONE" | "PENDING" | "LINKED" | "REVOKED";
  phone: string | null;
  codePending: boolean;
};

function waLink(text: string): string {
  return `https://wa.me/${DILO_WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function DiloWidget({ session }: Readonly<{ session: UserSession }>) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<LinkStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    fetch("/api/integrations/dilo/link")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((payload: { data?: LinkStatus }) => {
        if (active && payload.data) setLink(payload.data);
      })
      .catch(() => {
        if (active) setLink({ configured: false, status: "NONE", phone: null, codePending: false });
      });
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    if (open) window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  async function generateCode() {
    setBusy(true);
    try {
      const response = await fetch("/api/integrations/dilo/link", { method: "POST" });
      if (!response.ok) throw new Error("link code failed");
      const payload = (await response.json()) as { data?: { code: string } };
      if (payload.data?.code) setCode(payload.data.code);
    } catch {
      setCode(null);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await fetch("/api/integrations/dilo/link", { method: "DELETE" });
      setCode(null);
      setLink((previous) => (previous ? { ...previous, status: "REVOKED", phone: null } : previous));
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(`vincular ${code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // El botón de WhatsApp lleva el código igual; copiar es solo comodidad.
    }
  }

  const linked = link?.status === "LINKED";

  return (
    <>
      <button
        type="button"
        className={`dilo-fab ${open ? "dilo-fab-open" : ""}`}
        aria-label={open ? "Cerrar el asistente Dilo" : "Habla con Dilo por WhatsApp"}
        aria-expanded={open}
        title="Habla con Dilo por WhatsApp"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>

      {open ? (
        <div className="dilo-popover" ref={panelRef} role="dialog" aria-label="Asistente Dilo">
          <header className="dilo-popover-header">
            <div className="dilo-popover-mark" aria-hidden="true">
              <Sparkles size={16} />
            </div>
            <div>
              <strong>Dilo · tu laboratorio por WhatsApp</strong>
              <small>Pregunta por tu inventario, equipos, muestras y alertas.</small>
            </div>
          </header>

          {!link ? (
            <p className="dilo-popover-note">Consultando el estado de tu vínculo…</p>
          ) : !link.configured ? (
            <div className="dilo-popover-body">
              <p>
                Dilo es el asistente de WhatsApp que potencia NexaLab: responde con la información de tu
                laboratorio, solo la que tu usuario puede ver. En este entorno de demostración el vínculo de
                cuentas está desactivado, pero puedes conocer a Dilo ahora mismo.
              </p>
              <a className="primary-button dilo-wide-button" href={waLink("Hola Dilo, vengo de NexaLab y quiero conocerte.")} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> Conocer a Dilo en WhatsApp
              </a>
            </div>
          ) : linked ? (
            <div className="dilo-popover-body">
              <p className="dilo-status-line">
                <CheckCircle2 size={15} /> WhatsApp vinculado {link.phone ? `(${link.phone})` : ""}
              </p>
              <p>Pregunta directo en WhatsApp, por ejemplo:</p>
              <div className="dilo-suggestions">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <a key={question} href={waLink(question)} target="_blank" rel="noopener noreferrer">
                    {question} <ExternalLink size={12} />
                  </a>
                ))}
              </div>
              <a className="primary-button dilo-wide-button" href={waLink("")} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> Abrir WhatsApp
              </a>
              <button type="button" className="text-button dilo-unlink" disabled={busy} onClick={() => void unlink()}>
                Desvincular este WhatsApp
              </button>
            </div>
          ) : code ? (
            <div className="dilo-popover-body">
              <p>
                Tu código de vinculación (válido 15 minutos). Envíaselo a Dilo tal cual; el botón lo lleva ya
                escrito:
              </p>
              <div className="dilo-code" aria-label="Código de vinculación">
                <span>vincular {code}</span>
                <button type="button" className="icon-button" aria-label="Copiar mensaje de vinculación" onClick={() => void copyCode()}>
                  {copied ? <CheckCircle2 size={15} /> : <Copy size={15} />}
                </button>
              </div>
              <a className="primary-button dilo-wide-button" href={waLink(`vincular ${code}`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle size={16} /> Abrir WhatsApp y vincular
              </a>
              <p className="dilo-popover-note">
                Cuando Dilo confirme, tu WhatsApp quedará conectado a tu cuenta de {session.laboratoryName}.
              </p>
            </div>
          ) : (
            <div className="dilo-popover-body">
              <p>
                Vincula tu WhatsApp una sola vez y podrás preguntarle a Dilo por tu laboratorio desde cualquier
                lugar. Dilo responde únicamente con la información que tu usuario puede ver en NexaLab.
              </p>
              <button type="button" className="primary-button dilo-wide-button" disabled={busy} onClick={() => void generateCode()}>
                <MessageCircle size={16} /> {busy ? "Generando código…" : "Vincular mi WhatsApp"}
              </button>
              <p className="dilo-popover-note">Sin vínculo, tu número no obtiene ningún dato del laboratorio.</p>
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}
