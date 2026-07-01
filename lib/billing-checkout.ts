import { getSql } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { getRecurrentePlanPriceId } from "@/lib/billing-plans";
import { createRecurrenteCustomer, createRecurrenteCheckout, isRecurrenteConfigured } from "@/lib/recurrente";
import type { UserSession } from "@/lib/session";

export type CheckoutResult =
  | { ok: true; checkoutUrl: string; checkoutId: string; isTrial: boolean }
  | { ok: false; status: number; message: string };

/**
 * Lógica compartida para iniciar una suscripción/checkout de Recurrente para
 * una organización. Extraída tal cual de app/api/billing/subscribe/route.ts
 * (sin cambios de comportamiento) para poder reutilizarla también desde el
 * registro público de cuentas nuevas (app/api/auth/register/route.ts) —
 * ambos caminos terminan en exactamente la misma lógica de trial/checkout/
 * Recurrente, nunca se duplica ni se reimplementa.
 */
export async function createSubscriptionCheckout(
  session: UserSession,
  planId: string,
  request: Request,
): Promise<CheckoutResult> {
  if (!isRecurrenteConfigured()) {
    return { ok: false, status: 503, message: "El sistema de pagos no está configurado. Contacta al administrador." };
  }

  const sql = getSql();

  // ── Validate plan exists and is active ────────────────────────────────────────
  const planRows = await sql`
    SELECT id, slug, name, price_monthly_cents, currency, provider_price_id
    FROM billing_plans
    WHERE id = ${planId}
      AND is_active = true
    LIMIT 1
  `;

  if (planRows.length === 0) {
    return { ok: false, status: 404, message: "El plan seleccionado no existe o no está disponible." };
  }

  const plan = planRows[0];

  // ── Check no active subscription already exists ───────────────────────────────
  const existingRows = await sql`
    SELECT id, status
    FROM billing_subscriptions
    WHERE organization_id = ${session.organizationId}
      AND status IN (
        'active',
        'trialing',
        'trial_cancel_scheduled',
        'cancel_scheduled',
        'pending_activation',
        'checkout_pending',
        'pending_plan_change'
      )
      AND canceled_at IS NULL
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    return {
      ok: false,
      status: 409,
      message: "Ya existe una suscripción activa para esta organización. Cancela la suscripción actual antes de crear una nueva.",
    };
  }

  // ── Determine trial eligibility ───────────────────────────────────────────────
  // Policy: one free trial per organization, ever.
  // trialEligible = true only when billing_trial_usage has NO row for this org.
  // The trial_usage row is created by the webhook handler, not here, to avoid
  // recording usage for abandoned checkouts.
  const trialUsageRows = await sql`
    SELECT id
    FROM billing_trial_usage
    WHERE organization_id = ${session.organizationId}
    LIMIT 1
  `;

  const trialEligible = trialUsageRows.length === 0;

  // ── Determine redirect URLs ───────────────────────────────────────────────────
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    (() => {
      const host = request.headers.get("host") ?? "localhost:3000";
      const proto = request.headers.get("x-forwarded-proto") ?? "http";
      return `${proto}://${host}`;
    })();

  const successUrl = process.env.RECURRENTE_SUCCESS_URL ?? `${origin}/billing?checkout=success`;
  const cancelUrl = process.env.RECURRENTE_CANCEL_URL ?? `${origin}/billing?checkout=canceled`;

  // ── Get or create Recurrente customer ─────────────────────────────────────────
  let providerId: string | null = null;

  const existingCustomerRows = await sql`
    SELECT provider_customer_id
    FROM billing_subscriptions
    WHERE organization_id = ${session.organizationId}
      AND provider_customer_id IS NOT NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (existingCustomerRows.length > 0 && existingCustomerRows[0].provider_customer_id) {
    providerId = existingCustomerRows[0].provider_customer_id as string;
  } else {
    try {
      const customer = await createRecurrenteCustomer({ email: session.email, fullName: session.name });
      providerId = customer.id;
    } catch (err) {
      console.error("[billing-checkout] Failed to create Recurrente customer:", err);
    }
  }

  // ── Create local billing_checkouts record (status='pending') ─────────────────
  const checkoutInsertRows = await sql`
    INSERT INTO billing_checkouts (
      organization_id,
      initiated_by,
      plan_id,
      purpose,
      status,
      success_url,
      cancel_url,
      metadata
    ) VALUES (
      ${session.organizationId},
      ${session.userId},
      ${planId},
      'new_subscription',
      'pending',
      ${successUrl},
      ${cancelUrl},
      ${JSON.stringify({ initiatedByEmail: session.email, isTrial: trialEligible })}::jsonb
    )
    RETURNING id
  `;

  const checkoutId = checkoutInsertRows[0].id as string;

  // ── Call Recurrente to create the hosted checkout ─────────────────────────────
  let providerCheckoutId: string;
  let checkoutUrl: string;

  try {
    const priceId =
      (plan.provider_price_id as string | null) ??
      getRecurrentePlanPriceId(plan.slug as Parameters<typeof getRecurrentePlanPriceId>[0]);

    const recurrenteCheckout = await createRecurrenteCheckout({
      planSlug: plan.slug as string,
      planName: plan.name as string,
      amountCents: plan.price_monthly_cents as number,
      currency: (plan.currency as string).toUpperCase() as "USD" | "GTQ",
      organizationId: session.organizationId,
      checkoutId,
      successUrl,
      cancelUrl,
      ...(providerId ? { customerId: providerId } : {}),
      ...(priceId ? { priceId } : {}),
      withTrial: trialEligible,
    });

    providerCheckoutId = recurrenteCheckout.id;
    checkoutUrl = recurrenteCheckout.checkout_url;
  } catch (err) {
    await sql`
      UPDATE billing_checkouts
      SET status = 'cancelled', updated_at = now()
      WHERE id = ${checkoutId}
    `;

    console.error("[billing-checkout] Recurrente checkout creation failed:", err);
    const message = err instanceof Error ? err.message : "Error al crear el checkout de pago.";
    return { ok: false, status: 502, message };
  }

  // ── Update checkout record with provider data ─────────────────────────────────
  await sql`
    UPDATE billing_checkouts
    SET
      provider_checkout_id = ${providerCheckoutId},
      checkout_url         = ${checkoutUrl},
      updated_at           = now()
    WHERE id = ${checkoutId}
  `;

  // ── Upsert billing_subscriptions record with status='checkout_pending' ────────
  await sql`
    INSERT INTO billing_subscriptions (
      organization_id,
      plan_id,
      provider_customer_id,
      status,
      is_trial,
      metadata
    ) VALUES (
      ${session.organizationId},
      ${planId},
      ${providerId},
      'checkout_pending',
      ${trialEligible},
      ${JSON.stringify({ checkoutId, initiatedByUserId: session.userId, isTrial: trialEligible })}::jsonb
    )
    ON CONFLICT (organization_id)
    DO UPDATE SET
      plan_id              = EXCLUDED.plan_id,
      provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, billing_subscriptions.provider_customer_id),
      status               = 'checkout_pending',
      is_trial             = EXCLUDED.is_trial,
      metadata             = billing_subscriptions.metadata || EXCLUDED.metadata,
      updated_at           = now()
  `;

  // ── Audit event ───────────────────────────────────────────────────────────────
  await writeAuditEvent(session, {
    action: "BILLING_SUBSCRIBE_INITIATED",
    entityType: "billing_subscription",
    entityId: checkoutId,
    newValue: { planId, planSlug: plan.slug, checkoutId, providerCheckoutId, isTrial: trialEligible },
    reason: trialEligible ? "New trial subscription checkout initiated" : "New paid subscription checkout initiated",
    request,
  });

  return { ok: true, checkoutUrl, checkoutId, isTrial: trialEligible };
}
