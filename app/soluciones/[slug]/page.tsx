import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CheckCircle2, Mail, MessageSquare, X } from "lucide-react";
import { JsonLd } from "@/components/structured-data";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { CONTACT_EMAIL, CONTACT_WHATSAPP_URL } from "@/lib/contact";
import { SECTORS, getSector } from "@/lib/seo-sectors";

// Páginas de posicionamiento por tipo de laboratorio. Todo el contenido vive en
// `lib/seo-sectors.ts`; aquí solo se decide cómo se presenta y qué datos
// estructurados se publican (Service, BreadcrumbList y FAQPage).
//
// El layout raíz es force-dynamic (lee APP_VERSION por petición), así que estas
// páginas se renderizan en cada petición aunque su contenido sea constante. No
// consultan la base de datos: el coste es un render de HTML.

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com").replace(/\/$/, "");

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return SECTORS.map((sector) => ({ slug: sector.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const sector = getSector(slug);
  if (!sector) return {};
  const url = `${siteUrl}/soluciones/${sector.slug}`;
  return {
    title: sector.title,
    description: sector.description,
    keywords: sector.keywords,
    alternates: { canonical: `/soluciones/${sector.slug}` },
    openGraph: {
      type: "website",
      url,
      title: `${sector.title} | NexaLab`,
      description: sector.description,
      locale: "es_ES",
      siteName: "NexaLab",
    },
    twitter: {
      card: "summary_large_image",
      title: `${sector.title} | NexaLab`,
      description: sector.description,
    },
  };
}

export default async function SectorPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const sector = getSector(slug);
  if (!sector) notFound();

  const url = `${siteUrl}/soluciones/${sector.slug}`;
  const related = SECTORS.filter((item) => item.slug !== sector.slug);

  const serviceJsonLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${url}#service`,
    name: sector.title,
    serviceType: "Sistema de gestión de laboratorio (LIMS)",
    description: sector.description,
    url,
    provider: { "@type": "Organization", name: "NexaLab", url: siteUrl },
    audience: { "@type": "BusinessAudience", audienceType: sector.context },
    availableLanguage: "es",
    offers: {
      "@type": "Offer",
      priceCurrency: "USD",
      category: "Suscripción mensual con primer mes gratis",
      url: `${siteUrl}/#precios`,
    },
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "NexaLab", item: siteUrl },
      { "@type": "ListItem", position: 2, name: "Soluciones", item: `${siteUrl}/#soluciones` },
      { "@type": "ListItem", position: 3, name: sector.label, item: url },
    ],
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: sector.faqs.map(({ question, answer }) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main className="landing-page public-article">
      <JsonLd data={serviceJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />
      <PublicHeader />

      <section className="landing-hero public-hero" aria-labelledby="sector-title">
        <div className="landing-container">
          <nav className="public-breadcrumb" aria-label="Migas de pan">
            <Link href="/">NexaLab</Link>
            <span aria-hidden="true">/</span>
            <Link href="/#soluciones">Soluciones</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">{sector.label}</span>
          </nav>
          <p className="landing-eyebrow">
            <span /> {sector.context}
          </p>
          <h1 id="sector-title">{sector.h1}</h1>
          <p className="landing-hero-description">{sector.intro}</p>
          <div className="landing-hero-actions">
            <a className="landing-button" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={16} aria-hidden="true" />
              Pedir una demostración
            </a>
            <Link className="landing-secondary-button" href="/registro">
              Empezar el mes gratis
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          {sector.status === "EVALUATION" ? (
            <p className="landing-hero-note">
              Este perfil requiere evaluación previa: antes de operar con datos reales revisamos contigo
              alcance, validación y procedimientos.
            </p>
          ) : (
            <p className="landing-hero-note">Disponible hoy. Primer mes gratis en cualquier plan.</p>
          )}
        </div>
      </section>

      <section className="landing-section landing-section-tinted" aria-labelledby="problems-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Lo que cambia</p>
            <h2 id="problems-title">Qué resuelve NexaLab en un {sector.label.toLowerCase()}.</h2>
          </div>
          <div className="landing-compare-grid">
            <div className="landing-compare-head">
              <span className="is-before">Antes de NexaLab</span>
              <span className="is-after">Con NexaLab</span>
            </div>
            {sector.problems.map(({ before, after }) => (
              <div className="landing-compare-row" key={before}>
                <p className="landing-compare-before">
                  <X size={14} aria-hidden="true" /> {before}
                </p>
                <p className="landing-compare-after">
                  <CheckCircle2 size={14} aria-hidden="true" /> {after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="modules-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Módulos</p>
            <h2 id="modules-title">Lo que usa este tipo de laboratorio.</h2>
            <p>
              Cada módulo funciona por separado y todos comparten el mismo historial. Se activa lo que
              el laboratorio usa hoy y se añade el resto cuando haga falta.
            </p>
          </div>
          <div className="landing-capability-grid">
            {sector.modules.map(({ title, text }) => (
              <article key={title}>
                <span><CheckCircle2 size={16} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tinted" aria-labelledby="workflow-title">
        <div className="landing-container landing-workflow-layout">
          <div className="landing-section-heading landing-section-heading-left">
            <p className="landing-eyebrow"><span /> Cómo se trabaja</p>
            <h2 id="workflow-title">De la carga inicial a la auditoría.</h2>
            <p>{sector.compliance}</p>
            <Link className="landing-text-link" href="/guia/que-es-un-lims">
              Qué es un LIMS y cómo elegirlo <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="landing-workflow-list">
            {sector.workflow.map(({ title, text }, index) => (
              <article key={title}>
                <strong>{String(index + 1).padStart(2, "0")}</strong>
                <span><CheckCircle2 size={17} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="faq-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Preguntas frecuentes</p>
            <h2 id="faq-title">Lo que pregunta un {sector.label.toLowerCase()} antes de empezar.</h2>
          </div>
          <div className="landing-faq-list">
            {sector.faqs.map(({ question, answer }) => (
              <details className="landing-faq-item" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tinted" aria-labelledby="related-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Otros laboratorios</p>
            <h2 id="related-title">La misma plataforma, adaptada a cada operación.</h2>
          </div>
          <ul className="public-related">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={`/soluciones/${item.slug}`}>
                  <strong>{item.label}</strong>
                  <span>{item.context}</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-contact" id="contacto" aria-labelledby="contact-title">
        <div className="landing-container landing-contact-card">
          <div className="landing-contact-copy">
            <p className="landing-eyebrow"><span /> Da el primer paso</p>
            <h2 id="contact-title">Agenda una demostración con el escenario de tu laboratorio.</h2>
            <p>
              Te mostramos la plataforma con tu caso, resolvemos dudas técnicas y te decimos con
              claridad si NexaLab te sirve. Treinta minutos, sin compromiso.
            </p>
            <p className="landing-contact-note">Respondemos el mismo día hábil.</p>
          </div>
          <div className="landing-contact-actions">
            <a className="landing-button landing-button-light" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={16} aria-hidden="true" />
              Escribir por WhatsApp
            </a>
            <a className="landing-contact-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Demostración de NexaLab: ${sector.label}`)}`}>
              <Mail size={15} aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
