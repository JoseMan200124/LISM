"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CalendarClock, FileWarning, MessageSquare, TriangleAlert } from "lucide-react";
import { ActionModal } from "@/components/action-kit";
import type { NotificationItem } from "@/lib/notifications";

// Resumen de bienvenida: lo que hay pendiente al entrar. Aparece una vez por
// sesión del navegador —no en cada navegación— y solo si hay algo que decir;
// abrir NexaLab y encontrarse un diálogo vacío sería ruido.

const SEEN_KEY = "nexalab.session-summary-seen";

type Group = {
  key: string;
  icon: typeof Bell;
  label: string;
  count: number;
  detail: string;
  href: string;
  tone: "danger" | "warning" | "info";
};

export function SessionSummary() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(SEEN_KEY) === "1") return;
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/notifications");
        if (!response.ok) return;
        const payload = await response.json() as { data?: NotificationItem[] };
        const items = (payload.data ?? []).filter((item) => !item.isRead);
        if (!active || items.length === 0) return;

        const byType = {
          message: items.filter((item) => item.type === "message"),
          permit: items.filter((item) => item.type === "permit"),
          expiry: items.filter((item) => item.type === "expiry"),
          controlled: items.filter((item) => item.type === "controlled"),
          alert: items.filter((item) => item.type === "alert"),
          education: items.filter((item) => item.type === "education"),
        };

        const next: Group[] = [];
        if (byType.message.length) {
          next.push({
            key: "message", icon: MessageSquare, label: "Mensajes sin leer", count: byType.message.length,
            detail: byType.message.map((item) => item.title.replace("Mensaje de ", "")).slice(0, 3).join(", "),
            href: "/app/messages", tone: "info",
          });
        }
        if (byType.permit.length) {
          next.push({
            key: "permit", icon: FileWarning, label: "Licencias por vencer o vencidas", count: byType.permit.length,
            detail: "Renuévalas antes de seguir comprando o usando reactivos controlados.",
            href: "/app/controlled?tab=permits", tone: "danger",
          });
        }
        if (byType.expiry.length) {
          next.push({
            key: "expiry", icon: CalendarClock, label: "Reactivos por vencer", count: byType.expiry.length,
            detail: byType.expiry.slice(0, 3).map((item) => item.title.split(": ").pop()).join(", "),
            href: "/app/inventory", tone: "warning",
          });
        }
        if (byType.controlled.length) {
          next.push({
            key: "controlled", icon: TriangleAlert, label: "Autorizaciones de reactivos controlados", count: byType.controlled.length,
            detail: "Solicitudes por autorizar o respuestas a las tuyas.",
            href: "/app/controlled?tab=authorizations", tone: "warning",
          });
        }
        if (byType.alert.length) {
          next.push({
            key: "alert", icon: AlertTriangle, label: "Alertas activas", count: byType.alert.length,
            detail: byType.alert.slice(0, 2).map((item) => item.title).join(" · "),
            href: "/app/alerts", tone: "danger",
          });
        }
        if (byType.education.length) {
          next.push({
            key: "education", icon: Bell, label: "Avisos del programa", count: byType.education.length,
            detail: byType.education.slice(0, 2).map((item) => item.title).join(" · "),
            href: "/app/education?tab=notices", tone: "info",
          });
        }

        if (next.length === 0) return;
        setGroups(next);
        setOpen(true);
      } catch {
        // El resumen es cortesía: si falla, la campanita sigue estando ahí.
      }
    })();

    return () => { active = false; };
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(SEEN_KEY, "1");
    setOpen(false);
  }

  if (!open) return null;

  return (
    <ActionModal
      open
      eyebrow="AL ENTRAR"
      title="Esto es lo que te espera"
      description="Un resumen de lo pendiente. Lo tienes siempre disponible en la campanita."
      onClose={dismiss}
    >
      <div className="modal-form session-summary">
        <ul className="session-summary-list">
          {groups.map((group) => {
            const Icon = group.icon;
            return (
              <li key={group.key}>
                <button
                  type="button"
                  className={`session-summary-item session-summary-${group.tone}`}
                  onClick={() => { dismiss(); router.push(group.href); }}
                >
                  <span className="session-summary-icon"><Icon size={17} /></span>
                  <span className="session-summary-copy">
                    <strong>{group.count} · {group.label}</strong>
                    <small>{group.detail}</small>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <footer className="modal-actions">
          <button type="button" className="primary-button" onClick={dismiss}>Entendido</button>
        </footer>
      </div>
    </ActionModal>
  );
}
