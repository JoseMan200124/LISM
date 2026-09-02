import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MessageSquare } from "lucide-react";
import { JsonLd } from "@/components/structured-data";
import { PublicFooter, PublicHeader } from "@/components/public-shell";
import { CONTACT_WHATSAPP_URL } from "@/lib/contact";
import { SECTORS } from "@/lib/seo-sectors";

// Guía de fondo: responde «qué es un LIMS» y «cómo elegir uno», que es lo que
// busca quien todavía no sabe que necesita NexaLab. Es contenido informativo y
// se marca como Article; el producto aparece al final, no en cada párrafo.

const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "https://nexalaboratories.com").replace(/\/$/, "");
const url = `${siteUrl}/guia/que-es-un-lims`;
const published = "2026-09-02";

const title = "Qué es un LIMS y cómo elegir uno para tu laboratorio";
const description =
  "Guía práctica sobre sistemas de gestión de laboratorio (LIMS): qué hacen, en qué se diferencian de un LIS o un ELN, qué módulos necesitas según tu tipo de laboratorio y qué preguntar antes de contratar.";

export const metadata: Metadata = {
  title,
  description,
  keywords: ["qué es un LIMS", "sistema de gestión de laboratorio", "LIMS vs LIS", "cómo elegir un LIMS", "software para laboratorio"],
  alternates: { canonical: "/guia/que-es-un-lims" },
  openGraph: {
    type: "article",
    url,
    title: `${title} | NexaLab`,
    description,
    locale: "es_ES",
    siteName: "NexaLab",
    publishedTime: published,
  },
  twitter: { card: "summary_large_image", title: `${title} | NexaLab`, description },
};

const faqs = [
  {
    question: "¿Un LIMS es lo mismo que un LIS?",
    answer:
      "No. Un LIS (Laboratory Information System) está pensado para el laboratorio clínico: órdenes, pacientes y resultados de diagnóstico. Un LIMS (Laboratory Information Management System) abarca la operación del laboratorio en general: muestras, inventario, equipos, calidad y documentos. Hay plataformas que cubren ambos flujos.",
  },
  {
    question: "¿Necesita instalación o servidor propio?",
    answer:
      "Los LIMS modernos son plataformas web: se accede desde el navegador y el proveedor opera la infraestructura. Un LIMS instalado en servidores propios sigue existiendo, pero exige un equipo de sistemas que lo mantenga.",
  },
  {
    question: "¿Cuánto tarda en implementarse?",
    answer:
      "Un laboratorio pequeño puede estar operando en días si carga usuarios, inventario y alertas. Varias sedes, migración de datos históricos o integraciones con el ERP se planifican en una evaluación técnica inicial.",
  },
  {
    question: "¿Qué significa que un LIMS «cumple» una norma?",
    answer:
      "Que aporta los controles técnicos que la norma exige: trazabilidad, firmas electrónicas, auditoría inalterable, control de documentos y de equipos. La acreditación o certificación sigue dependiendo de los procedimientos, la validación y las auditorías del laboratorio.",
  },
];

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  "@id": `${url}#article`,
  headline: title,
  description,
  url,
  inLanguage: "es",
  datePublished: published,
  dateModified: published,
  author: { "@type": "Organization", name: "NexaLab", url: siteUrl },
  publisher: { "@type": "Organization", name: "NexaLab", url: siteUrl, logo: { "@type": "ImageObject", url: `${siteUrl}/branding/nexalab-mark.png` } },
  mainEntityOfPage: url,
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "NexaLab", item: siteUrl },
    { "@type": "ListItem", position: 2, name: "Guía", item: url },
  ],
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

