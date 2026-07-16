"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCheck, CircleAlert, GraduationCap, Info } from "lucide-react";
import type { NotificationItem, NotificationSeverity } from "@/lib/notifications";
import { notifyNotificationCountChanged } from "@/components/sidebar-alert-count";

function severityIcon(item: NotificationItem) {
  if (item.type === "education") return <GraduationCap size={15} />;
  const bySeverity: Record<NotificationSeverity, React.ReactNode> = {
    CRITICAL: <AlertTriangle size={15} />,
    HIGH: <AlertTriangle size={15} />,
    WARNING: <CircleAlert size={15} />,
    INFO: <Info size={15} />,
  };
  return bySeverity[item.severity];
}

function severityToneClass(item: NotificationItem): string {
  if (item.type === "education") return "notif-avatar-teal";
  const map: Record<NotificationSeverity, string> = {
    CRITICAL: "notif-avatar-red",
    HIGH: "notif-avatar-red",
    WARNING: "notif-avatar-amber",
    INFO: "notif-avatar-teal",
  };
  return map[item.severity];
}

function badgeClass(item: NotificationItem): string {
  if (item.type === "education") return "notification-badge-info";
  const map: Record<NotificationSeverity, string> = {
    CRITICAL: "notification-badge-danger",
    HIGH: "notification-badge-danger",
    WARNING: "notification-badge-warning",
    INFO: "notification-badge-info",
  };
  return map[item.severity];
}

function badgeLabel(item: NotificationItem): string {
  if (item.type === "education") return "Aviso";
  const map: Record<NotificationSeverity, string> = {
    CRITICAL: "Crítica", HIGH: "Alta", WARNING: "Advertencia", INFO: "Info",
  };
  return map[item.severity];
}

function formatRelativeTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("es-GT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function groupByDate(items: NotificationItem[]): Array<{ label: string; items: NotificationItem[] }> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const startOfWeek = startOfToday - 7 * 86_400_000;

  const groups = { hoy: [] as NotificationItem[], ayer: [] as NotificationItem[], semana: [] as NotificationItem[], antes: [] as NotificationItem[] };
  for (const item of items) {
    const t = new Date(item.createdAt).getTime();
    if (t >= startOfToday) groups.hoy.push(item);
    else if (t >= startOfYesterday) groups.ayer.push(item);
    else if (t >= startOfWeek) groups.semana.push(item);
    else groups.antes.push(item);
  }
  return [
    { label: "Hoy", items: groups.hoy },
    { label: "Ayer", items: groups.ayer },
    { label: "Esta semana", items: groups.semana },
    { label: "Anteriores", items: groups.antes },
  ].filter((group) => group.items.length > 0);
}

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications");
      if (!response.ok) {
        setError("No se pudieron cargar las notificaciones.");
        return;
      }
      const payload = await response.json() as { data: NotificationItem[]; unreadCount: number };
      setItems(payload.data ?? []);
      setUnreadCount(payload.unreadCount ?? 0);
    } catch {
      setError("No se pudieron cargar las notificaciones. Verifica tu conexión.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    notifyNotificationCountChanged();
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
    } catch {
      // El estado optimista ya se aplicó; una siguiente carga lo corrige si algo falló.
    }
  }

  async function openNotification(item: NotificationItem) {
    setOpen(false);
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.key === item.key ? { ...n, isRead: true } : n)));
      setUnreadCount((count) => Math.max(0, count - 1));
      notifyNotificationCountChanged();
      try {
        await fetch("/api/notifications/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: item.key }),
        });
      } catch {
        // No bloquea la navegación si falla marcar como leída.
      }
    }
    router.push(item.targetUrl);
  }

  const groups = groupByDate(items);

  return (
    <div className="relative-menu-wrap" ref={wrapRef}>
      <button
        className="icon-button notification-button"
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ""}`}
        onClick={() => setOpen((v) => !v)}
        data-tutorial="notifications-bell"
      >
        <Bell size={18} />
        {unreadCount > 0 ? <span aria-hidden="true" /> : null}
      </button>
      {open ? (
        <div className="compact-popover notification-popover notification-popover-wide">
          <div className="notification-popover-head">
            <strong>Notificaciones</strong>
            {unreadCount > 0 ? (
              <button className="notification-mark-all" onClick={markAllRead}>
                <CheckCheck size={13} /> Marcar todas como leídas
              </button>
            ) : null}
          </div>
          <div className="notification-popover-body">
            {loading ? (
              <p className="notification-popover-status">Cargando…</p>
            ) : error ? (
              <p className="notification-popover-status notification-popover-error">{error}</p>
            ) : items.length === 0 ? (
              <p className="notification-popover-status">Sin notificaciones por ahora.</p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="notification-group">
                  <span className="notification-group-label">{group.label}</span>
                  {group.items.map((item) => (
                    <button
                      key={item.key}
                      className={`notif-item notification-item-button ${!item.isRead ? "notif-item-unread" : ""}`}
                      onClick={() => void openNotification(item)}
                    >
                      <div className={`notif-avatar ${severityToneClass(item)}`}>{severityIcon(item)}</div>
                      <div>
                        <div className="notif-row-top">
                          <span className="notif-time">{formatRelativeTime(item.createdAt)}</span>
                          {!item.isRead ? <span className="notif-unread-dot" aria-label="No leído" /> : null}
                        </div>
                        <p className="notif-title">{item.title}</p>
                        {item.body ? <p className="notif-body">{item.body}</p> : null}
                        <span className={`notification-badge ${badgeClass(item)}`}>{badgeLabel(item)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
