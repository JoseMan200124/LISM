import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  FlaskConical,
  GraduationCap,
  Microscope,
  PackageCheck,
  ScanLine,
  ShieldCheck,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const audiences = [
  { icon: Stethoscope, label: "Laboratorios clínicos" },
  { icon: GraduationCap, label: "Universidades" },
  { icon: Microscope, label: "Investigación" },
];

const benefits = [
  {
    icon: ScanLine,
    title: "Trazabilidad de principio a fin",
    description:
      "Ubica cada muestra, responsable y resultado desde el ingreso hasta la liberación final.",
  },
  {
    icon: ShieldCheck,
    title: "Calidad visible y accionable",
    description:
      "Centraliza controles, incidencias y alertas para que el equipo actúe con claridad.",
  },
  {
    icon: BarChart3,
    title: "Operación fácil de entender",
    description:
      "Convierte el trabajo diario en indicadores simples, ordenados y útiles para decidir.",
  },
];

const workflow = [
  {
    number: "01",
    icon: ClipboardCheck,
    title: "Preanalítica",
    description: "Recepción, registro, identificación y seguimiento de muestras.",
  },
  {
    number: "02",
    icon: FlaskConical,
    title: "Analítica",
    description: "Colas de trabajo, ejecución de pruebas y control de calidad.",
  },
  {
    number: "03",
    icon: FileCheck2,
    title: "Postanalítica",
    description: "Validación, liberación, reportes y consulta histórica.",
  },
];

const capabilities = [
  { icon: ScanLine, title: "Muestras y órdenes", text: "Registro y trazabilidad operativa." },
  { icon: FlaskConical, title: "Resultados", text: "Captura, revisión y liberación." },
  { icon: PackageCheck, title: "Inventario", text: "Lotes, existencias y vencimientos." },
  { icon: Activity, title: "Calidad", text: "Controles, alertas e incidencias." },
  { icon: Database, title: "Integraciones", text: "Base preparada para interoperabilidad." },
  { icon: UsersRound, title: "Administración", text: "Usuarios, roles y laboratorios." },
];

