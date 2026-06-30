import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FlaskConical,
  GraduationCap,
  Microscope,
  ScanLine,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

const audiences = [
  { icon: Building2, label: "Colegios y universidades" },
  { icon: Microscope, label: "Laboratorios escolares" },
  { icon: UsersRound, label: "Equipos técnicos" },
];

const benefits = [
  {
    icon: ScanLine,
    title: "Trazabilidad de inventario y equipos",
    description:
      "Ubica cada reactivo, material y equipo desde el ingreso hasta su consumo o mantenimiento.",
  },
  {
    icon: ShieldCheck,
    title: "QR seguro para cada recurso",
    description:
      "Cada artículo y equipo tiene un código QR protegido por acceso temporal, sin exponer datos sensibles.",
  },
  {
    icon: BarChart3,
    title: "Operación fácil de entender",
    description:
      "Convierte la actividad diaria del laboratorio en indicadores simples y útiles para decidir.",
  },
];

const workflow = [
  {
    number: "01",
    icon: ClipboardCheck,
    title: "Preparación",
    description: "El profesor programa la práctica, agrega los recursos necesarios y genera la reserva.",
  },
  {
    number: "02",
    icon: FlaskConical,
    title: "Ejecución",
    description: "El laboratorio confirma inventario y equipos, y los estudiantes reciben el aviso correspondiente.",
  },
  {
    number: "03",
    icon: FileCheck2,
    title: "Cierre",
    description: "Se registra el consumo final, se cierra la práctica y queda disponible en la auditoría.",
  },
];

const capabilities = [
  { icon: Boxes, title: "Inventario", text: "Reactivos, materiales e insumos por categoría, con vencimientos y stock mínimo." },
  { icon: Microscope, title: "Equipos", text: "Estado, mantenimiento, calibración y certificados." },
  { icon: ClipboardCheck, title: "Programa", text: "Cronograma de prácticas, reservas y avisos para estudiantes." },
  { icon: BellRing, title: "Alertas", text: "Vencimientos, mantenimientos y reservas que requieren atención." },
  { icon: ScanLine, title: "QR seguro", text: "Consulta protegida de inventario y equipos con código temporal." },
  { icon: UsersRound, title: "Administración", text: "Usuarios, roles y auditoría del laboratorio." },
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
              <span /> Sistema de Laboratorio Educativo
            </p>
            <h1 id="landing-title">
              Tu laboratorio educativo, en orden. <em>Cada práctica bajo control.</em>
            </h1>
            <p className="landing-hero-description">
              NexaLab reúne inventario, equipos, prácticas y reservas en una experiencia clara,
              trazable y fácil de adoptar por colegios, universidades y laboratorios escolares.
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
                  <button type="button" disabled aria-label="Vista previa de nueva práctica">+ Nueva práctica</button>
                </div>
                <div className="landing-preview-kpis">
                  <article>
                    <span><ClipboardCheck size={14} /></span>
                    <small>Prácticas próximas</small>
                    <strong>6</strong>
                  </article>
                  <article>
                    <span><FlaskConical size={14} /></span>
                    <small>Reservas pendientes</small>
                    <strong>4</strong>
                  </article>
                  <article>
                    <span><BellRing size={14} /></span>
                    <small>Inventario bajo</small>
                    <strong>2</strong>
                  </article>
                </div>
                <div className="landing-preview-grid">
                  <article className="landing-preview-chart">
                    <div className="landing-preview-card-title">
                      <strong>Prácticas programadas</strong>
                      <small>Últimos 7 días</small>
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
                    <div><span className="status-dot is-sage" /> Inventario <b>Estable</b></div>
                    <div><span className="status-dot is-amber" /> Equipos <b>Atención</b></div>
                    <div><span className="status-dot is-sage" /> Reservas <b>Estable</b></div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-audience" aria-label="Tipos de organización">
        <div className="landing-container landing-audience-inner">
          <p>Una base clara para laboratorios que enseñan con precisión</p>
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
            <h2 id="proposal-title">Menos fricción. Más control en cada práctica.</h2>
            <p>
              La información esencial aparece donde profesores y administradores la necesitan,
              sin convertir cada pantalla en una lista interminable de datos.
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
            <h2 id="workflow-title">La práctica guía la experiencia.</h2>
            <p>
              El sistema acompaña el recorrido real de una práctica educativa, desde que el
              profesor la programa hasta que se cierra con su consumo registrado.
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
            <h2 id="capabilities-title">Lo necesario para un laboratorio educativo. Preparado para crecer.</h2>
            <p>
              NexaLab prioriza los módulos que un laboratorio escolar o universitario usa todos
              los días, con una estructura que puede crecer junto con el laboratorio.
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
            <p className="landing-eyebrow"><span /> NexaLab Educativo</p>
            <h2>Un punto de partida profesional para tu laboratorio educativo.</h2>
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
          <p>Sistema de gestión de laboratorio educativo · Operación clara y trazable.</p>
          <Link href="/login">Ingresar</Link>
        </div>
      </footer>
    </main>
  );
}
