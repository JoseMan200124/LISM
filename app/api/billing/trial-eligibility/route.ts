import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ data: { eligible: true, reason: "demo_mode" } });
  }

  const sql = getSql();

  // Check if org has already used a trial
  type UsageRow = { id: string };
  const usageRows = (await sql`
    SELECT id FROM billing_trial_usage
    WHERE organization_id = ${session.organizationId}
    LIMIT 1
  `) as UsageRow[];

  if (usageRows.length > 0) {
    return NextResponse.json({
      data: { eligible: false, reason: "trial_already_used" },
    });
  }

  // Check if org has any non-trial paid subscription history
  type SubRow = { id: string };
  const paidRows = (await sql`
    SELECT id FROM billing_subscriptions
    WHERE organization_id = ${session.organizationId}
      AND is_trial = false
      AND status NOT IN ('checkout_pending', 'inactive')
    LIMIT 1
  `) as SubRow[];

  if (paidRows.length > 0) {
    return NextResponse.json({
      data: { eligible: false, reason: "has_paid_subscription_history" },
    });
  }

  return NextResponse.json({
    data: { eligible: true, reason: "no_previous_trial" },
  });
}
