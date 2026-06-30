import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import {
  getRecurrenteSubscription,
  mapRecurrenteSubscriptionStatus,
} from "@/lib/recurrente";
import { canManageBilling, PLAN_SLUG_TO_PLAN_CODE, hasAccessToService } from "@/lib/billing-plans";
import type { BillingPlanSlug, BillingStatus } from "@/lib/billing-plans";

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
      { message: "No disponible en modo demo." },
      { status: 400 }
    );
  }

  const sql = getSql();

  const rows = await sql`
    SELECT
      bs.id,
      bs.status,
      bs.is_trial,
      bs.trial_ends_at,
      bs.first_charge_at,
      bs.provider_subscription_id,
      bs.provider_status,
      bs.last_payment_status,
      bs.payment_method_brand,
      bs.payment_method_masked,
      bs.current_period_end,
      bp.slug AS plan_slug
    FROM billing_subscriptions bs
    JOIN billing_plans bp ON bp.id = bs.plan_id
    WHERE bs.organization_id = ${session.organizationId}
    ORDER BY bs.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({
      data: { status: "inactive", message: "No hay suscripción registrada." },
    });
  }

  const sub = rows[0];

  if (!sub.provider_subscription_id) {
    return NextResponse.json({
      data: {
        status: sub.status,
        message: "La suscripción no tiene un ID de proveedor registrado.",
      },
    });
  }

  let recurrenteData;
  let notFound = false;
  try {
    recurrenteData = await getRecurrenteSubscription(
      sub.provider_subscription_id as string
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("404")) {
      notFound = true;
    } else {
      return NextResponse.json(
        { message: `Error al contactar con Recurrente: ${message}` },
        { status: 502 }
      );
    }
  }

  const syncedAt = new Date().toISOString();

  if (notFound) {
    await sql`
      UPDATE billing_subscriptions
      SET status = 'canceled', provider_status = 'not_found', updated_at = NOW()
      WHERE id = ${sub.id as string}
    `;

    await writeAuditEvent(session, {
      action: "BILLING_SUBSCRIPTION_SYNCED",
      entityType: "billing_subscription",
      entityId: sub.id as string,
      newValue: { status: "canceled", provider_status: "not_found" },
      reason: "Recurrente returned 404 — subscription marked as canceled",
      request,
    });

    return NextResponse.json({
      data: {
        status: "canceled",
        syncedAt,
        message: "La suscripción no fue encontrada en Recurrente y ha sido marcada como cancelada.",
      },
    });
  }

  const providerStatus = recurrenteData!.status ?? null;
  let mappedStatus = mapRecurrenteSubscriptionStatus(providerStatus);

  // Preserve local trialing status: Recurrente reports "active" during trial period
  // (it has no trialing status). Keep local trialing state until first payment arrives.
  const localStatus = sub.status as string;
  const isLocallyTrialing =
    localStatus === "trialing" ||
    localStatus === "trial_cancel_scheduled" ||
    localStatus === "first_payment_pending";

  if (isLocallyTrialing && mappedStatus === "active") {
    mappedStatus = localStatus as BillingStatus;
  }

  const trialEnd =
    (recurrenteData!.trial_end as string | null | undefined) ?? null;
  const firstBillingAt =
    (recurrenteData!.first_billing_at as string | null | undefined) ??
    (recurrenteData!.next_billing_at as string | null | undefined) ??
    null;

  const newCurrentPeriodEnd = isLocallyTrialing
    ? (sub.current_period_end as string | null)
    : recurrenteData!.next_billing_at
      ? new Date(recurrenteData!.next_billing_at as string)
      : recurrenteData!.current_period_end
        ? new Date(recurrenteData!.current_period_end as string)
        : null;

  const paymentMethodBrand =
    (recurrenteData!.payment_method_brand as string | null | undefined) ??
    (sub.payment_method_brand as string | null);
  const paymentMethodMasked =
    (recurrenteData!.payment_method_masked as string | null | undefined) ??
    (sub.payment_method_masked as string | null);
  const newLastPaymentStatus =
    (recurrenteData!.last_payment_status as string | null | undefined) ??
    (sub.last_payment_status as string | null);

  await sql`
    UPDATE billing_subscriptions
    SET
      provider_status       = ${providerStatus},
      status                = ${mappedStatus},
      current_period_end    = ${newCurrentPeriodEnd},
      trial_ends_at         = COALESCE(${trialEnd}::timestamptz, trial_ends_at),
      first_charge_at       = COALESCE(${firstBillingAt}::timestamptz, first_charge_at),
      payment_method_brand  = ${paymentMethodBrand ?? null},
      payment_method_masked = ${paymentMethodMasked ?? null},
      last_payment_status   = ${newLastPaymentStatus ?? null},
      updated_at            = NOW()
    WHERE id = ${sub.id as string}
  `;

  if (hasAccessToService(mappedStatus)) {
    const planSlug = sub.plan_slug as BillingPlanSlug;
    const planCode = PLAN_SLUG_TO_PLAN_CODE[planSlug] ?? null;
    if (planCode) {
      await sql`
        UPDATE organizations
        SET plan_code = ${planCode}, updated_at = NOW()
        WHERE id = ${session.organizationId}
      `;
    }
  }

  await writeAuditEvent(session, {
    action: "BILLING_SUBSCRIPTION_SYNCED",
    entityType: "billing_subscription",
    entityId: sub.id as string,
    newValue: {
      provider_status: providerStatus,
      status: mappedStatus,
      current_period_end: newCurrentPeriodEnd,
      payment_method_brand: paymentMethodBrand ?? null,
      payment_method_masked: paymentMethodMasked ?? null,
      last_payment_status: newLastPaymentStatus ?? null,
    },
    reason: "Manual sync with Recurrente",
    request,
  });

  return NextResponse.json({
    data: { status: mappedStatus, syncedAt, message: "Suscripción sincronizada correctamente." },
  });
}
