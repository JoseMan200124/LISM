"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessagesSquare, Plus, Send, Users } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro } from "@/components/lims-ui";
import { formatDateTime } from "@/lib/dates";
import type { UserSession } from "@/lib/session";

// Mensajería interna de la institución: el encargado de un laboratorio escribe
// al de otro sin salir de NexaLab. El alcance es la organización, así que el
// directorio incluye a todas las personas de la institución con el laboratorio
// al que pertenecen.

type Thread = {
  id: string;
  kind: string;
  subject: string | null;
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  participants: string | null;
};

type Message = {
  id: string;
  body: string;
  created_at: string;
  sender_user_id: string | null;
  sender_name: string | null;
  laboratory_name: string | null;
};

type DirectoryEntry = { id: string; full_name: string; email: string; laboratories: string; role_label: string };

async function apiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

export function MessagesCenter({ session }: Readonly<{ session?: UserSession }>) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<string>("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const { message: toastMessage, toastType, showToast, showError, clearToast } = useToast();
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/messages");
      if (!response.ok) { setError(await apiMessage(response, "No se pudieron cargar las conversaciones.")); return; }
      const payload = await response.json() as { data?: Thread[] };
      setThreads(payload.data ?? []);
      setError(null);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  const openThread = useCallback(async (threadId: string) => {
    setActiveId(threadId);
    try {
      const response = await fetch(`/api/messages/${threadId}`);
      if (!response.ok) { showError(await apiMessage(response, "No se pudo abrir la conversación.")); return; }
      const payload = await response.json() as { data?: { messages: Message[]; participants: Array<{ full_name: string }> } };
      setMessages(payload.data?.messages ?? []);
      setParticipants((payload.data?.participants ?? []).map((person) => person.full_name).join(", "));
      // Al abrirla queda leída: se refresca la bandeja para bajar el contador.
      await loadThreads();
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    } catch {
      showError("No se pudo conectar con el servidor.");
    }
  }, [loadThreads, showError]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  // Enlace desde la campanita: ?threadId=…
  useEffect(() => {
    const threadId = new URLSearchParams(window.location.search).get("threadId");
    if (threadId) void openThread(threadId);
  }, [openThread]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeId || draft.trim().length === 0) return;
    setSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: activeId, body: draft.trim() }),
      });
      if (!response.ok) { showError(await apiMessage(response, "No se pudo enviar el mensaje.")); return; }
      setDraft("");
      await openThread(activeId);
    } catch {
      showError("No se pudo conectar con el servidor.");
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INSTITUCIÓN" title="Mensajes" description="Conversaciones internas entre las personas de tu institución." />
        <ErrorState description={error} onRetry={() => void loadThreads()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INSTITUCIÓN" title="Mensajes" description="Escribe a cualquier persona de tu institución, aunque trabaje en otro laboratorio.">
        <button className="primary-button" onClick={() => setComposeOpen(true)}><Plus size={15} /> Nueva conversación</button>
      </PageIntro>

      <article className="panel messages-panel">
        <aside className="messages-list">
          {loading ? <p className="modal-note">Cargando conversaciones…</p> : null}
          {!loading && threads.length === 0 ? (
            <div className="empty-state">
              <MessagesSquare size={22} />
              <p>Sin conversaciones</p>
              <small>Empieza una para coordinar con otro laboratorio de tu institución.</small>
            </div>
          ) : null}
          {threads.map((thread) => (
            <button
              key={thread.id}
              type="button"
              className={`message-thread${activeId === thread.id ? " message-thread-active" : ""}${Number(thread.unread_count) > 0 ? " message-thread-unread" : ""}`}
              onClick={() => void openThread(thread.id)}
            >
              <div className="message-thread-head">
                <strong>{thread.participants ?? "Conversación"}</strong>
                {Number(thread.unread_count) > 0 ? <span className="message-unread-badge">{thread.unread_count}</span> : null}
              </div>
              {thread.subject ? <em>{thread.subject}</em> : null}
              <p>{thread.last_message_preview ?? "Sin mensajes"}</p>
              <small>{formatDateTime(thread.last_message_at)}</small>
            </button>
          ))}
        </aside>

        <section className="messages-thread">
          {activeId ? (
            <>
              <header className="messages-thread-head">
                <Users size={16} />
                <div><strong>{participants}</strong><small>Conversación interna de la institución</small></div>
              </header>
              <div className="messages-scroll">
                {messages.map((message) => {
                  const mine = message.sender_user_id === session?.userId;
                  return (
                    <article key={message.id} className={`message-bubble${mine ? " message-bubble-mine" : ""}`}>
                      <header>
                        <strong>{mine ? "Tú" : message.sender_name ?? "Usuario"}</strong>
                        {message.laboratory_name && !mine ? <span>{message.laboratory_name}</span> : null}
                        <em>{formatDateTime(message.created_at)}</em>
                      </header>
                      <p>{message.body}</p>
                    </article>
                  );
                })}
                <div ref={bottomRef} />
              </div>
              <form className="messages-composer" onSubmit={send}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escribe tu mensaje…"
                  rows={2}
                  maxLength={5000}
                />
                <button type="submit" className="primary-button" disabled={sending || !draft.trim()}>
                  <Send size={15} /> {sending ? "Enviando…" : "Enviar"}
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <MessagesSquare size={22} />
              <p>Elige una conversación</p>
              <small>O empieza una nueva con alguien de tu institución.</small>
            </div>
          )}
        </section>
      </article>

      {composeOpen ? (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onSent={async (threadId) => {
            setComposeOpen(false);
            showToast("Mensaje enviado.");
            await loadThreads();
            await openThread(threadId);
          }}
          onError={showError}
        />
      ) : null}
      <Toast message={toastMessage} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ComposeModal({ onClose, onSent, onError }: Readonly<{
  onClose: () => void; onSent: (threadId: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const [directory, setDirectory] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/messages/directory")
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .catch(() => ({ data: [] }))
      .then((payload: { data?: DirectoryEntry[] }) => { if (active) setDirectory(payload.data ?? []); });
    return () => { active = false; };
  }, []);

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? directory.filter((person) => `${person.full_name} ${person.email} ${person.laboratories}`.toLowerCase().includes(needle))
    : directory;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.length) { onError("Elige al menos una persona."); return; }
    const data = new FormData(event.currentTarget);
    setSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientIds: selected,
          subject: String(data.get("subject") ?? "").trim() || undefined,
          body: String(data.get("body") ?? "").trim(),
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo enviar el mensaje.")); return; }
      const payload = await response.json() as { data?: { threadId?: string } };
      await onSent(String(payload.data?.threadId ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="MENSAJES" title="Nueva conversación" description="Elige a quién escribir dentro de tu institución." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label>
          <span>Buscar persona</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre, correo o laboratorio…" />
        </label>
        <div className="checkbox-grid">
          {filtered.map((person) => (
            <label className="check-line" key={person.id}>
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                onChange={(event) => setSelected((current) => event.target.checked ? [...current, person.id] : current.filter((id) => id !== person.id))}
              />
              <span>
                <strong>{person.full_name}</strong>
                <small>{person.role_label} · {person.laboratories}</small>
              </span>
            </label>
          ))}
          {filtered.length === 0 ? <p className="modal-note">No hay más personas en tu institución.</p> : null}
        </div>
        <label><span>Asunto <small>(opcional)</small></span><input name="subject" maxLength={200} /></label>
        <label><span>Mensaje *</span><textarea name="body" rows={4} required maxLength={5000} /></label>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={sending}><Send size={15} /> {sending ? "Enviando…" : "Enviar"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}
