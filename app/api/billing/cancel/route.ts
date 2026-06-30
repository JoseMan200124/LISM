import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { canManageBilling } from "@/lib/billing-plans";
import { cancelRecurrenteSubscription } from "@/lib/recurrente";

const cancelSchema = z.object({
  immediate: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!canManageBilling(session.role)) {
    return NextResponse.json(
      { message: "No tienes permisos para gestionar la facturación." },
      { status: 403 }
    );
  }

  if (!hasDatabase()) {
    return NextResponse.json(
      { message: "La cancelación no está disponible en modo demo." },
      { status: 400 }
    );
  }

  let body: { immediate: boolean };
  try {
    const raw = request.headers.get("content-length") === "0"
      ? {}
      : await request.json().catch(() => ({}));
    body = cancelSchema.parse(raw);
  } catch {
    return NextResponse.json(
      { message: "Datos de solicitud inválidos." },
      { status: 400 }
    );
  }

  const { immediate } = body;
  const sql = getSql();

  type SubRow = {
    id: string;
    status: string;
    provider_subscription_id: string | null;
    current_period_end: string | null;
    trial_ends_at: string | null;
    cancel_at_period_end: boolean;
    is_trial: boolean;
  };
  const rows = (await sql`
    SELECT
      id,
      status,
      provider_subscription_id,
      current_period_end,
      trial_ends_at,
      cancel_at_period_end,
      is_trial
    FROM billing_subscriptions
    WHERE organization_id = ${session.organizationId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as SubRow[];

  if (rows.length === 0) {
    return NextResponse.json(
      { message: "No se encontró una suscripción activa para esta organización." },
      { status: 404 }
    );
  }

  const subscription = rows[0];
  const isTrialSub = subscription.is_trial === true ||
    subscription.status === "trialing" ||
    subscription.status === "trial_cancel_scheduled";

  const cancelableStatuses = [
    "active",
    "cancel_scheduled",
    "past_due",
    "payment_failed",
    "trialing",
    "trial_cancel_scheduled",
    "first_payment_pending",
  ];

  if (!cancelableStatuses.includes(subscription.status)) {
    return NextResponse.json(
      {
        message: `La suscripción no puede cancelarse en su estado actual: ${subscription.status}.`,
      },
      { status: 400 }
    );
  }

  if (
    (subscription.status === "cancel_scheduled" || subscription.status === "trial_cancel_scheduled") &&
    !immediate
  ) {
    const accessUntil = isTrialSub
      ? subscription.trial_ends_at
      : subscription.current_period_end;
    return NextResponse.json({
      data: {
        status: subscription.status,
        message: "La cancelación ya está programada. El acceso continuará hasta el final del período.",
        accessUntil: accessUntil ?? null,
      },
    });
  }

  if (subscription.provider_subscription_id) {
    try {
      await cancelRecurrenteSubscription(subscription.provider_subscription_id);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Error desconocido al cancelar en Recurrente.";
      return NextResponse.json(
        { message: `Error al cancelar en el proveedor de pagos: ${message}` },
        { status: 502 }
      );
    }
  }

  const now = new Date();

  const accessEnd = isTrialSub
    ? subscription.trial_ends_at
      ? new Date(subscription.trial_ends_at)
      : null
    : subscription.current_period_end
      ? new Date(subscription.current_period_end)
      : null;

  let newStatus: string;
  if (isTrialSub) {
    newStatus = immediate || !accessEnd || accessEnd <= now
      ? "trial_canceled"
      : "trial_cancel_scheduled";
  } else {
    newStatus = immediate || !accessEnd || accessEnd <= now
      ? "canceled"
      : "cancel_scheduled";
  }

  await sql`
    UPDATE billing_subscriptions
    SET
      status               = ${newStatus},
      cancel_at_period_end = true,
      canceled_at          = ${now.toISOString()},
      updated_at           = ${now.toISOString()}
    WHERE id = ${subscription.id}
  `;

  await writeAuditEvent(session, {
    action: "BILLING_SUBSCRIPTION_CANCELED",
    entityType: "billing_subscription",
    entityId: subscription.id,
    newValue: {
      status: newStatus,
      cancel_at_period_end: true,
      canceled_at: now.toISOString(),
      immediate,
      is_trial: isTrialSub,
    },
    reason: immediate
      ? "Cancelación inmediata solicitada por el usuario."
      : "Cancelación al final del período solicitada por el usuario.",
    request,
  });

  const accessUntil =
    newStatus === "cancel_scheduled" || newStatus === "trial_cancel_scheduled"
      ? accessEnd?.toISOString() ?? null
      : null;

  const message = isTrialSub
    ? newStatus === "trial_canceled"
      ? "La prueba gratuita ha sido cancelada inmediatamente."
      : "La prueba gratuita se cancelará al final del período de prueba. No se realizará el primer cobro."
    : newStatus === "canceled"
      ? "La suscripción ha sido cancelada inmediatamente."
      : "La suscripción se cancelará al final del período actual.";

  return NextResponse.json({
    data: {
      status: newStatus,
      message,
      accessUntil,
      isTrial: isTrialSub,
    },
  });
}
