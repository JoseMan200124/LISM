import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";
import { writeAuditEvent } from "@/lib/audit";
import { canManageBilling } from "@/lib/billing-plans";
import { createRecurrenteCheckout } from "@/lib/recurrente";

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
      { message: "Esta acción no está disponible en modo demo." },
      { status: 400 }
    );
  }

  const sql = getSql();

  // Fetch current subscription with plan details
  const rows = await sql`
    SELECT
      bs.id,
      bs.status,
      bs.provider_subscription_id,
      bs.recurrente_customer_id,
      bp.slug          AS plan_slug,
      bp.name          AS plan_name,
      bp.price_monthly_cents,
      bp.currency,
      bp.recurrente_price_id
    FROM billing_subscriptions bs
    JOIN billing_plans bp ON bp.id = bs.plan_id
    WHERE bs.organization_id = ${session.organizationId}
    ORDER BY bs.created_at DESC
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json(
      { message: "No se encontró una suscripción activa." },
      { status: 404 }
    );
  }

  const sub = rows[0];

  // Must have a non-inactive subscription
  if (sub.status === "inactive" || sub.status === "canceled" || sub.status === "expired") {
    return NextResponse.json(
      { message: "No tienes una suscripción activa para actualizar el método de pago." },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  const successUrl = `${baseUrl}/dashboard/billing?payment_method_updated=true`;
  const cancelUrl = `${baseUrl}/dashboard/billing?payment_method_update_canceled=true`;

  // Create a billing_checkouts record for this payment method update
  const checkoutRows = await sql`
    INSERT INTO billing_checkouts (
      organization_id,
      plan_slug,
      status,
      purpose,
      success_url,
      cancel_url,
      metadata,
      expires_at
    ) VALUES (
      ${session.organizationId},
      ${sub.plan_slug},
      'pending',
      'payment_method_update',
      ${successUrl},
      ${cancelUrl},
      ${JSON.stringify({
        subscriptionId: sub.id,
        providerSubscriptionId: sub.provider_subscription_id ?? null,
        purpose: "payment_method_update",
      })}::jsonb,
      NOW() + INTERVAL '2 hours'
    )
    RETURNING id
  `;

  const checkoutId = checkoutRows[0].id as string;

  // Create a checkout on Recurrente to tokenize the new card
  let recurrenteCheckout;
  try {
    recurrenteCheckout = await createRecurrenteCheckout({
      planSlug: sub.plan_slug,
      planName: sub.plan_name,
      amountCents: sub.price_monthly_cents as number,
      currency: (sub.currency as "USD" | "GTQ") ?? "USD",
      organizationId: session.organizationId,
      checkoutId,
      successUrl,
      cancelUrl,
      customerId: sub.recurrente_customer_id ?? undefined,
      priceId: sub.recurrente_price_id ?? undefined,
    });
  } catch (err) {
    // Clean up the checkout record if Recurrente call fails
    await sql`
      UPDATE billing_checkouts
      SET status = 'expired', updated_at = NOW()
      WHERE id = ${checkoutId}
    `;
    const message =
      err instanceof Error ? err.message : "Error al crear el checkout con Recurrente.";
    return NextResponse.json({ message }, { status: 502 });
  }

  // Store Recurrente checkout details and mark metadata with purpose
  await sql`
    UPDATE billing_checkouts
    SET
      recurrente_checkout_id  = ${recurrenteCheckout.id},
      recurrente_checkout_url = ${recurrenteCheckout.checkout_url},
      metadata = ${JSON.stringify({
        subscriptionId: sub.id,
        providerSubscriptionId: sub.provider_subscription_id ?? null,
        recurrenteCheckoutId: recurrenteCheckout.id,
        purpose: "payment_method_update",
      })}::jsonb,
      updated_at = NOW()
    WHERE id = ${checkoutId}
  `;

  // Update subscription status to payment_method_update_pending
  await sql`
    UPDATE billing_subscriptions
    SET
      status     = 'payment_method_update_pending',
      updated_at = NOW()
    WHERE id = ${sub.id}
      AND organization_id = ${session.organizationId}
  `;

  await writeAuditEvent(session, {
    action: "BILLING_PAYMENT_METHOD_UPDATE_INITIATED",
    entityType: "billing_subscription",
    entityId: sub.id as string,
    newValue: {
      checkoutId,
      recurrenteCheckoutId: recurrenteCheckout.id,
      purpose: "payment_method_update",
      previousStatus: sub.status,
      newStatus: "payment_method_update_pending",
    },
    reason: "Usuario inició actualización de método de pago.",
    request,
  });

  return NextResponse.json({
    data: { checkoutUrl: recurrenteCheckout.checkout_url },
  });
}
