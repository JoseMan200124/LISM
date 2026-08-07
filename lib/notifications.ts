import { hasAnyPermission, hasPermission } from "@/lib/authorization";
import { getSql, hasDatabase } from "@/lib/db";
import { incidentRows } from "@/lib/demo-data";
import { isEducationalProfile } from "@/lib/lab-profile";
import { canAuthorizeControlled, isMissingAuthorizationMigration } from "@/lib/controlled-usage-service";
import type { UserSession } from "@/lib/session";

export type NotificationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export type NotificationItem = {
  key: string;
  type: "alert" | "education" | "controlled" | "message" | "expiry" | "permit";
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

  // Autorizaciones de reactivos controlados: sustituyen el ir y venir con la
  // hoja de papel. Al responsable le llegan las solicitudes por autorizar; al
  // solicitante, la respuesta. Si la migración 0020 no está aplicada, el bloque
  // se omite en silencio.
  if (hasPermission(session, "inventory.view")) {
    try {
      if (canAuthorizeControlled(session)) {
        const pendingRows = await sql`
          SELECT r.id, r.request_code, r.quantity, r.unit, r.usage_purpose, r.created_at,
            i.name AS item_name, rq.full_name AS requested_by_name
          FROM controlled_usage_requests r
          JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
          LEFT JOIN users rq ON rq.id = r.requested_by
          WHERE r.laboratory_id = ${session.laboratoryId} AND r.status = 'PENDING'
          ORDER BY r.created_at DESC LIMIT 30
        `;
        for (const row of pendingRows as Array<Record<string, unknown>>) {
          items.push({
            key: `controlled:${row.id}:PENDING`,
            type: "controlled",
            severity: "WARNING",
            title: `Por autorizar: ${String(row.item_name ?? "reactivo controlado")}`,
            body: `${String(row.requested_by_name ?? "Un usuario")} solicita ${String(row.quantity)} ${String(row.unit ?? "")} · ${String(row.usage_purpose ?? "")}`.trim(),
            targetUrl: `/app/controlled?tab=authorizations&requestId=${row.id}`,
            createdAt: toIso(row.created_at),
            isRead: false,
          });
        }
      }

      // Respuesta a mis solicitudes: autorizadas vigentes por consumir y
      // rechazos recientes.
      const mineRows = await sql`
        SELECT r.id, r.request_code, r.status, r.approved_quantity, r.quantity, r.unit,
          r.expires_at, r.review_note, r.reviewed_at, i.name AS item_name,
          rv.full_name AS reviewed_by_name
        FROM controlled_usage_requests r
        JOIN inventory_items i ON i.id = r.inventory_item_id AND i.laboratory_id = r.laboratory_id
        LEFT JOIN users rv ON rv.id = r.reviewed_by
        WHERE r.laboratory_id = ${session.laboratoryId} AND r.requested_by = ${session.userId}
          AND (
            (r.status = 'APPROVED' AND r.consumed_at IS NULL AND (r.expires_at IS NULL OR r.expires_at > now()))
            OR (r.status = 'REJECTED' AND r.reviewed_at > now() - INTERVAL '7 days')
          )
        ORDER BY r.reviewed_at DESC LIMIT 30
      `;
      for (const row of mineRows as Array<Record<string, unknown>>) {
        const approved = String(row.status) === "APPROVED";
        items.push({
          key: `controlled:${row.id}:${String(row.status)}`,
          type: "controlled",
          severity: approved ? "INFO" : "WARNING",
          title: approved
            ? `Uso autorizado: ${String(row.item_name ?? "reactivo controlado")}`
            : `Solicitud rechazada: ${String(row.item_name ?? "reactivo controlado")}`,
          body: approved
            ? `${String(row.approved_quantity ?? row.quantity)} ${String(row.unit ?? "")} autorizados por ${String(row.reviewed_by_name ?? "el responsable")} · folio ${String(row.request_code)}. Ya puedes registrar el consumo.`.trim()
            : `${String(row.reviewed_by_name ?? "El responsable")}: ${String(row.review_note ?? "sin motivo indicado")}`,
          targetUrl: `/app/controlled?tab=authorizations&requestId=${row.id}`,
          createdAt: toIso(row.reviewed_at ?? row.expires_at),
          isRead: false,
        });
      }
    } catch (error) {
      if (!isMissingAuthorizationMigration(error)) throw error;
    }
  }

  // Mensajes internos sin leer: la campanita es el primer sitio donde se mira.
  if (!session.guest) {
    try {
      const messageRows = await sql`
        SELECT t.id, t.subject, t.last_message_at, t.last_message_preview,
               (
                 SELECT count(*)::int FROM messages m
                 WHERE m.thread_id = t.id AND m.sender_user_id <> ${session.userId}
                   AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
               ) AS unread_count,
               (
                 SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name)
                 FROM message_thread_participants tp JOIN users u ON u.id = tp.user_id
                 WHERE tp.thread_id = t.id AND tp.user_id <> ${session.userId}
               ) AS participants
        FROM message_thread_participants p
        JOIN message_threads t ON t.id = p.thread_id
        WHERE p.user_id = ${session.userId} AND p.organization_id = ${session.organizationId} AND p.archived_at IS NULL
        ORDER BY t.last_message_at DESC LIMIT 20
      `;
      for (const row of messageRows as Array<Record<string, unknown>>) {
        const unread = Number(row.unread_count ?? 0);
        if (unread <= 0) continue;
        items.push({
          key: `message:${row.id}:${toIso(row.last_message_at)}`,
          type: "message",
          severity: "INFO",
          title: `Mensaje de ${String(row.participants ?? "un compañero")}`,
          body: row.last_message_preview ? String(row.last_message_preview) : `${unread} mensaje(s) sin leer`,
          targetUrl: `/app/messages?threadId=${row.id}`,
          createdAt: toIso(row.last_message_at),
          isRead: false,
        });
      }
    } catch {
      // La mensajería llega con la migración 0025: hasta entonces se omite.
    }
  }

  // Reactivos por vencer y ya vencidos: es la alerta que más cuesta cara en una
  // inspección y la que el equipo necesita ver sin entrar al módulo.
  if (hasPermission(session, "inventory.view")) {
    try {
      const expiryRows = await sql`
        SELECT i.id, i.sku, i.name, i.expires_at, i.quantity, i.unit,
               (i.expires_at - current_date) AS days_left,
               (i.is_controlled OR c.category IN ('CONTROLLED','DUAL_USE','PRECURSOR')) AS controlled
        FROM inventory_items i
        LEFT JOIN reagent_catalog c ON c.id = i.catalog_id
        WHERE i.laboratory_id = ${session.laboratoryId} AND i.status = 'ACTIVE'
          AND i.alert_expiry = TRUE AND i.expires_at IS NOT NULL
          AND i.expires_at <= current_date + 30 AND i.quantity > 0
        ORDER BY i.expires_at LIMIT 25
      `;
      for (const row of expiryRows as Array<Record<string, unknown>>) {
        const daysLeft = Number(row.days_left ?? 0);
        const expired = daysLeft < 0;
        items.push({
          key: `expiry:${row.id}:${String(row.expires_at)}`,
          type: "expiry",
          severity: expired ? "HIGH" : "WARNING",
          title: expired
            ? `Reactivo vencido: ${String(row.name)}`
            : `Por vencer en ${daysLeft} día(s): ${String(row.name)}`,
          body: `${String(row.sku)} · quedan ${String(row.quantity)} ${String(row.unit ?? "")}${row.controlled ? " · reactivo controlado" : ""}`.trim(),
          targetUrl: `/app/inventory?itemId=${row.id}`,
          createdAt: toIso(row.expires_at),
          isRead: false,
        });
      }
    } catch {
      // Sin la migración 0024 el catálogo no existe todavía.
    }
  }

  // Licencias y permisos por vencer: sin ellos no se puede comprar ni usar.
  if (hasAnyPermission(session, ["compliance.view", "compliance.manage"])) {
    try {
      const permitRows = await sql`
        SELECT id, permit_type, authority, permit_number, expires_on,
               (expires_on - current_date) AS days_left
        FROM regulatory_permits
        WHERE laboratory_id = ${session.laboratoryId} AND status = 'ACTIVE'
          AND expires_on IS NOT NULL AND expires_on <= current_date + 60
        ORDER BY expires_on LIMIT 20
      `;
      for (const row of permitRows as Array<Record<string, unknown>>) {
        const daysLeft = Number(row.days_left ?? 0);
        const expired = daysLeft < 0;
        items.push({
          key: `permit:${row.id}:${String(row.expires_on)}`,
          type: "permit",
          severity: expired ? "CRITICAL" : "HIGH",
          title: expired
            ? `Licencia vencida: ${String(row.permit_number)}`
            : `Licencia por vencer en ${daysLeft} día(s): ${String(row.permit_number)}`,
          body: `${String(row.authority)} · renovar antes de seguir comprando o usando reactivos controlados`,
          targetUrl: `/app/controlled?tab=permits&permitId=${row.id}`,
          createdAt: toIso(row.expires_on),
          isRead: false,
        });
      }
    } catch {
      // Sin la migración 0024 la tabla no existe todavía.
    }
  }

  if (items.length === 0) {
    return { data: [], mode: "database" };
  }

  // `dismissed_at` llega con la migración 0028: sin ella se sigue leyendo solo
  // el estado de lectura y no se descarta nada.
  const readRows = await sql`
    SELECT notification_key, dismissed_at FROM user_notification_reads WHERE user_id = ${session.userId}
  `.catch(async () => sql`
    SELECT notification_key, NULL AS dismissed_at FROM user_notification_reads WHERE user_id = ${session.userId}
  `);
  const rows = readRows as Array<Record<string, unknown>>;
  const readKeys = new Set(rows.map((r) => String(r.notification_key)));
  const dismissedKeys = new Set(rows.filter((r) => r.dismissed_at).map((r) => String(r.notification_key)));

  const withReadState = items
    .filter((item) => !dismissedKeys.has(item.key))
    .map((item) => ({ ...item, isRead: readKeys.has(item.key) }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return { data: withReadState, mode: "database" };
}
