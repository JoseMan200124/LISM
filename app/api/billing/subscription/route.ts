import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ data: null, mode: "demo", trial_eligible: true });
  }

  const sql = getSql();

  const rows = await sql`
    SELECT
      bs.id,
      bs.status,
      bs.current_period_start,
      bs.current_period_end,
      bs.cancel_at_period_end,
      bs.canceled_at,
      bs.payment_method_masked,
      bs.payment_method_brand,
      bs.last_payment_at,
      bs.last_payment_status,
      bs.provider_subscription_id,
      bs.pending_plan_id,
      bs.pending_change_type,
      bs.trial_started_at,
      bs.trial_ends_at,
      bs.first_charge_at,
      bs.is_trial,
      bs.first_payment_status,
      bp.name          AS plan_name,
      bp.slug          AS plan_slug,
      bp.price_monthly_cents,
      bp.currency,
      bp.max_users,
      bp.max_labs,
      bp.features,
      pp.name          AS pending_plan_name
    FROM billing_subscriptions bs
    JOIN billing_plans bp ON bp.id = bs.plan_id
    LEFT JOIN billing_plans pp ON pp.id = bs.pending_plan_id
    WHERE bs.organization_id = ${session.organizationId}
    ORDER BY bs.created_at DESC
    LIMIT 1
  `;

  // Check trial eligibility
  type UsageRow = { id: string };
  const usageRows = (await sql`
    SELECT id FROM billing_trial_usage
    WHERE organization_id = ${session.organizationId}
    LIMIT 1
  `) as UsageRow[];

  const trialEligible = usageRows.length === 0;

  if (rows.length === 0) {
    return NextResponse.json({ data: null, mode: "database", trial_eligible: trialEligible });
  }

  const row = rows[0];

  const data = {
    id: row.id,
    status: row.status,
    current_period_start: row.current_period_start,
    current_period_end: row.current_period_end,
    cancel_at_period_end: row.cancel_at_period_end,
    canceled_at: row.canceled_at,
    payment_method_masked: row.payment_method_masked,
    payment_method_brand: row.payment_method_brand,
    last_payment_at: row.last_payment_at,
    last_payment_status: row.last_payment_status,
    provider_subscription_id: row.provider_subscription_id,
    pending_plan_id: row.pending_plan_id,
    pending_plan_name: row.pending_plan_name ?? null,
    pending_change_type: row.pending_change_type,
    trial_started_at: row.trial_started_at,
    trial_ends_at: row.trial_ends_at,
    first_charge_at: row.first_charge_at,
    is_trial: row.is_trial,
    first_payment_status: row.first_payment_status,
    plan: {
      name: row.plan_name,
      slug: row.plan_slug,
      price_monthly_cents: row.price_monthly_cents,
      currency: row.currency,
      max_users: row.max_users,
      max_labs: row.max_labs,
      features: row.features,
    },
  };

  return NextResponse.json({ data, mode: "database", trial_eligible: trialEligible });
}