export default function LimsGuidePage() {
  return (
    <main className="landing-page public-article">
      <JsonLd data={articleJsonLd} />
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />
      <PublicHeader />

      <section className="landing-hero public-hero" aria-labelledby="guide-title">
        <div className="landing-container">
          <nav className="public-breadcrumb" aria-label="Migas de pan">
            <Link href="/">NexaLab</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Guía</span>
          </nav>
          <p className="landing-eyebrow">
            <span /> Guía práctica
          </p>
          <h1 id="guide-title">{title}</h1>
          <p className="landing-hero-description">{description}</p>
          <p className="landing-hero-note">Publicado el 2 de septiembre de 2026 · Lectura de 8 minutos</p>
        </div>
      </section>

      <article className="landing-section public-prose" aria-label="Contenido de la guía">
        <div className="landing-container">
          <h2 id="que-es">Qué es un LIMS</h2>
          <p>
            Un LIMS (Laboratory Information Management System, sistema de gestión de información de
            laboratorio) es el software que registra todo lo que entra, se transforma y sale de un
            laboratorio: las muestras y su recorrido, los reactivos e insumos que se consumen, los
            equipos con los que se trabaja, los resultados que se obtienen y los documentos que rigen
            cada procedimiento.
          </p>
          <p>
            Su valor no está en ninguna de esas piezas por separado, sino en que todas comparten el
            mismo historial. Cuando alguien pregunta por un resultado de hace seis meses, el LIMS
            responde con qué muestra se analizó, con qué método, en qué equipo, con qué lote de
            reactivo y quién firmó cada paso. Sin un sistema así, esa reconstrucción vive en cuadernos,
            hojas de cálculo y en la memoria de una persona.
          </p>

          <h2 id="lims-lis-eln">LIMS, LIS y ELN: en qué se diferencian</h2>
          <p>
            Los tres términos se confunden porque se solapan. Conviene tenerlos claros antes de
            comparar proveedores:
          </p>
          <ul>
            <li>
              <strong>LIMS.</strong> Gestión de la operación del laboratorio: muestras, inventario,
              equipos, calidad, documentos y auditoría. Es el término general.
            </li>
            <li>
              <strong>LIS.</strong> Sistema de información de laboratorio clínico: órdenes de pacientes,
              pruebas diagnósticas, resultados y su liberación. Su eje es el paciente, no la muestra.
            </li>
            <li>
              <strong>ELN.</strong> Cuaderno electrónico de laboratorio: sustituye la bitácora en papel
              con entradas firmadas y fechadas. Suele ser un módulo dentro de un LIMS o un producto
              aparte que se integra con él.
            </li>
          </ul>
          <p>
            Un laboratorio de investigación necesita un LIMS con bitácora electrónica; uno clínico
            necesita el flujo de un LIS; uno de control de calidad farmacéutico necesita un LIMS con
            especificaciones, OOS y firmas electrónicas. Algunas plataformas, NexaLab entre ellas,
            cubren varios de estos perfiles con módulos que se activan según el laboratorio.
          </p>

          <h2 id="modulos">Qué módulos necesita cada tipo de laboratorio</h2>
          <p>
            No todos los laboratorios necesitan lo mismo, y pagar por módulos que no se usan es el
            error más común al contratar. Como orientación:
          </p>
          <ul>
            {SECTORS.map((sector) => (
              <li key={sector.slug}>
                <strong>
                  <Link href={`/soluciones/${sector.slug}`}>{sector.label}</Link> ({sector.context.toLowerCase()}).
                </strong>{" "}
                {sector.modules
                  .slice(0, 4)
                  .map((module) => module.title)
                  .join(", ")}
                .
              </li>
            ))}
          </ul>
          <p>
            Hay tres módulos que casi todos comparten: inventario con vencimientos y stock mínimo,
            equipos con calibración y mantenimiento, y un historial de auditoría que no se pueda
            sobrescribir. Si un LIMS no los trae de serie, lo demás importa poco.
          </p>

          <h2 id="normas">Qué exigen las normas y qué puede hacer el software</h2>
          <p>
            ISO/IEC 17025, ISO 15189, las buenas prácticas de manufactura y de laboratorio (BPM y BPL)
            y 21 CFR Part 11 piden cosas parecidas: trazabilidad de cada dato, control de documentos
            vigentes, equipos calibrados, firmas que identifiquen a la persona y registros que no se
            puedan alterar.
          </p>
          <p>
            Un LIMS aporta los controles técnicos para todo eso. Lo que no puede aportar son los
            procedimientos del laboratorio, la capacitación del equipo, la validación del sistema en
            ese contexto ni las auditorías. Desconfía de cualquier proveedor que prometa que su
            software «te certifica»: la acreditación sigue siendo responsabilidad de cada organización.
          </p>

          <h2 id="elegir">Qué preguntar antes de contratar</h2>
          <ol>
            <li>
              <strong>¿Es web o instalado?</strong> Una plataforma web se usa desde el navegador y el
              proveedor la mantiene. Un sistema instalado exige servidores y un equipo de sistemas.
            </li>
            <li>
              <strong>¿De quién son los datos y cómo se exportan?</strong> La respuesta correcta es «del
              laboratorio», con exportación en cualquier momento y sin costo.
            </li>
            <li>
              <strong>¿Tiene API documentada?</strong> Tarde o temprano habrá que conectarlo con el ERP,
              con compras o con un sistema clínico. Sin API, esa integración se hace a mano.
            </li>
            <li>
              <strong>¿Cómo se firma?</strong> Firma electrónica con reautenticación y significado de la
              firma, no un usuario compartido.
            </li>
            <li>
              <strong>¿Qué pasa con los reactivos controlados?</strong> Si el laboratorio maneja
              precursores, necesita un módulo específico con registro de entradas, consumos y saldo.
            </li>
            <li>
              <strong>¿Cuánto tarda y qué incluye la implementación?</strong> Cargar usuarios,
              inventario y alertas debería llevar días, no meses. La capacitación debe estar incluida.
            </li>
            <li>
              <strong>¿Se puede probar antes de pagar?</strong> Un mes de uso real con los datos del
              laboratorio dice más que cualquier demostración.
            </li>
          </ol>

          <h2 id="nexalab">Cómo responde NexaLab a estas preguntas</h2>
          <p>
            NexaLab es una plataforma web sin instalación, con aplicación móvil opcional, código QR en
            cada recurso, historial de auditoría inalterable y API documentada con webhooks. Los datos
            son del laboratorio y se exportan. Cualquier plan incluye el primer mes gratis y la
            capacitación durante los primeros tres meses. El perfil clínico requiere evaluación previa
            antes de operar con datos de pacientes, y así se anuncia.
          </p>
          <p>
            <Link className="landing-text-link" href="/#precios">
              Ver planes y precios <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </p>
        </div>
      </article>

      <section className="landing-section landing-section-tinted" aria-labelledby="faq-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Preguntas frecuentes</p>
            <h2 id="faq-title">Dudas habituales sobre los LIMS.</h2>
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
      </section>

      <section className="landing-contact" id="contacto" aria-labelledby="contact-title">
        <div className="landing-container landing-contact-card">
          <div className="landing-contact-copy">
            <p className="landing-eyebrow"><span /> Da el primer paso</p>
            <h2 id="contact-title">¿Quieres ver cómo se aplica a tu laboratorio?</h2>
            <p>Treinta minutos con el escenario de tu laboratorio, sin compromiso.</p>
          </div>
          <div className="landing-contact-actions">
            <a className="landing-button landing-button-light" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={16} aria-hidden="true" />
              Escribir por WhatsApp
            </a>
          </div>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
