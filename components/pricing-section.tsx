"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { formatPlanAmount } from "@/lib/billing-plans";

type PublicPlan = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  currency: string;
  features: string[];
  is_recommended: boolean;
};

export function PricingSection() {
  const router = useRouter();
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/billing/plans")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("request failed"))))
      .then((payload: { data?: PublicPlan[] }) => {
        if (!cancelled) setPlans(payload.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudieron cargar los planes. Intenta de nuevo en unos segundos.");
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="landing-section landing-section-tinted" id="precios" aria-labelledby="pricing-title">
      <div className="landing-container">
        <div className="landing-section-heading">
          <p className="landing-eyebrow"><span /> Precios</p>
          <h2 id="pricing-title">Un plan claro para cada laboratorio educativo.</h2>
          <p>Primer mes gratis en cualquier plan. Sin costo hoy, cambia o cancela cuando quieras.</p>
        </div>

        {error ? <p className="landing-pricing-status landing-pricing-error">{error}</p> : null}
        {!plans && !error ? <p className="landing-pricing-status">Cargando planes…</p> : null}

        <div className="landing-pricing-grid">
          {(plans ?? []).map((plan) => (
            <article key={plan.id} className={`landing-pricing-card ${plan.is_recommended ? "landing-pricing-card-featured" : ""}`}>
              {plan.is_recommended ? <span className="landing-pricing-badge">Recomendado</span> : null}
              <h3>{plan.name}</h3>
              <p className="landing-pricing-description">{plan.description}</p>
              <p className="landing-pricing-amount">{formatPlanAmount(plan.price_monthly_cents, plan.currency)}</p>
              <p className="landing-pricing-trial">Primer mes gratis</p>
              <ul className="landing-pricing-features">
                {plan.features.map((feature) => (
                  <li key={feature}><CheckCircle2 size={14} aria-hidden="true" /> {feature}</li>
                ))}
              </ul>
              <button
                className={plan.is_recommended ? "landing-button" : "landing-secondary-button landing-pricing-cta"}
                onClick={() => router.push(`/registro?plan=${plan.id}`)}
              >
                Elegir plan
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
