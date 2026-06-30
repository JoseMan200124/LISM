import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { canManageBilling, isSubscriptionActive } from "@/lib/billing-plans";
import { createRecurrenteCheckout } from "@/lib/recurrente";

const ChangePlanSchema = z.object({
  planId: z.string().uuid({ message: "planId debe ser un UUID válido." }),
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

  if (!hasDatabase() || session.sessionMode === "demo") {
    return NextResponse.json(
      { message: "El cambio de plan no está disponible en modo demo." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Cuerpo de la solicitud inválido." },
      { status: 400 }
    );
  }

  const parsed = ChangePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        message: "Datos inválidos.",
        errors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  const { planId } = parsed.data;
  const sql = getSql();

  // Validate target plan (fix: use provider_price_id not recurrente_price_id)
  const planRows = await sql`
    SELECT
      id,
      slug,
      name,
      price_monthly_cents,
      currency,
      provider_price_id
    FROM billing_plans
    WHERE id = ${planId}
      AND is_active = true
    LIMIT 1
  `;

  if (planRows.length === 0) {
    return NextResponse.json(
      { message: "El plan seleccionado no existe o no está disponible." },
      { status: 404 }
    );
  }

  const newPlan = planRows[0];

  // Get current subscription (fix: use provider_customer_id not recurrente_customer_id)
  const subscriptionRows = await sql`
    SELECT
      bs.id,
      bs.status,
      bs.plan_id,
      bs.provider_subscription_id,
      bs.provider_customer_id,
      bs.pending_plan_id,
      bs.is_trial,
      bs.trial_ends_at,
      bp.price_monthly_cents AS current_price_monthly_cents,
      bp.slug AS current_plan_slug
    FROM billing_subscriptions bs
    JOIN billing_plans bp ON bp.id = bs.plan_id
    WHERE bs.organization_id = ${session.organizationId}
    ORDER BY bs.created_at DESC
    LIMIT 1
  `;

  if (subscriptionRows.length === 0) {
    return NextResponse.json(
      { message: "No se encontró una suscripción activa para esta organización." },
      { status: 404 }
    );
  }

  const subscription = subscriptionRows[0];
  const isTrialSub =
    subscription.is_trial === true ||
    subscription.status === "trialing" ||
    subscription.status === "trial_cancel_scheduled";

  if (!isSubscriptionActive(subscription.status)) {
    return NextResponse.json(
      {
        message:
          "No es posible cambiar el plan porque la suscripción actual no está activa.",
      },
      { status: 409 }
    );
  }

  if (subscription.plan_id === planId) {
    return NextResponse.json(
      { message: "Ya estás suscrito a este plan." },
      { status: 409 }
    );
  }

  const currentPriceCents = Number(subscription.current_price_monthly_cents);
  const newPriceCents = Number(newPlan.price_monthly_cents);
  const changeType: "upgrade" | "downgrade" =
    newPriceCents >= currentPriceCents ? "upgrade" : "downgrade";

  // Mark existing pending checkouts superseded
  await sql`
    UPDATE billing_checkouts
    SET status = 'superseded', updated_at = NOW()
    WHERE organization_id = ${session.organizationId}
      AND status = 'pending'
  `;

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    "https://app.lism.io";

  const successUrl = `${appBaseUrl}/app/billing?plan_change=success&plan=${newPlan.slug as string}`;
  const cancelUrl = `${appBaseUrl}/app/billing?plan_change=canceled`;

  // During trial: record pending plan without creating a new paid checkout.
  // The trial continues unchanged; the plan change is applied at first payment.
  if (isTrialSub) {
    await sql`
      UPDATE billing_subscriptions
      SET
        pending_plan_id     = ${planId},
        pending_change_type = ${changeType},
        updated_at          = NOW()
      WHERE id = ${subscription.id}
    `;

    await writeAuditEvent(session, {
      action: "BILLING_PLAN_CHANGE_INITIATED",
      entityType: "billing_subscription",
      entityId: subscription.id,
      previousValue: {
        planId: subscription.plan_id,
        planSlug: subscription.current_plan_slug,
        status: subscription.status,
      },
      newValue: {
        targetPlanId: planId,
        targetPlanSlug: newPlan.slug,
        changeType,
        duringTrial: true,
        trialEndsAt: subscription.trial_ends_at,
      },
      reason: `Cambio de plan durante prueba gratuita: ${subscription.current_plan_slug as string} → ${newPlan.slug as string}. Efectivo al finalizar trial.`,
      request,
    });

    return NextResponse.json({
      data: {
        isTrialPlanChange: true,
        changeType,
        message: `El plan cambiará a ${newPlan.name as string} al finalizar tu período de prueba.`,
        effectiveAt: subscription.trial_ends_at ?? null,
      },
    });
  }

  // Paid subscription: create checkout for plan change
  // (fix: removed non-existent current_subscription_id column)
  const internalCheckoutRows = await sql`
    INSERT INTO billing_checkouts (
      organization_id,
      initiated_by,
      plan_id,
      status,
      purpose,
      success_url,
      cancel_url,
      metadata,
      created_at,
      updated_at
    ) VALUES (
      ${session.organizationId},
      ${session.userId},
      ${planId},
      'pending',
      'plan_change',
      ${successUrl},
      ${cancelUrl},
      ${JSON.stringify({
        initiatedByUserId: session.userId,
        initiatedByRole: session.role,
        changeType,
        previousPlanId: subscription.plan_id,
        previousPlanSlug: subscription.current_plan_slug,
        currentSubscriptionId: subscription.id,
      })}::jsonb,
      NOW(),
      NOW()
    )
    RETURNING id
  `;

  const internalCheckoutId = internalCheckoutRows[0].id as string;

  let recurrenteCheckout: { id: string; checkout_url: string };
  try {
    recurrenteCheckout = await createRecurrenteCheckout({
      planSlug: newPlan.slug as string,
      planName: newPlan.name as string,
      amountCents: newPriceCents,
      currency: (newPlan.currency as "USD" | "GTQ") ?? "USD",
      organizationId: session.organizationId,
      checkoutId: internalCheckoutId,
      successUrl,
      cancelUrl,
      customerId: (subscription.provider_customer_id as string | null) ?? undefined,
      priceId: (newPlan.provider_price_id as string | null) ?? undefined,
      withTrial: false,
    });
  } catch (recurrenteError: unknown) {
    await sql`
      UPDATE billing_checkouts
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${internalCheckoutId}
    `;

    const errorMessage =
      recurrenteError instanceof Error
        ? recurrenteError.message
        : "Error desconocido al crear el checkout";

    console.error("[billing/change-plan] Recurrente checkout error:", errorMessage);

    return NextResponse.json(
      { message: "No se pudo crear el enlace de pago. Por favor intenta de nuevo." },
      { status: 502 }
    );
  }

  // Fix: use provider_checkout_id and checkout_url (not recurrente_checkout_id / recurrente_checkout_url)
  await sql`
    UPDATE billing_checkouts
    SET
      provider_checkout_id = ${recurrenteCheckout.id},
      checkout_url         = ${recurrenteCheckout.checkout_url},
      updated_at           = NOW()
    WHERE id = ${internalCheckoutId}
  `;

  await sql`
    UPDATE billing_subscriptions
    SET
      status              = 'pending_plan_change',
      pending_plan_id     = ${planId},
      pending_change_type = ${changeType},
      updated_at          = NOW()
    WHERE id = ${subscription.id}
  `;

  await writeAuditEvent(session, {
    action: "BILLING_PLAN_CHANGE_INITIATED",
    entityType: "billing_subscription",
    entityId: subscription.id,
    previousValue: {
      planId: subscription.plan_id,
      planSlug: subscription.current_plan_slug,
      status: subscription.status,
    },
    newValue: {
      targetPlanId: planId,
      targetPlanSlug: newPlan.slug,
      changeType,
      checkoutId: internalCheckoutId,
      providerCheckoutId: recurrenteCheckout.id,
    },
    reason: `Cambio de plan iniciado: ${subscription.current_plan_slug as string} → ${newPlan.slug as string} (${changeType})`,
    request,
  });

  return NextResponse.json({
    data: {
      checkoutUrl: recurrenteCheckout.checkout_url,
      checkoutId: internalCheckoutId,
      changeType,
    },
  });
}
