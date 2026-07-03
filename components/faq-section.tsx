import { JsonLd } from "@/components/structured-data";

const faqs = [
  {
    question: "¿Qué es NexaLab?",
    answer:
      "NexaLab es un sistema de gestión de laboratorio (LIS) que centraliza inventario, equipos, prácticas y reservas en un panel operativo claro y trazable, pensado para adoptarse sin complejidad innecesaria.",
  },
  {
    question: "¿Para qué tipo de instituciones está pensado NexaLab?",
    answer:
      "Para colegios, universidades y laboratorios escolares con equipos técnicos que necesitan coordinar inventario y equipos de forma precisa.",
  },
  {
    question: "¿Cómo funciona la prueba gratuita?",
    answer:
      "Cualquier plan incluye el primer mes gratis, sin costo hoy. Puedes cambiar de plan o cancelar cuando quieras durante ese período.",
  },
  {
    question: "¿Qué controla NexaLab sobre inventario y equipos?",
    answer:
      "Reactivos, materiales e insumos por categoría con vencimientos y stock mínimo, además de equipos con su estado, mantenimiento, calibración y certificados.",
  },
  {
    question: "¿Cómo protege NexaLab el acceso a inventario y equipos?",
    answer:
      "Cada recurso tiene un código QR protegido por acceso temporal, que permite consultarlo sin exponer datos sensibles directamente.",
  },
  {
    question: "¿Necesito instalar algo para usar NexaLab?",
    answer:
      "No. NexaLab es una plataforma web: se accede desde el navegador iniciando sesión, sin instalación local.",
  },
  {
    question: "¿Puedo cambiar de plan más adelante?",
    answer:
      "Sí. Los planes están pensados para crecer junto con el laboratorio, desde un solo laboratorio hasta coordinación multi-sede.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: answer,
    },
  })),
};

export function FaqSection() {
  return (
    <section className="landing-section" id="faq" aria-labelledby="faq-title">
      <div className="landing-container">
        <div className="landing-section-heading">
          <p className="landing-eyebrow"><span /> Preguntas frecuentes</p>
          <h2 id="faq-title">Lo que suelen preguntar antes de empezar.</h2>
        </div>
        <div className="landing-faq-list">
          {faqs.map(({ question, answer }) => (
            <details className="landing-faq-item" key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </div>
      <JsonLd data={faqJsonLd} />
    </section>
  );
}
