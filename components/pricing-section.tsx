import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { formatPlanAmount } from "@/lib/billing-plans";
import { getPublicPlans } from "@/lib/billing-plans-data";

// Necesidades que no encajan en un plan estándar. La tarjeta es estática a
// propósito: crear una fila sin precio en `billing_plans` rompería el checkout y
// el cálculo del mes de prueba, así que esta lleva a contacto, no a /registro.
const customPlanFeatures = [
  "Módulos e integraciones según tu operación",
  "Varias sedes y usuarios sin límite fijo",
  "Migración de datos históricos",
  "Onboarding y capacitación dedicados",
];

export async function PricingSection() {
  const { data: plans } = await getPublicPlans();

  return (
    <section className="landing-section landing-section-tinted" id="precios" aria-labelledby="pricing-title">
      <div className="landing-container">
        <div className="landing-section-heading">
          <p className="landing-eyebrow"><span /> Precios</p>
          <h2 id="pricing-title">Un plan claro para cada laboratorio.</h2>
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

          <article className="landing-pricing-card landing-pricing-card-custom">
            <h3>Personalizado</h3>
            <p className="landing-pricing-description">
              ¿Tu laboratorio no encaja en una caja? Hacemos una evaluación técnica contigo y
              cotizamos solo lo que vas a usar.
            </p>
            <p className="landing-pricing-amount">Cotización a medida</p>
            <p className="landing-pricing-trial">Evaluación técnica sin costo</p>
            <ul className="landing-pricing-features">
              {customPlanFeatures.map((feature) => (
                <li key={feature}><CheckCircle2 size={14} aria-hidden="true" /> {feature}</li>
              ))}
            </ul>
            <a className="landing-secondary-button landing-pricing-cta" href="#contacto">
              Solicitar cotización
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </article>
        </div>

        <p className="landing-pricing-note">
          Usuario adicional desde USD 5 al mes · Implementación y capacitación desde USD 150 ·
          Precios en dólares estadounidenses, sin impuestos locales.
        </p>
      </div>
    </section>
  );
}
