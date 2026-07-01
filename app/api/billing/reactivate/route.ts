import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { canManageBilling } from "@/lib/billing-plans";
import {
  createRecurrenteCheckout,
  updateRecurrenteSubscription,
  getRecurrenteCustomerByEmail,
} from "@/lib/recurrente";
import { randomUUID } from "crypto";

type SubscriptionRow = {
  id: string;
  plan_id: string | null;
  plan_name: string | null;
  plan_amount_cents: number | null;
  plan_currency: string | null;
  plan_provider_price_id: string | null;
  status: string;
  provider_subscription_id: string | null;
  provider_customer_id: string | null;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  trial_ends_at: string | null;
  canceled_at: string | null;
  is_trial: boolean;
};

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
      { message: "La reactivación no está disponible en modo demo." },
      { status: 400 }
    );
  }

  const sql = getSql();

  const rows = (await sql`
    SELECT
      bs.id,
      bs.plan_id,
      bp.name               AS plan_name,
      bp.price_monthly_cents AS plan_amount_cents,
      bp.currency            AS plan_currency,
      bp.provider_price_id   AS plan_provider_price_id,
      bs.status,
      bs.provider_subscription_id,
      bs.provider_customer_id,
      bs.cancel_at_period_end,
      bs.current_period_end,
      bs.trial_ends_at,
      bs.canceled_at,
      bs.is_trial
    FROM billing_subscriptions bs
    LEFT JOIN billing_plans bp ON bp.id = bs.plan_id AND bp.is_active = true
    WHERE bs.organization_id = ${session.organizationId}
    ORDER BY bs.created_at DESC
    LIMIT 1
  `) as SubscriptionRow[];

  const sub = rows[0] ?? null;

  const successUrl =
    process.env.RECURRENTE_SUCCESS_URL ??
    `${request.headers.get("origin") ?? ""}/app/billing?checkout=success`;
  const cancelUrl =
    process.env.RECURRENTE_CANCEL_URL ??
    `${request.headers.get("origin") ?? ""}/app/billing?checkout=canceled`;

  // ── Scenario A-trial: trial_cancel_scheduled still within trial period ────────
  if (
    sub &&
    sub.status === "trial_cancel_scheduled" &&
    sub.trial_ends_at !== null &&
    new Date(sub.trial_ends_at) > new Date()
  ) {
    if (sub.provider_subscription_id) {
      try {
        await updateRecurrenteSubscription(sub.provider_subscription_id, {
          act: "reactivate",
        });
      } catch {
        // Non-fatal: update locally if Recurrente call fails
      }
    }

    await sql`
      UPDATE billing_subscriptions
      SET
        status               = 'trialing',
        cancel_at_period_end = false,
        canceled_at          = NULL,
        updated_at           = NOW()
      WHERE id = ${sub.id}
        AND organization_id  = ${session.organizationId}
    `;

    // Restore trial_usage status
    await sql`
      UPDATE billing_trial_usage
      SET canceled_at = NULL, status = 'active', updated_at = NOW()
      WHERE organization_id = ${session.organizationId}
        AND status = 'canceled'
    `;

    await writeAuditEvent(session, {
      action: "BILLING_SUBSCRIPTION_REACTIVATED",
      entityType: "billing_subscription",
      entityId: sub.id,
      newValue: { status: "trialing", cancel_at_period_end: false },
      reason: "Usuario reactivó prueba gratuita antes del fin del período.",
      request,
    });

    return NextResponse.json({
      data: {
        status: "trialing",
        message: "Prueba gratuita reactivada exitosamente.",
      },
    });
  }

  // ── Scenario A: cancel_scheduled within period (paid subscription) ────────────
  if (
    sub &&
    sub.status === "cancel_scheduled" &&
    sub.cancel_at_period_end === true &&
    sub.current_period_end !== null &&
    new Date(sub.current_period_end) > new Date()
  ) {
    if (sub.provider_subscription_id) {
      try {
        await updateRecurrenteSubscription(sub.provider_subscription_id, {
          act: "reactivate",
        });
      } catch {
        // Non-fatal
      }
    }

    await sql`
      UPDATE billing_subscriptions
      SET
        status               = 'active',
        cancel_at_period_end = false,
        canceled_at          = NULL,
        updated_at           = NOW()
      WHERE id = ${sub.id}
        AND organization_id  = ${session.organizationId}
    `;

    await writeAuditEvent(session, {
      action: "BILLING_SUBSCRIPTION_REACTIVATED",
      entityType: "billing_subscription",
      entityId: sub.id,
      newValue: { status: "active", cancel_at_period_end: false },
      reason: "Usuario reactivó suscripción antes del fin del periodo.",
      request,
    });

    return NextResponse.json({
      data: {
        status: "active",
        message: "Suscripción reactivada exitosamente.",
      },
    });
  }

  // ── Scenario C: payment_failed / past_due / first_payment_pending ─────────────
  if (
    sub &&
    (sub.status === "payment_failed" ||
      sub.status === "past_due" ||
      sub.status === "first_payment_pending")
  ) {
    const checkoutId = randomUUID();

    let customerId = sub.provider_customer_id ?? undefined;
    if (!customerId) {
      const customer = await getRecurrenteCustomerByEmail(session.email);
      if (customer) customerId = customer.id;
    }

    const checkout = await createRecurrenteCheckout({
      planSlug: "professional",
      planName: sub.plan_name ?? "Suscripción LISM",
      amountCents: sub.plan_amount_cents ?? 14900,
      currency: (sub.plan_currency as "USD" | "GTQ") ?? "USD",
      organizationId: session.organizationId,
      checkoutId,
      successUrl,
      cancelUrl,
      customerId,
      withTrial: false,
    });

    const checkoutPlanId = sub.plan_id ?? null;
    await sql`
      INSERT INTO billing_checkouts (
        id, organization_id, plan_id, purpose, status,
        provider_checkout_id, checkout_url,
        success_url, cancel_url, metadata, expires_at
      ) VALUES (
        ${checkoutId},
        ${session.organizationId},
        ${checkoutPlanId},
        'payment_method_update',
        'pending',
        ${checkout.id},
        ${checkout.checkout_url},
        ${successUrl},
        ${cancelUrl},
        ${JSON.stringify({ subscriptionId: sub.id })}::jsonb,
        NOW() + INTERVAL '2 hours'
      )
    `;

    await writeAuditEvent(session, {
      action: "BILLING_CHECKOUT_CREATED",
      entityType: "billing_checkout",
      entityId: checkoutId,
      newValue: { purpose: "payment_method_update", subscriptionId: sub.id },
      reason: "Pago fallido: usuario iniciando actualización de método de pago.",
      request,
    });

    return NextResponse.json({
      data: {
        requiresPaymentUpdate: true,
        checkoutUrl: checkout.checkout_url,
        message: "Actualiza tu método de pago para reactivar.",
      },
    });
  }

  // ── Scenario B: canceled / expired / trial_canceled → new PAID subscription ───
  // Note: trial is NOT offered again — billing_trial_usage prevents it.
  const checkoutId = randomUUID();

  let customerId = sub?.provider_customer_id ?? undefined;
  if (!customerId) {
    const customer = await getRecurrenteCustomerByEmail(session.email);
    if (customer) customerId = customer.id;
  }

  type PlanRow = {
    id: string;
    name: string;
    price_monthly_cents: number;
    currency: string;
    provider_price_id: string | null;
  };
  const planRows = (await sql`
    SELECT id, name, price_monthly_cents, currency, provider_price_id
    FROM billing_plans
    WHERE id = ${sub?.plan_id ?? null} AND is_active = true
    LIMIT 1
  `) as PlanRow[];

  const planMeta = planRows[0] ?? null;

  type FallbackRow = {
    id: string; name: string; price_monthly_cents: number;
    currency: string; provider_price_id: string | null;
  };
  const fallbackRows = planMeta
    ? []
    : (await sql`
        SELECT id, name, price_monthly_cents, currency, provider_price_id
        FROM billing_plans WHERE slug = 'professional' AND is_active = true LIMIT 1
      `) as FallbackRow[];

  const resolvedPlan = planMeta ?? fallbackRows[0] ?? null;
  const planName = resolvedPlan?.name ?? "Suscripción LISM";
  const amountCents = resolvedPlan?.price_monthly_cents ?? 14900;
  const currency = (resolvedPlan?.currency ?? "USD") as "USD" | "GTQ";
  const priceId = resolvedPlan?.provider_price_id ?? undefined;
  const resolvedPlanId = resolvedPlan?.id ?? null;

  const checkout = await createRecurrenteCheckout({
    planSlug: "professional",
    planName,
    amountCents,
    currency,
    organizationId: session.organizationId,
    checkoutId,
    successUrl,
    cancelUrl,
    customerId,
    priceId,
    withTrial: false,
  });

  await sql`
    INSERT INTO billing_checkouts (
      id, organization_id, plan_id, purpose, status,
      provider_checkout_id, checkout_url,
      success_url, cancel_url, metadata, expires_at
    ) VALUES (
      ${checkoutId},
      ${session.organizationId},
      ${resolvedPlanId},
      'resume_subscription',
      'pending',
      ${checkout.id},
      ${checkout.checkout_url},
      ${successUrl},
      ${cancelUrl},
      ${JSON.stringify({ previousSubscriptionId: sub?.id ?? null, isTrial: false })}::jsonb,
      NOW() + INTERVAL '2 hours'
    )
  `;

  await writeAuditEvent(session, {
    action: "BILLING_CHECKOUT_CREATED",
    entityType: "billing_checkout",
    entityId: checkoutId,
    newValue: {
      purpose: "resume_subscription",
      previousSubscriptionId: sub?.id ?? null,
      isTrial: false,
    },
    reason: "Usuario reiniciando suscripción cancelada o expirada (sin nuevo trial).",
    request,
  });

  return NextResponse.json({
    data: {
      requiresCheckout: true,
      checkoutUrl: checkout.checkout_url,
    },
  });
}
