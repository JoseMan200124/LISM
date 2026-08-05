import { JsonLd } from "@/components/structured-data";

const faqs = [
  {
    question: "¿Qué es NexaLab?",
    answer:
      "NexaLab es un sistema de gestión de laboratorio (LIMS) que centraliza muestras, inventario, equipos, calidad, documentos y alertas en un panel operativo claro y trazable, pensado para adoptarse sin complejidad innecesaria.",
  },
  {
    question: "¿Para qué tipo de instituciones está pensado NexaLab?",
    answer:
      "Para cualquier laboratorio que quiera digitalizar su operación: educativos de colegios y universidades, centros de investigación, laboratorios clínicos, de control de calidad farmacéutico e industriales que necesitan coordinar muestras, inventario y equipos con precisión.",
  },
  {
    question: "¿Necesito instalar algo para usar NexaLab?",
    answer:
      "No. NexaLab es una plataforma web: se accede desde el navegador iniciando sesión, sin instalación local. La aplicación móvil es opcional y complementa el trabajo dentro del laboratorio.",
  },
  {
    question: "¿Cómo funciona la prueba gratuita?",
    answer:
      "Cualquier plan incluye el primer mes gratis, sin costo hoy. Puedes cambiar de plan o cancelar cuando quieras durante ese período.",
  },
  {
    question: "¿Cuánto tarda la implementación?",
    answer:
      "Un laboratorio puede estar operando en días: se crea la organización, se cargan usuarios e inventario y se configuran las alertas. Los proyectos con varias sedes, migración de datos históricos o integraciones se planifican en la evaluación técnica inicial.",
  },
  {
    question: "¿Incluye capacitación?",
    answer:
      "Sí. Durante los primeros tres meses de uso acompañamos al equipo con capacitaciones para los usuarios acordados según el plan contratado.",
  },
  {
    question: "¿Qué controla NexaLab sobre inventario y equipos?",
    answer:
      "Reactivos, reactivos controlados, materiales e insumos por categoría, lote y ubicación, con vencimientos y stock mínimo; y equipos con su estado, mantenimiento, calibración y certificados.",
  },
  {
    question: "¿Cómo protege NexaLab el acceso a inventario y equipos?",
    answer:
      "Cada recurso tiene un código QR que no expone información: al abrirlo se resuelve con acceso temporal y aplica los permisos del usuario que lo escanea.",
  },
  {
    question: "¿Dónde quedan mis datos y quién puede verlos?",
    answer:
      "Los datos viajan cifrados, quedan separados por organización y laboratorio, y solo son visibles para los usuarios con permiso. Cada acción queda en un historial que no se sobrescribe. Los datos son del laboratorio y se pueden exportar.",
  },
  {
    question: "¿Se integra con los sistemas que ya usamos?",
    answer:
      "Sí. NexaLab publica una API documentada con credenciales por alcance y webhooks de eventos, que permite conectarlo con ERP, SAP, Power Apps u otras herramientas internas.",
  },
  {
    question: "¿Puedo cambiar de plan más adelante?",
    answer:
      "Sí. Los planes están pensados para crecer con el laboratorio, desde uno solo hasta la coordinación de varias sedes, y el cambio no interrumpe la operación.",
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
  // Fondo blanco: la sección de precios que la precede ya usa el tono tintado.
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
