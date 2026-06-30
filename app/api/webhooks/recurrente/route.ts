import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { verifyRecurrenteWebhookSignature } from "@/lib/recurrente";

export const runtime = "nodejs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WebhookPayloadData {
  subscription_id?: string | null;
  id?: string | null;
  metadata?: {
    organizationId?: string | null;
    planSlug?: string | null;
    internalCheckoutId?: string | null;
    isTrial?: boolean | null;
    [key: string]: unknown;
  };
  status?: string | null;
  next_billing_at?: string | null;
  first_billing_at?: string | null;
  trial_start?: string | null;
  trial_end?: string | null;
  payment_method_id?: string | null;
  amount_in_cents?: number | null;
  currency?: string | null;
  [key: string]: unknown;
}

interface WebhookPayload {
  id?: string;
  type: string;
  data?: WebhookPayloadData;
  [key: string]: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.replace(/([A-Za-z0-9+/]{20,}={0,2})/g, "[REDACTED]");
  }
  return "Unknown error";
}

function isTrialingData(data: WebhookPayloadData): boolean {
  return (
    data.status === "trialing" ||
    data.status === "in_trial" ||
    data.trial_end != null ||
    data.trial_start != null
  );
}

// ─── Event processors ────────────────────────────────────────────────────────

async function handlePaymentSucceeded(
  data: WebhookPayloadData,
  payload: WebhookPayload
): Promise<void> {
  const sql = getSql();

  const subscriptionId = data.subscription_id ?? null;
  const organizationId = data.metadata?.organizationId ?? null;
  const planSlug = data.metadata?.planSlug ?? null;
  const internalCheckoutId = data.metadata?.internalCheckoutId ?? null;
  const isTrial =
    data.metadata?.isTrial === true || isTrialingData(data);

  if (!organizationId) return;

  // Mark checkout completed
  if (internalCheckoutId) {
    await sql`
      UPDATE billing_checkouts
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE provider_checkout_id = ${internalCheckoutId}
        AND status != 'completed'
    `;
  }

  await sql`
    UPDATE billing_checkouts
    SET status = 'completed', completed_at = NOW(), updated_at = NOW()
    WHERE organization_id = ${organizationId}
      AND status = 'pending'
      AND (${internalCheckoutId}::text IS NULL OR provider_checkout_id != ${internalCheckoutId})
  `;

  if (isTrial) {
    // Trial activation: no payment occurs yet, just set trialing status
    const trialStart = data.trial_start ?? null;
    const trialEnd = data.trial_end ?? data.next_billing_at ?? data.first_billing_at ?? null;
    const firstChargeAt = trialEnd;

    await sql`
      UPDATE billing_subscriptions
      SET
        status               = 'trialing',
        provider_subscription_id = COALESCE(${subscriptionId}, provider_subscription_id),
        provider_status      = 'trialing',
        trial_started_at     = COALESCE(${trialStart}::timestamptz, NOW()),
        trial_ends_at        = ${trialEnd}::timestamptz,
        first_charge_at      = ${firstChargeAt}::timestamptz,
        current_period_start = NOW(),
        is_trial             = true,
        pending_plan_id      = NULL,
        pending_change_type  = NULL,
        updated_at           = NOW()
      WHERE organization_id = ${organizationId}
        AND status IN ('checkout_pending', 'pending_activation', 'trialing')
    `;

    // Record trial usage — UNIQUE(organization_id) prevents duplicates
    await sql`
      INSERT INTO billing_trial_usage (
        organization_id,
        first_plan_id,
        provider_customer_id,
        provider_subscription_id,
        trial_started_at,
        trial_ends_at,
        status
      )
      SELECT
        bs.organization_id,
        bs.plan_id,
        bs.provider_customer_id,
        ${subscriptionId},
        COALESCE(${trialStart}::timestamptz, NOW()),
        ${trialEnd}::timestamptz,
        'active'
      FROM billing_subscriptions bs
      WHERE bs.organization_id = ${organizationId}
      LIMIT 1
      ON CONFLICT (organization_id) DO NOTHING
    `;
  } else {
    // Regular payment or first-charge-after-trial
    type SubRow = { status: string; is_trial: boolean };
    const subRows = (await sql`
      SELECT status, is_trial FROM billing_subscriptions
      WHERE organization_id = ${organizationId}
      ORDER BY created_at DESC LIMIT 1
    `) as SubRow[];

    const wasTrialing =
      subRows.length > 0 &&
      (subRows[0].status === "trialing" ||
        subRows[0].status === "trial_cancel_scheduled" ||
        subRows[0].status === "first_payment_pending" ||
        subRows[0].is_trial === true);

    await sql`
      UPDATE billing_subscriptions
      SET
        status               = 'active',
        provider_subscription_id = COALESCE(${subscriptionId}, provider_subscription_id),
        provider_status      = 'active',
        current_period_start = NOW(),
        last_payment_at      = NOW(),
        last_payment_status  = 'succeeded',
        first_payment_status = CASE WHEN is_trial AND first_payment_status IS NULL THEN 'succeeded' ELSE first_payment_status END,
        pending_plan_id      = NULL,
        pending_change_type  = NULL,
        updated_at           = NOW()
      WHERE organization_id = ${organizationId}
        AND status IN (
          'checkout_pending', 'pending_activation', 'active', 'pending_plan_change',
          'trialing', 'trial_cancel_scheduled', 'first_payment_pending'
        )
    `;

    if (wasTrialing) {
      await sql`
        UPDATE billing_trial_usage
        SET completed_at = NOW(), status = 'completed', updated_at = NOW()
        WHERE organization_id = ${organizationId}
          AND status = 'active'
      `;
    }

    const amountCents =
      typeof data.amount_in_cents === "number" ? data.amount_in_cents : 0;
    const currency =
      typeof data.currency === "string" ? data.currency : "USD";
    const paymentProviderId =
      typeof data.id === "string" ? data.id : null;

    if (paymentProviderId) {
      await sql`
        INSERT INTO billing_payments (
          organization_id,
          provider_payment_intent_id,
          provider_subscription_id,
          amount_cents,
          currency,
          status,
          paid_at
        )
        VALUES (
          ${organizationId},
          ${paymentProviderId},
          ${subscriptionId},
          ${amountCents},
          ${currency},
          'succeeded',
          NOW()
        )
      `;
    }
  }

  if (planSlug) {
    const planCode = planSlug.toUpperCase();
    await sql`
      UPDATE organizations
      SET plan_code = ${planCode}, updated_at = NOW()
      WHERE id = ${organizationId}
    `;
  }
}