export function LandingPage() {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" className="landing-brand" aria-label="Ir al inicio de NexaLab">
            <BrandLogo compact priority />
          </Link>
          <nav className="landing-nav" aria-label="Navegación principal">
            <a href="#propuesta">Propuesta</a>
            <a href="#flujo">Flujo</a>
            <a href="#capacidades">Capacidades</a>
          </nav>
          <div className="landing-header-actions">
            <Link className="landing-login-link" href="/login">
              Ingresar
            </Link>
            <Link className="landing-button landing-button-small" href="/login">
              Explorar demo
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span /> Laboratory Information System
            </p>
            <h1 id="landing-title">
              El laboratorio en orden. <em>Cada muestra bajo control.</em>
            </h1>
            <p className="landing-hero-description">
              NexaLab reúne muestras, resultados, inventario y calidad en una experiencia clara,
              trazable y fácil de adoptar por tu equipo.
            </p>
            <div className="landing-hero-actions">
              <Link className="landing-button" href="/login">
                Explorar plataforma
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <a className="landing-secondary-button" href="#flujo">
                Ver cómo funciona
              </a>
            </div>
            <div className="landing-hero-note">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Disponible en modo demostración para presentar el flujo completo.</span>
            </div>
          </div>

          <div className="landing-product-frame" aria-label="Vista previa del panel operativo de NexaLab">
            <div className="landing-product-topbar">
              <span />
              <span />
              <span />
              <p>Panel operativo</p>
            </div>
            <div className="landing-product-layout">
              <aside className="landing-product-sidebar">
                <div className="landing-product-mark">
                  <FlaskConical size={15} aria-hidden="true" />
                </div>
                {[0, 1, 2, 3, 4].map((item) => (
                  <i key={item} className={item === 0 ? "is-active" : ""} />
                ))}
              </aside>
              <div className="landing-product-content">
                <div className="landing-product-heading">
                  <div>
                    <small>OPERACIÓN DIARIA</small>
                    <strong>Resumen del laboratorio</strong>
                  </div>
                  <button type="button">+ Nueva muestra</button>
                </div>
                <div className="landing-preview-kpis">
                  <article>
                    <span><FlaskConical size={14} /></span>
                    <small>Muestras activas</small>
                    <strong>128</strong>
                  </article>
                  <article>
                    <span><ClipboardCheck size={14} /></span>
                    <small>Por validar</small>
                    <strong>24</strong>
                  </article>
                  <article>
                    <span><BellRing size={14} /></span>
                    <small>Alertas</small>
                    <strong>05</strong>
                  </article>
                </div>
                <div className="landing-preview-grid">
                  <article className="landing-preview-chart">
                    <div className="landing-preview-card-title">
                      <strong>Flujo de muestras</strong>
                      <small>Últimos ingresos</small>
                    </div>
                    <div className="landing-mini-chart" aria-hidden="true">
                      <i style={{ height: "45%" }} />
                      <i style={{ height: "62%" }} />
                      <i style={{ height: "50%" }} />
                      <i style={{ height: "78%" }} />
                      <i style={{ height: "68%" }} />
                      <i style={{ height: "88%" }} />
                      <i style={{ height: "72%" }} />
                    </div>
                  </article>
                  <article className="landing-preview-status">
                    <div className="landing-preview-card-title">
                      <strong>Estado operativo</strong>
                      <small>Hoy</small>
                    </div>
                    <div><span className="status-dot is-sage" /> Recepción <b>Estable</b></div>
                    <div><span className="status-dot is-amber" /> Validación <b>Atención</b></div>
                    <div><span className="status-dot is-sage" /> Inventario <b>Estable</b></div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-audience" aria-label="Tipos de organización">
        <div className="landing-container landing-audience-inner">
          <p>Una base clara para equipos que trabajan con precisión</p>
          <div>
            {audiences.map(({ icon: Icon, label }) => (
              <span key={label}>
                <Icon size={15} aria-hidden="true" /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="propuesta" aria-labelledby="proposal-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Claridad operativa</p>
            <h2 id="proposal-title">Menos fricción. Más confianza en cada proceso.</h2>
            <p>
              La información esencial aparece donde tu equipo la necesita, sin convertir cada
              pantalla en una lista interminable de datos.
            </p>
          </div>
          <div className="landing-benefit-grid">
            {benefits.map(({ icon: Icon, title, description }) => (
              <article key={title} className="landing-benefit-card">
                <span><Icon size={18} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-section-tinted" id="flujo" aria-labelledby="workflow-title">
        <div className="landing-container landing-workflow-layout">
          <div className="landing-section-heading landing-section-heading-left">
            <p className="landing-eyebrow"><span /> Flujo completo</p>
            <h2 id="workflow-title">La muestra guía la experiencia.</h2>
            <p>
              El sistema acompaña el recorrido real del laboratorio y mantiene cada fase conectada.
            </p>
            <Link className="landing-text-link" href="/login">
              Recorrer el sistema <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <div className="landing-workflow-list">
            {workflow.map(({ number, icon: Icon, title, description }) => (
              <article key={number}>
                <strong>{number}</strong>
                <span><Icon size={17} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="capacidades" aria-labelledby="capabilities-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Capacidades esenciales</p>
            <h2 id="capabilities-title">Lo necesario para comenzar. Preparado para crecer.</h2>
            <p>
              NexaLab prioriza módulos útiles desde el primer día y una estructura que puede evolucionar
              a medida que crece la operación.
            </p>
          </div>
          <div className="landing-capability-grid">
            {capabilities.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span><Icon size={16} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-cta-section">
        <div className="landing-container landing-cta-card">
          <div>
            <p className="landing-eyebrow"><span /> NexaLab LIS</p>
            <h2>Un punto de partida profesional para digitalizar tu laboratorio.</h2>
            <p>Explora el flujo de demostración y conoce la experiencia completa del sistema.</p>
          </div>
          <Link className="landing-button landing-button-light" href="/login">
            Explorar demo
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <BrandLogo compact />
          <p>Laboratory Information System · Operación clara y trazable.</p>
          <Link href="/login">Ingresar</Link>
        </div>
      </footer>
    </main>
  );
}
