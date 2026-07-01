import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { incidentRows } from "@/lib/demo-data";
import { isEducationalProfile } from "@/lib/lab-profile";
import type { UserSession } from "@/lib/session";

export type NotificationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type NotificationItem = {
  key: string;
  type: "alert" | "education";
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  targetUrl: string;
  createdAt: string;
  isRead: boolean;
};

const DEMO_SEVERITY: Record<string, NotificationSeverity> = {
  Alta: "HIGH",
  "Muy alta": "CRITICAL",
  Media: "WARNING",
  Baja: "INFO",
};

function toIso(value: unknown): string {
  // El driver `pg` devuelve objetos Date para columnas timestamptz; Neon
  // devuelve strings ISO. Normalizar aquí evita el formato no-ISO de
  // Date.prototype.toString() llegando al cliente.
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function demoNotifications(): NotificationItem[] {
  // Reutiliza incidentRows (lib/demo-data.ts), la misma fuente que ya usa
  // /api/alerts en modo demo — nunca se inventan datos nuevos.
  return incidentRows.map((row) => ({
    key: `alert:${row.id}`,
    type: "alert",
    severity: DEMO_SEVERITY[row.severity] ?? "INFO",
    title: row.title,
    body: `${row.type} · ${row.owner}`,
    targetUrl: "/app/alerts",
    createdAt: new Date().toISOString(),
    isRead: row.status === "Cerrada",
  }));
}

function educationalAudienceFilter(role: UserSession["role"]): string[] | null {
  if (role === "STUDENT") return ["STUDENTS", "ALL"];
  if (role === "PROFESSOR") return ["PROFESSORS", "ALL"];
  return null; // roles administrativos ven todos los avisos del laboratorio
}

export async function resolveNotifications(
  session: UserSession,
): Promise<{ data: NotificationItem[]; mode: "demo" | "database" }> {
  if (!hasDatabase()) {
    return { data: demoNotifications(), mode: "demo" };
  }

  const sql = getSql();
  const items: NotificationItem[] = [];

  if (hasAnyPermission(session, ["quality.view", "inventory.view", "equipment.view"])) {
    const alertRows = await sql`
      SELECT id, severity, title, details, created_at
      FROM alerts
      WHERE laboratory_id = ${session.laboratoryId}
        AND status IN ('OPEN', 'ASSIGNED')
      ORDER BY CASE severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'WARNING' THEN 3 ELSE 4 END, created_at DESC
      LIMIT 30
    `;
    for (const row of alertRows as Array<Record<string, unknown>>) {
      items.push({
        key: `alert:${row.id}`,
        type: "alert",
        severity: (row.severity as NotificationSeverity) ?? "INFO",
        title: String(row.title ?? "Alerta"),
        body: row.details ? String(row.details) : null,
        targetUrl: "/app/alerts",
        createdAt: toIso(row.created_at),
        isRead: false,
      });
    }
  }

  if (isEducationalProfile() && hasPermission(session, "education.view")) {
    const audiences = educationalAudienceFilter(session.role);
    const notifRows = audiences
      ? await sql`
          SELECT id, title, body, publish_at
          FROM educational_notifications
          WHERE laboratory_id = ${session.laboratoryId}
            AND audience = ANY(${audiences})
          ORDER BY publish_at DESC
          LIMIT 30
        `
      : await sql`
          SELECT id, title, body, publish_at
          FROM educational_notifications
          WHERE laboratory_id = ${session.laboratoryId}
          ORDER BY publish_at DESC
          LIMIT 30
        `;
    for (const row of notifRows as Array<Record<string, unknown>>) {
      items.push({
        key: `edu:${row.id}`,
        type: "education",
        severity: "INFO",
        title: String(row.title ?? "Aviso"),
        body: row.body ? String(row.body) : null,
        targetUrl: "/app/education",
        createdAt: toIso(row.publish_at),
        isRead: false,
      });
    }
  }

  if (items.length === 0) {
    return { data: [], mode: "database" };
  }

  const readRows = await sql`
    SELECT notification_key FROM user_notification_reads WHERE user_id = ${session.userId}
  `;
  const readKeys = new Set((readRows as Array<Record<string, unknown>>).map((r) => String(r.notification_key)));

  const withReadState = items
    .map((item) => ({ ...item, isRead: readKeys.has(item.key) }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { data: withReadState, mode: "database" };
}
