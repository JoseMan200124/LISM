import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";

export interface BillingPlan {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  currency: string;
  max_users: number;
  max_labs: number;
  features: string[];
  limits: Record<string, unknown>;
  is_recommended: boolean;
  billing_interval: string;
}

const FALLBACK_PLANS: BillingPlan[] = [
  {
    id: "plan_academic_starter",
    slug: "academic_starter",
    name: "Academic Starter",
    description: "Ideal for small academic labs getting started with LISM.",
    price_monthly_cents: 4900,
    currency: "USD",
    max_users: 5,
    max_labs: 1,
    features: [
      "Up to 5 users",
      "1 laboratory",
      "Inventory management",
      "Basic reporting",
      "Email support",
    ],
    limits: {
      max_users: 5,
      max_labs: 1,
    },
    is_recommended: false,
    billing_interval: "monthly",
  },
  {
    id: "plan_professional",
    slug: "professional",
    name: "Professional",
    description: "For growing labs that need more users and advanced features.",
    price_monthly_cents: 14900,
    currency: "USD",
    max_users: 12,
    max_labs: 1,
    features: [
      "Up to 12 users",
      "1 laboratory",
      "Inventory management",
      "Advanced reporting & analytics",
      "Audit trail",
      "Priority email support",
    ],
    limits: {
      max_users: 12,
      max_labs: 1,
    },
    is_recommended: true,
    billing_interval: "monthly",
  },
  {
    id: "plan_multi_site",
    slug: "multi_site",
    name: "Multi-site",
    description: "For organizations managing multiple laboratories.",
    price_monthly_cents: 29900,
    currency: "USD",
    max_users: 30,
    max_labs: 3,
    features: [
      "Up to 30 users",
      "Up to 3 laboratories",
      "Inventory management",
      "Advanced reporting & analytics",
      "Audit trail",
      "Multi-lab coordination",
      "Dedicated support",
    ],
    limits: {
      max_users: 30,
      max_labs: 3,
    },
    is_recommended: false,
    billing_interval: "monthly",
  },
];

export async function GET() {
  if (!hasDatabase()) {
    return NextResponse.json({ data: FALLBACK_PLANS, mode: "demo" });
  }

  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT
        id,
        slug,
        name,
        description,
        price_monthly_cents,
        currency,
        max_users,
        max_labs,
        features,
        limits,
        is_recommended,
        billing_interval
      FROM billing_plans
      WHERE is_active = true
      ORDER BY sort_order ASC
    `) as BillingPlan[];

    return NextResponse.json({ data: rows, mode: "database" });
  } catch (error) {
    console.error("[billing/plans] DB error, falling back to demo data:", error);
    return NextResponse.json({ data: FALLBACK_PLANS, mode: "demo" });
  }
}
