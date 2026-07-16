import { hasPermission } from "@/lib/authorization";
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

  if (hasPermission(session, "alerts.view")) {
    const alertRows = session.role === "PROFESSOR" ? await sql`
      SELECT DISTINCT a.id, a.severity, a.title, a.details, a.source_type, a.source_id, a.created_at
      FROM alerts a
      LEFT JOIN educational_practices ep ON ep.id = a.source_id AND a.source_type = 'EDUCATIONAL_PRACTICE' AND ep.laboratory_id = a.laboratory_id
      LEFT JOIN resource_reservations rr ON rr.id = a.source_id AND a.source_type = 'RESOURCE_RESERVATION' AND rr.laboratory_id = a.laboratory_id
      LEFT JOIN educational_practices rp ON rp.id = rr.practice_id AND rp.laboratory_id = a.laboratory_id
      WHERE a.laboratory_id = ${session.laboratoryId} AND a.status IN ('OPEN','ACKNOWLEDGED','ASSIGNED','IN_REVIEW')
        AND (ep.teacher_user_id = ${session.userId} OR rp.teacher_user_id = ${session.userId})
      ORDER BY a.created_at DESC LIMIT 30
    ` : await sql`
      SELECT id, severity, title, details, source_type, source_id, created_at
      FROM alerts
      WHERE laboratory_id = ${session.laboratoryId}
        AND status IN ('OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_REVIEW')
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
        targetUrl: `/app/alerts?alertId=${row.id}`,
        createdAt: toIso(row.created_at),
        isRead: false,
      });
    }
  }

  if (isEducationalProfile(session.profileCode) && hasPermission(session, "education.view")) {
    const audiences = educationalAudienceFilter(session.role);
    const notifRows = session.role === "STUDENT" ? await sql`
          SELECT DISTINCT n.id, n.title, n.body, n.publish_at
          FROM educational_notifications n
          LEFT JOIN educational_practices ep ON ep.id = n.practice_id AND ep.laboratory_id = n.laboratory_id
          LEFT JOIN educational_practice_participants pp ON pp.practice_id = ep.id AND pp.laboratory_id = n.laboratory_id AND pp.user_id = ${session.userId} AND pp.status = 'ACTIVE'
          LEFT JOIN educational_group_members gm ON gm.group_id = COALESCE(n.group_id, ep.group_id) AND gm.laboratory_id = n.laboratory_id AND gm.user_id = ${session.userId} AND gm.status = 'ACTIVE'
          WHERE n.laboratory_id = ${session.laboratoryId} AND n.audience IN ('STUDENTS','ALL') AND n.publish_at <= now() AND n.status IN ('PUBLISHED','SCHEDULED')
            AND (n.practice_id IS NULL AND n.group_id IS NULL OR pp.id IS NOT NULL OR gm.id IS NOT NULL)
          ORDER BY n.publish_at DESC LIMIT 30
        ` : audiences ? await sql`
          SELECT id, title, body, publish_at
          FROM educational_notifications
          WHERE laboratory_id = ${session.laboratoryId}
            AND audience = ANY(${audiences})
            AND publish_at <= now() AND status IN ('PUBLISHED','SCHEDULED')
          ORDER BY publish_at DESC
          LIMIT 30
        `
      : await sql`
          SELECT id, title, body, publish_at
          FROM educational_notifications
          WHERE laboratory_id = ${session.laboratoryId}
            AND publish_at <= now() AND status IN ('PUBLISHED','SCHEDULED')
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
        targetUrl: `/app/education?tab=notices&noticeId=${row.id}`,
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