async function handleSetupIntentSucceeded(
  data: WebhookPayloadData
): Promise<void> {
  // setup_intent.succeeded fires when a trial subscription is created:
  // the card is tokenized but NOT charged. This activates the trial locally.
  const sql = getSql();

  const subscriptionId = data.subscription_id ?? null;
  const organizationId = data.metadata?.organizationId ?? null;
  const planSlug = data.metadata?.planSlug ?? null;
  const internalCheckoutId = data.metadata?.internalCheckoutId ?? null;

  if (!organizationId) return;

  // Mark checkout completed
  if (internalCheckoutId) {
    await sql`
      UPDATE billing_checkouts
      SET status = 'completed', completed_at = NOW(), updated_at = NOW()
      WHERE provider_checkout_id = ${internalCheckoutId}
        AND status != 'completed'
    `;
  }

  // Derive trial end: next_billing_at is when the first charge occurs
  const trialStart = data.trial_start ?? null;
  const trialEnd = data.trial_end ?? data.next_billing_at ?? data.first_billing_at ?? null;
  const firstChargeAt = trialEnd;

  await sql`
    UPDATE billing_subscriptions
    SET
      status               = 'trialing',
      provider_subscription_id = COALESCE(${subscriptionId}, provider_subscription_id),
      provider_status      = 'active',
      trial_started_at     = COALESCE(${trialStart}::timestamptz, NOW()),
      trial_ends_at        = ${trialEnd}::timestamptz,
      first_charge_at      = ${firstChargeAt}::timestamptz,
      current_period_start = NOW(),
      is_trial             = true,
      pending_plan_id      = NULL,
      pending_change_type  = NULL,
      updated_at           = NOW()
    WHERE organization_id = ${organizationId}
      AND status IN ('checkout_pending', 'pending_activation', 'trialing')
  `;

  // Record trial usage — UNIQUE(organization_id) prevents duplicates
  await sql`
    INSERT INTO billing_trial_usage (
      organization_id,
      first_plan_id,
      provider_customer_id,
      provider_subscription_id,
      trial_started_at,
      trial_ends_at,
      status
    )
    SELECT
      bs.organization_id,
      bs.plan_id,
      bs.provider_customer_id,
      ${subscriptionId},
      COALESCE(${trialStart}::timestamptz, NOW()),
      ${trialEnd}::timestamptz,
      'active'
    FROM billing_subscriptions bs
    WHERE bs.organization_id = ${organizationId}
    LIMIT 1
    ON CONFLICT (organization_id) DO NOTHING
  `;

  // Grant plan access immediately
  if (planSlug) {
    const planCode = (planSlug as string).toUpperCase();
    await sql`
      UPDATE organizations
      SET plan_code = ${planCode}, updated_at = NOW()
      WHERE id = ${organizationId}
    `;
  }
}

