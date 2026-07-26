"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

// Icono de mensajes de la barra superior, junto al de notificaciones y al del
// usuario. Solo muestra el contador: la conversación vive en su módulo.

export function MessagesIndicator() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/messages?count=1");
        if (!response.ok) return;
        const payload = await response.json() as { unreadTotal?: number };
        if (active) setUnread(Number(payload.unreadTotal ?? 0));
      } catch {
        // El contador es informativo: si falla, se reintenta en el siguiente ciclo.
      }
    }
    void load();
    // Un minuto es suficiente para un mensaje interno y no castiga al servidor.
    const timer = window.setInterval(load, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return (
    <Link
      href="/app/messages"
      className="icon-button messages-indicator"
      aria-label={unread > 0 ? `Mensajes: ${unread} sin leer` : "Mensajes"}
      title={unread > 0 ? `${unread} mensaje(s) sin leer` : "Mensajes"}
    >
      <MessageSquare size={18} />
      {unread > 0 ? <span className="messages-indicator-badge">{unread > 99 ? "99+" : unread}</span> : null}
    </Link>
  );
}
