"use client";

import { useCallback, useEffect, useState } from "react";

export const NOTIFICATIONS_UPDATED_EVENT = "nexalab:notifications-updated";

export function notifyNotificationCountChanged(): void {
  window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT));
}

export function SidebarAlertCount() {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as { unreadCount?: number };
      setCount(Math.max(0, payload.unreadCount ?? 0));
    } catch {
      // El badge es complementario; el centro de notificaciones muestra su error.
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, load);
    return () => window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, load);
  }, [load]);

  if (count === 0) return null;
  const visible = count > 99 ? "99+" : String(count);
  return <em aria-label={`${count} alertas o avisos pendientes`}>{visible}</em>;
}
