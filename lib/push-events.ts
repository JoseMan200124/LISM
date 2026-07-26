// Eventos de dominio que se traducen en una notificación push al móvil.
//
// Cada función replica el destinatario que ya tiene la notificación
// equivalente en la campana de la web (lib/notifications.ts), de modo que el
// móvil no muestra nada que el usuario no pudiera ver en el navegador.
//
// Todas resuelven a `void` y se invocan mediante `dispatchPush(...)`: un fallo
// de envío nunca debe alterar la operación que lo originó.

import { getSql } from "@/lib/db";
import { sendPushToPermission, sendPushToUsers, type PushMessage } from "@/lib/push";
import type { UserSession } from "@/lib/session";

async function userIdsByRole(
  laboratoryId: string,
  roles: Array<UserSession["role"]>,
): Promise<string[]> {
  const sql = getSql();
  const rows = (await sql`
    SELECT m.user_id FROM memberships m
    JOIN users u ON u.id = m.user_id AND u.status = 'ACTIVE'
    WHERE m.laboratory_id = ${laboratoryId} AND m.status = 'ACTIVE' AND m.role = ANY(${roles})
  `) as Array<{ user_id: string }>;
  return rows.map((row) => String(row.user_id));
}

// ─── Educación ───────────────────────────────────────────────────────────────

/**
 * Aviso educativo. Si está acotado a una práctica o a un grupo se notifica solo
 * a sus integrantes; en caso contrario, a la audiencia por rol.
 */
export async function notifyEducationalAudience(
  session: UserSession,
  input: {
    notificationId: string;
    title: string;
    body: string;
    audience: "STUDENTS" | "PROFESSORS" | "ALL";
    practiceId?: string | null;
    groupId?: string | null;
  },
): Promise<void> {
  const sql = getSql();
  let recipients: string[] = [];

  if (input.practiceId || input.groupId) {
    const rows = (await sql`
      SELECT DISTINCT user_id FROM (
        SELECT pp.user_id
        FROM educational_practice_participants pp
        WHERE pp.laboratory_id = ${session.laboratoryId}
          AND pp.status = 'ACTIVE'
          AND (${input.practiceId ?? null}::uuid IS NOT NULL AND pp.practice_id = ${input.practiceId ?? null}::uuid)
        UNION
        SELECT gm.user_id
        FROM educational_group_members gm
        WHERE gm.laboratory_id = ${session.laboratoryId}
          AND gm.status = 'ACTIVE'
          AND (${input.groupId ?? null}::uuid IS NOT NULL AND gm.group_id = ${input.groupId ?? null}::uuid)
      ) AS members
    `) as Array<{ user_id: string }>;
    recipients = rows.map((row) => String(row.user_id));
  }

  if (recipients.length === 0) {
    const roles: Array<UserSession["role"]> =
      input.audience === "STUDENTS" ? ["STUDENT"]
      : input.audience === "PROFESSORS" ? ["PROFESSOR"]
      : ["STUDENT", "PROFESSOR"];
    recipients = await userIdsByRole(session.laboratoryId, roles);
  }

  await sendPushToUsers(
    recipients.filter((userId) => userId !== session.userId),
    {
      title: input.title,
      body: input.body.slice(0, 240),
      channelId: "education",
      targetUrl: `/education?tab=notices&noticeId=${input.notificationId}`,
      data: { type: "education", notificationId: input.notificationId },
    },
  );
}

/** Reserva de recurso creada: avisa a quien debe prepararla o aprobarla. */
export async function notifyReservationCreated(
  session: UserSession,
  input: { reservationId: string; resourceName: string; practiceTitle?: string | null; quantity?: number | string | null; unit?: string | null },
): Promise<void> {
  const amount = input.quantity ? `${input.quantity} ${input.unit ?? ""}`.trim() : "";
  await sendPushToPermission(
    session.laboratoryId,
    "education.manage",
    {
      title: "Nueva reserva de recurso",
      body: `${session.name} solicitó ${amount ? `${amount} de ` : ""}${input.resourceName}${input.practiceTitle ? ` para ${input.practiceTitle}` : ""}.`,
      channelId: "education",
      targetUrl: `/education?tab=reservations&reservationId=${input.reservationId}`,
      data: { type: "reservation", reservationId: input.reservationId },
    },
    { excludeUserId: session.userId },
  );
}

/** Respuesta a una reserva: avisa a quien la pidió. */
export async function notifyReservationResolved(
  session: UserSession,
  input: { reservationId: string; requestedBy: string; resourceName: string; status: string },
): Promise<void> {
  if (!input.requestedBy || input.requestedBy === session.userId) return;
  const labels: Record<string, string> = {
    APPROVED: "aprobada", PREPARING: "en preparación", READY: "lista para recoger",
    PARTIAL: "aprobada parcialmente", REJECTED: "rechazada", CONSUMED: "registrada como consumida",
    RETURNED: "devuelta", CANCELLED: "cancelada",
  };
  await sendPushToUsers([input.requestedBy], {
    title: `Reserva ${labels[input.status] ?? "actualizada"}`,
    body: `${input.resourceName} · ${session.name}`,
    channelId: "education",
    targetUrl: `/education?tab=reservations&reservationId=${input.reservationId}`,
    data: { type: "reservation", reservationId: input.reservationId },
  });
}

