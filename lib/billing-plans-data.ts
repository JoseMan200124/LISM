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
    description: "Para laboratorios académicos que empiezan a digitalizar su operación.",
    price_monthly_cents: 4900,
    currency: "USD",
    max_users: 5,
    max_labs: 1,
    features: [
      "Hasta 5 usuarios",
      "1 laboratorio",
      "Inventario y equipos",
      "Alertas y reportes básicos",
      "Soporte por correo",
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
    description: "Para laboratorios en crecimiento que necesitan más usuarios y trazabilidad completa.",
    price_monthly_cents: 14900,
    currency: "USD",
    max_users: 12,
    max_labs: 1,
    features: [
      "Hasta 12 usuarios",
      "1 laboratorio",
      "Muestras, resultados y calidad",
      "Inventario, equipos y alertas",
      "Historial de auditoría",
      "Soporte prioritario",
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
    description: "Para organizaciones que coordinan varios laboratorios o sedes.",
    price_monthly_cents: 29900,
    currency: "USD",
    max_users: 30,
    max_labs: 3,
    features: [
      "Hasta 30 usuarios",
      "Hasta 3 laboratorios",
      "Coordinación entre sedes",
      "Inventario, equipos y calidad",
      "Historial de auditoría",
      "Reportes consolidados",
      "Soporte dedicado",
    ],
    limits: {
      max_users: 30,
      max_labs: 3,
    },
    is_recommended: false,
    billing_interval: "monthly",
  },
];

export async function getPublicPlans(): Promise<{ data: BillingPlan[]; mode: "demo" | "database" }> {
  if (!hasDatabase()) {
    return { data: FALLBACK_PLANS, mode: "demo" };
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

    return { data: rows, mode: "database" };
  } catch (error) {
    console.error("[billing/plans] DB error, falling back to demo data:", error);
    return { data: FALLBACK_PLANS, mode: "demo" };
  }
}