async function handleSetupIntentCancelled(
  data: WebhookPayloadData
): Promise<void> {
  // setup_intent.cancelled fires when card tokenization fails during trial setup.
  // The trial did NOT start — revert to checkout_pending so user can retry.
  const sql = getSql();

  const organizationId = data.metadata?.organizationId ?? null;
  if (!organizationId) return;

  await sql`
    UPDATE billing_subscriptions
    SET
      status = 'checkout_pending',
      updated_at = NOW()
    WHERE organization_id = ${organizationId}
      AND status IN ('pending_activation', 'checkout_pending')
  `;
}

async function handleSubscriptionCreated(
  data: WebhookPayloadData,
  payload: WebhookPayload
): Promise<void> {
  // subscription.created for a non-trial subscription activates it immediately
  await handlePaymentSucceeded(data, payload);
}

async function handleSubscriptionCancelled(
  data: WebhookPayloadData
): Promise<void> {
  const sql = getSql();

  const subscriptionId =
    data.subscription_id ?? (typeof data.id === "string" ? data.id : null);
  const organizationId = data.metadata?.organizationId ?? null;

  if (!subscriptionId && !organizationId) return;

  let orgId: string | null = organizationId;

  if (subscriptionId) {
    type SubRow = { organization_id: string; status: string; is_trial: boolean };
    const rows = (await sql`
      SELECT organization_id, status, is_trial
      FROM billing_subscriptions
      WHERE provider_subscription_id = ${subscriptionId}
      LIMIT 1
    `) as SubRow[];

    if (rows.length > 0) {
      orgId = rows[0].organization_id;
      const wasTrialing =
        rows[0].status === "trialing" ||
        rows[0].status === "trial_cancel_scheduled" ||
        rows[0].is_trial === true;

      const newStatus = wasTrialing ? "trial_canceled" : "canceled";

      await sql`
        UPDATE billing_subscriptions
        SET
          status = ${newStatus},
          canceled_at = NOW(),
          updated_at = NOW()
        WHERE provider_subscription_id = ${subscriptionId}
      `;

      if (wasTrialing) {
        await sql`
          UPDATE billing_trial_usage
          SET canceled_at = NOW(), status = 'canceled', updated_at = NOW()
          WHERE organization_id = ${rows[0].organization_id}
            AND status = 'active'
        `;
      }
    }
  } else if (organizationId) {
    type StatusRow = { status: string; is_trial: boolean };
    const currentRows = (await sql`
      SELECT status, is_trial FROM billing_subscriptions
      WHERE organization_id = ${organizationId}
        AND status IN ('active', 'trialing', 'trial_cancel_scheduled', 'cancel_scheduled',
                       'past_due', 'payment_failed')
      LIMIT 1
    `) as StatusRow[];

    const wasTrialing =
      currentRows.length > 0 &&
      (currentRows[0].status === "trialing" ||
        currentRows[0].status === "trial_cancel_scheduled" ||
        currentRows[0].is_trial === true);

    const newStatus = wasTrialing ? "trial_canceled" : "canceled";

    await sql`
      UPDATE billing_subscriptions
      SET
        status = ${newStatus},
        canceled_at = NOW(),
        updated_at = NOW()
      WHERE organization_id = ${organizationId}
        AND status IN ('active', 'trialing', 'trial_cancel_scheduled', 'cancel_scheduled',
                       'past_due', 'payment_failed')
    `;

    if (wasTrialing) {
      await sql`
        UPDATE billing_trial_usage
        SET canceled_at = NOW(), status = 'canceled', updated_at = NOW()
        WHERE organization_id = ${organizationId}
          AND status = 'active'
      `;
    }
  }

  if (orgId) {
    await sql`
      UPDATE organizations
      SET plan_code = 'STARTER', updated_at = NOW()
      WHERE id = ${orgId}
    `;
  }
}