// ─── Reactivos controlados ───────────────────────────────────────────────────

/** Solicitud de uso pendiente: avisa a los responsables que pueden autorizar. */
export async function notifyControlledRequest(
  session: UserSession,
  input: { requestId: string; itemName: string; quantity: number | string; unit: string; purpose: string },
): Promise<void> {
  await sendPushToPermission(
    session.laboratoryId,
    "inventory.manage",
    {
      title: `Por autorizar: ${input.itemName}`,
      body: `${session.name} solicita ${input.quantity} ${input.unit} · ${input.purpose}`.trim(),
      channelId: "controlled",
      targetUrl: `/controlled?tab=authorizations&requestId=${input.requestId}`,
      data: { type: "controlled", requestId: input.requestId },
    },
    { excludeUserId: session.userId },
  );
}

/** Autorización o rechazo: avisa a quien hizo la solicitud. */
export async function notifyControlledResolved(
  session: UserSession,
  input: {
    requestId: string; requestedBy: string; itemName: string;
    approved: boolean; quantity?: number | string | null; unit?: string | null; note?: string | null;
  },
): Promise<void> {
  if (!input.requestedBy || input.requestedBy === session.userId) return;
  await sendPushToUsers([input.requestedBy], {
    title: input.approved ? `Uso autorizado: ${input.itemName}` : `Solicitud rechazada: ${input.itemName}`,
    body: input.approved
      ? `${input.quantity ?? ""} ${input.unit ?? ""} autorizados por ${session.name}. Ya puedes registrar el consumo.`.trim()
      : `${session.name}: ${input.note || "sin motivo indicado"}`,
    channelId: "controlled",
    targetUrl: `/controlled?tab=authorizations&requestId=${input.requestId}`,
    data: { type: "controlled", requestId: input.requestId },
  });
}

// ─── Incidencias ─────────────────────────────────────────────────────────────

export async function notifyIncidentCreated(
  session: UserSession,
  input: { incidentId: string; code: string; title: string; severity: string; assignedTo?: string | null },
): Promise<void> {
  const severityLabel: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", CRITICAL: "Crítica" };
  const message: PushMessage = {
    title: `Nueva incidencia · ${severityLabel[input.severity] ?? input.severity}`,
    body: `${input.code} — ${input.title}`,
    channelId: "alerts",
    targetUrl: `/incidents?incidentId=${input.incidentId}`,
    data: { type: "incident", incidentId: input.incidentId },
  };
  await sendPushToPermission(session.laboratoryId, "incidents.manage", message, { excludeUserId: session.userId });
  if (input.assignedTo && input.assignedTo !== session.userId) {
    await sendPushToUsers([input.assignedTo], { ...message, title: "Incidencia asignada a ti" });
  }
}

export async function notifyIncidentAssigned(
  session: UserSession,
  input: { incidentId: string; code: string; title: string; assignedTo: string },
): Promise<void> {
  if (!input.assignedTo || input.assignedTo === session.userId) return;
  await sendPushToUsers([input.assignedTo], {
    title: "Incidencia asignada a ti",
    body: `${input.code} — ${input.title}`,
    channelId: "alerts",
    targetUrl: `/incidents?incidentId=${input.incidentId}`,
    data: { type: "incident", incidentId: input.incidentId },
  });
}

// ─── Compras ─────────────────────────────────────────────────────────────────

export async function notifyPurchaseStatus(
  session: UserSession,
  input: { requestId: string; code: string; title: string; status: string; requestedBy?: string | null },
): Promise<void> {
  if (!input.requestedBy || input.requestedBy === session.userId) return;
  const labels: Record<string, string> = {
    PENDING: "enviada a revisión", APPROVED: "aprobada", ORDERED: "pedida al proveedor",
    RECEIVED: "recibida", CANCELLED: "cancelada", DRAFT: "devuelta a borrador",
  };
  await sendPushToUsers([input.requestedBy], {
    title: `Solicitud de compra ${labels[input.status] ?? "actualizada"}`,
    body: `${input.code} — ${input.title}`,
    channelId: "general",
    targetUrl: `/purchasing?requestId=${input.requestId}`,
    data: { type: "purchasing", requestId: input.requestId },
  });
}

// ─── Alertas ─────────────────────────────────────────────────────────────────

export async function notifyAlertRaised(
  laboratoryId: string,
  input: { alertId: string; title: string; details?: string | null; severity: string },
): Promise<void> {
  await sendPushToPermission(laboratoryId, "alerts.view", {
    title: input.title,
    body: input.details?.slice(0, 240) || "Revisa la alerta en NexaLab.",
    channelId: "alerts",
    targetUrl: `/alerts?alertId=${input.alertId}`,
    data: { type: "alert", alertId: input.alertId, severity: input.severity },
  });
}
