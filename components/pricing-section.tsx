import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { formatPlanAmount } from "@/lib/billing-plans";
import { getPublicPlans } from "@/lib/billing-plans-data";

export async function PricingSection() {
  const { data: plans } = await getPublicPlans();

  return (
    <section className="landing-section landing-section-tinted" id="precios" aria-labelledby="pricing-title">
      <div className="landing-container">
        <div className="landing-section-heading">
          <p className="landing-eyebrow"><span /> Precios</p>
          <h2 id="pricing-title">Un plan claro para cada laboratorio educativo.</h2>
          <p>Primer mes gratis en cualquier plan. Sin costo hoy, cambia o cancela cuando quieras.</p>
        </div>

        <div className="landing-pricing-grid">
          {plans.map((plan) => (
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
              <Link
                className={plan.is_recommended ? "landing-button" : "landing-secondary-button landing-pricing-cta"}
                href={`/registro?plan=${plan.id}`}
              >
                Elegir plan
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