async function handleSubscriptionUpdated(
  data: WebhookPayloadData
): Promise<void> {
  const sql = getSql();

  const subscriptionId =
    data.subscription_id ?? (typeof data.id === "string" ? data.id : null);
  if (!subscriptionId) return;

  const nextBillingAt = data.next_billing_at ?? null;
  const providerStatus = data.status ?? null;
  const trialEnd = data.trial_end ?? null;

  // Check current local status to avoid overwriting trialing with active prematurely
  type SubRow = { status: string };
  const rows = (await sql`
    SELECT status FROM billing_subscriptions
    WHERE provider_subscription_id = ${subscriptionId}
    LIMIT 1
  `) as SubRow[];

  const currentStatus = rows[0]?.status ?? null;
  const isCurrentlyTrialing =
    currentStatus === "trialing" || currentStatus === "trial_cancel_scheduled";

  // If Recurrente reports active but we're trialing locally, keep trialing
  // (active only comes after first payment webhook)
  const effectiveStatus: string | null =
    providerStatus === "active" && isCurrentlyTrialing
      ? currentStatus
      : providerStatus === "trialing" || providerStatus === "in_trial"
        ? "trialing"
        : providerStatus;

  await sql`
    UPDATE billing_subscriptions
    SET
      provider_status = COALESCE(${providerStatus}, provider_status),
      status = CASE
        WHEN ${effectiveStatus}::text IS NOT NULL THEN ${effectiveStatus}
        ELSE status
      END,
      trial_ends_at = COALESCE(${trialEnd}::timestamptz, trial_ends_at),
      next_payment_attempt_at = COALESCE(${nextBillingAt}::timestamptz, next_payment_attempt_at),
      updated_at = NOW()
    WHERE provider_subscription_id = ${subscriptionId}
  `;
}

