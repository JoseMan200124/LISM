import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getSql, hasDatabase } from "@/lib/db";

export interface BillingPayment {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  billed_period_start: string | null;
  billed_period_end: string | null;
  failure_reason: string | null;
  receipt_url: string | null;
}

export async function GET(_request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  if (!hasDatabase()) {
    return NextResponse.json({ data: [], mode: "demo" });
  }

  const sql = getSql();

  const rows = (await sql`
    SELECT
      id,
      amount_cents,
      currency,
      status,
      paid_at,
      billed_period_start,
      billed_period_end,
      failure_reason,
      receipt_url
    FROM billing_payments
    WHERE organization_id = ${session.organizationId}
    ORDER BY created_at DESC
    LIMIT 50
  `) as BillingPayment[];

  return NextResponse.json({ data: rows, mode: "database" });
}