async function handlePaymentFailed(
  data: WebhookPayloadData
): Promise<void> {
  const sql = getSql();

  const subscriptionId = data.subscription_id ?? null;
  const organizationId = data.metadata?.organizationId ?? null;
  const amountCents =
    typeof data.amount_in_cents === "number" ? data.amount_in_cents : 0;
  const currency =
    typeof data.currency === "string" ? data.currency : "USD";
  const paymentProviderId =
    typeof data.id === "string" ? data.id : null;

  type SubRow = { organization_id: string; is_trial: boolean; status: string };
  let subRow: SubRow | null = null;

  if (subscriptionId) {
    const rows = (await sql`
      SELECT organization_id, is_trial, status FROM billing_subscriptions
      WHERE provider_subscription_id = ${subscriptionId}
      LIMIT 1
    `) as SubRow[];
    subRow = rows[0] ?? null;
  } else if (organizationId) {
    const rows = (await sql`
      SELECT organization_id, is_trial, status FROM billing_subscriptions
      WHERE organization_id = ${organizationId}
        AND status IN ('active', 'trialing', 'first_payment_pending', 'past_due')
      LIMIT 1
    `) as SubRow[];
    subRow = rows[0] ?? null;
  }

  // Trial first-charge failure → first_payment_pending; regular → payment_failed
  const newStatus =
    subRow?.is_trial === true &&
    (subRow.status === "trialing" || subRow.status === "first_payment_pending")
      ? "first_payment_pending"
      : "payment_failed";

  if (subscriptionId) {
    await sql`
      UPDATE billing_subscriptions
      SET
        status = ${newStatus},
        last_payment_status = 'failed',
        first_payment_status = CASE
          WHEN is_trial AND first_payment_status IS NULL THEN 'failed'
          ELSE first_payment_status
        END,
        updated_at = NOW()
      WHERE provider_subscription_id = ${subscriptionId}
    `;
  } else if (organizationId) {
    await sql`
      UPDATE billing_subscriptions
      SET
        status = ${newStatus},
        last_payment_status = 'failed',
        first_payment_status = CASE
          WHEN is_trial AND first_payment_status IS NULL THEN 'failed'
          ELSE first_payment_status
        END,
        updated_at = NOW()
      WHERE organization_id = ${organizationId}
        AND status IN ('active', 'trialing', 'first_payment_pending', 'past_due')
    `;
  }

  const orgId = subRow?.organization_id ?? organizationId ?? null;

  if (paymentProviderId && orgId) {
    await sql`
      INSERT INTO billing_payments (
        organization_id,
        provider_payment_intent_id,
        provider_subscription_id,
        amount_cents,
        currency,
        status
      )
      VALUES (
        ${orgId},
        ${paymentProviderId},
        ${subscriptionId},
        ${amountCents},
        ${currency},
        'failed'
      )
    `;
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  const signatureValid = verifyRecurrenteWebhookSignature(rawBody, {
    svixId,
    svixTimestamp,
    svixSignature,
  });

  if (!signatureValid) {
    console.warn("[webhook/recurrente] Invalid or missing Svix signature");
    return NextResponse.json(
      { ok: false, message: "Invalid signature" },
      { status: 400 }
    );
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody) as WebhookPayload;
  } catch {
    console.warn("[webhook/recurrente] Failed to parse JSON body");
    return NextResponse.json(
      { ok: false, message: "Invalid JSON" },
      { status: 400 }
    );
  }

  const eventType = payload.type;
  const providerEventId = svixId ?? payload.id ?? null;

  const sql = getSql();

  // ── Deduplication ──────────────────────────────────────────────────────────
  if (providerEventId) {
    type EventRow = { processing_status: string };
    const existing = (await sql`
      SELECT processing_status
      FROM billing_events
      WHERE provider_event_id = ${providerEventId}
      LIMIT 1
    `) as EventRow[];

    if (existing.length > 0 && existing[0].processing_status === "processed") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  // ── Insert or upsert billing_events record ─────────────────────────────────
  let billingEventId: string | null = null;
  if (providerEventId) {
    try {
      type InsertedRow = { id: string };
      const inserted = (await sql`
        INSERT INTO billing_events (
          provider_event_id,
          event_type,
          raw_payload,
          signature_verified,
          processing_status,
          attempts
        )
        VALUES (
          ${providerEventId},
          ${eventType},
          ${JSON.stringify(payload)}::jsonb,
          true,
          'processing',
          1
        )
        ON CONFLICT (provider_event_id) DO UPDATE
          SET
            attempts = billing_events.attempts + 1,
            processing_status = 'processing',
            updated_at = NOW()
        RETURNING id
      `) as InsertedRow[];
      billingEventId = inserted[0]?.id ?? null;
    } catch (insertErr) {
      console.warn(
        "[webhook/recurrente] Failed to insert billing_event:",
        sanitizeError(insertErr)
      );
    }
  }

  // ── Process event ─────────────────────────────────────────────────────────
  const data = (payload.data ?? {}) as WebhookPayloadData;

  try {
    switch (eventType) {
      // Trial start: card tokenized, no charge yet
      case "setup_intent.succeeded":
        await handleSetupIntentSucceeded(data);
        break;

      // Trial setup failed: card tokenization failed
      case "setup_intent.cancelled":
      case "setup_intent.canceled":
        await handleSetupIntentCancelled(data);
        break;

      case "payment_intent.succeeded":
      case "payment.completed":
        await handlePaymentSucceeded(data, payload);
        break;

      case "subscription.created":
        await handleSubscriptionCreated(data, payload);
        break;

      case "subscription.cancelled":
      case "subscription.canceled":
        await handleSubscriptionCancelled(data);
        break;

      case "subscription.updated":
        await handleSubscriptionUpdated(data);
        break;

      case "payment.failed":
      case "payment_intent.payment_failed":
        await handlePaymentFailed(data);
        break;

      default:
        console.warn(`[webhook/recurrente] Unhandled event type: ${eventType}`);
        break;
    }

    if (billingEventId) {
      await sql`
        UPDATE billing_events
        SET processing_status = 'processed', processed_at = NOW(), updated_at = NOW()
        WHERE id = ${billingEventId}
      `;
    } else if (providerEventId) {
      await sql`
        UPDATE billing_events
        SET processing_status = 'processed', processed_at = NOW(), updated_at = NOW()
        WHERE provider_event_id = ${providerEventId}
      `;
    }
  } catch (processingErr) {
    const safeMsg = sanitizeError(processingErr);
    console.error(
      `[webhook/recurrente] Processing error for event ${eventType}:`,
      safeMsg
    );

    try {
      if (billingEventId) {
        await sql`
          UPDATE billing_events
          SET
            processing_status = 'failed',
            error_message = ${safeMsg},
            updated_at = NOW()
          WHERE id = ${billingEventId}
        `;
      } else if (providerEventId) {
        await sql`
          UPDATE billing_events
          SET
            processing_status = 'failed',
            error_message = ${safeMsg},
            updated_at = NOW()
          WHERE provider_event_id = ${providerEventId}
        `;
      }
    } catch {
      // Best-effort error recording
    }
  }

  return NextResponse.json({ ok: true });
}
