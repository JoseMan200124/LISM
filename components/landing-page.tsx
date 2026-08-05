import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Compass,
  FileCheck2,
  FileText,
  FlaskConical,
  GraduationCap,
  History,
  Lock,
  Mail,
  MessageSquare,
  Microscope,
  Plug,
  QrCode,
  ScanLine,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TabletSmartphone,
  Thermometer,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { LandingMobileMenu } from "@/components/landing-mobile-menu";
import { PricingSection } from "@/components/pricing-section";
import { FaqSection } from "@/components/faq-section";
import { AudienceTabs } from "@/components/audience-tabs";
import { JsonLd } from "@/components/structured-data";
import { PublicThemeToggle } from "@/components/public-theme-toggle";
import { DeveloperCredit } from "@/components/developer-credit";
import { CONTACT_EMAIL, CONTACT_WHATSAPP_URL, CONTACT_PHONE_LABEL } from "@/lib/contact";

const softwareApplicationJsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "NexaLab",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "NexaLab reúne muestras, inventario, equipos, alertas, calidad y cumplimiento de laboratorios de investigación, educativos, clínicos, industriales y farmacéuticos en una sola plataforma segura y trazable.",
  offers: {
    "@type": "Offer",
    priceCurrency: "USD",
    category: "Suscripción mensual con primer mes gratis",
  },
};

const navLinks = [
  { href: "#soluciones", label: "Soluciones" },
  { href: "#capacidades", label: "Capacidades" },
  { href: "#beneficios", label: "Beneficios" },
  { href: "#precios", label: "Precios" },
  { href: "#faq", label: "FAQ" },
];

// Franja de confianza: solo hechos verificables del producto en producción.
// Cuando haya clientes con autorización escrita, se sustituye por sus logotipos.
const trustPoints = [
  { icon: Compass, label: "Plataforma 100 % web" },
  { icon: Smartphone, label: "App móvil para el laboratorio" },
  { icon: QrCode, label: "Código QR en cada recurso" },
  { icon: History, label: "Historial de auditoría inalterable" },
  { icon: Plug, label: "API abierta para integraciones" },
];

const comparison = [
  { before: "Hojas de Excel dispersas, cada una con su propia versión.", after: "Una sola fuente de datos, con historial de cambios por usuario." },
  { before: "Muestras perdidas o sin registro de quién las tocó.", after: "Trazabilidad completa y cadena de custodia por muestra." },
  { before: "Reactivos vencidos que se descubren al usarlos.", after: "Alertas de vencimiento y stock mínimo antes de que sea un problema." },
  { before: "Inventario que se descuadra cada mes.", after: "Saldo calculado por movimientos: entradas, consumos, ajustes y descartes." },
  { before: "Calibraciones y mantenimientos anotados en una agenda.", after: "Planes periódicos por equipo, con certificados y bloqueo si vence." },
  { before: "Bitácoras en papel que hay que buscar en cajas.", after: "Bitácoras electrónicas con firma y consulta inmediata." },
  { before: "Auditoría a las corridas, recopilando evidencia a mano.", after: "Registros y matriz de evidencia listos en todo momento." },
  { before: "Nadie sabe qué hay en bodega sin ir a mirar.", after: "Código QR en cada recurso: se escanea y se ve su ficha." },
];

const workflow = [
  {
    number: "01",
    icon: ClipboardCheck,
    title: "Ingreso y registro",
    description: "Se reciben reactivos, materiales, equipos o muestras con su lote, ubicación y documentación de respaldo.",
  },
  {
    number: "02",
    icon: FlaskConical,
    title: "Operación diaria",
    description: "El equipo consume, transfiere, analiza y registra resultados; el saldo y el estado se actualizan con cada movimiento.",
  },
  {
    number: "03",
    icon: BellRing,
    title: "Control y alertas",
    description: "Vencimientos, stock bajo, calibraciones pendientes y desvíos avisan al responsable antes de detener la operación.",
  },
  {
    number: "04",
    icon: FileCheck2,
    title: "Reporte y auditoría",
    description: "Los registros quedan firmados y disponibles: reportes, evidencia de cumplimiento e historial que no se sobrescribe.",
  },
];

const capabilities = [
  { icon: Boxes, title: "Inventario", text: "Reactivos, materiales e insumos por categoría, lote, ubicación y vencimiento, con stock mínimo y saldo por movimientos." },
  { icon: ShieldCheck, title: "Reactivos controlados", text: "Catálogo con CAS y clasificación, licencias y permisos por recepción, registro de uso y kardex que no se sobrescribe." },
  { icon: Microscope, title: "Equipos", text: "Estado, criticidad, planes de mantenimiento y calibración, certificados y bloqueo opcional al vencer la vigencia." },
  { icon: FlaskConical, title: "Muestras", text: "Registro, consulta, cadena de custodia y flujo configurable por estados y transiciones autorizadas." },
  { icon: ClipboardList, title: "Órdenes y resultados", text: "Catálogo de análisis, resultados vinculados a método y especificación vigentes, revisión, firma y liberación." },
  { icon: Sparkles, title: "Calidad", text: "OOS con apertura automática cuando un resultado sale de límites, OOT y CAPA con responsable y seguimiento." },
  { icon: FileText, title: "Documentos controlados", text: "Versiones históricas y vigencia, para consultar el documento correcto en el momento correcto." },
  { icon: ClipboardCheck, title: "Bitácoras electrónicas", text: "Registro por frecuencia definida, con firma opcional y consulta inmediata." },
  { icon: GraduationCap, title: "Capacitación", text: "Competencia del personal, autorizaciones y vigencias por persona y actividad." },
  { icon: BellRing, title: "Alertas", text: "Vencimientos, mantenimientos, stock y reservas, con acuse, asignación, resolución y escalamiento configurable." },
  { icon: QrCode, title: "QR seguro", text: "Etiqueta opaca por recurso: no expone datos y aplica los permisos del usuario al abrirla." },
  { icon: FileCheck2, title: "Cumplimiento", text: "Matriz de controles con evidencia esperada, responsable y estado de avance." },
  { icon: Thermometer, title: "Monitoreo ambiental", text: "Puntos de medición, límites configurables y registro histórico por área." },
  { icon: Workflow, title: "Configuración", text: "Perfiles, campos personalizados, reglas de alerta y flujos versionables sin tocar código." },
  { icon: History, title: "Auditoría", text: "Historial append-only de cada acción, con actor, fecha y laboratorio." },
  { icon: Plug, title: "Integraciones", text: "API documentada, credenciales por alcance y webhooks para conectar con ERP, SAP o Power Apps." },
  { icon: MessageSquare, title: "Mensajería", text: "Comunicación interna por organización, para que la coordinación entre laboratorios no viva en otro canal." },
  { icon: UsersRound, title: "Administración", text: "Usuarios, roles, permisos por acción y sesiones activas de la organización." },
];

const featureGroups = [
  {
    icon: ScanLine,
    title: "Productividad",
    items: [
      "Códigos QR y de barras en recursos y muestras",
      "Acceso móvil desde el propio laboratorio",
      "Notificaciones en la plataforma y en el teléfono",
      "Inventario que se actualiza con cada movimiento",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Cumplimiento y control",
    items: [
      "Registro de auditoría append-only",
      "Firmas electrónicas con reautenticación",
      "Permisos por rol y por laboratorio",
      "Reactivos controlados y de doble uso con licencias y permisos",
    ],
  },
  {
    icon: BellRing,
    title: "Automatización",
    items: [
      "Alertas de vencimiento y stock mínimo",
      "Avisos de calibración y mantenimiento",
      "Apertura automática de investigación OOS",
      "Escalamiento configurable de alertas sin atender",
    ],
  },
];

const benefits = [
  "Ahorra tiempo",
  "Reduce errores",
  "Supera las auditorías",
  "Mejora la trazabilidad",
  "Elimina el uso de papel",
  "Aumenta la productividad",
  "Laboratorio digitalizado",
];

const securityPoints = [
  {
    icon: Lock,
    title: "Tus datos, separados por laboratorio",
    text: "Cada laboratorio ve solo lo suyo. Los permisos se aplican en el servidor, no únicamente en la pantalla.",
  },
  {
    icon: UsersRound,
    title: "Acceso con sesión cifrada y roles",
    text: "Roles predefinidos y permisos por acción. El acceso de una persona se retira en un clic.",
  },
  {
    icon: History,
    title: "Nada se borra en silencio",
    text: "El historial es append-only: una corrección se registra como un movimiento nuevo y quedan ambos.",
  },
  {
    icon: ShieldCheck,
    title: "Infraestructura administrada",
    text: "Servicio alojado con respaldos periódicos y actualizaciones aplicadas sin trabajo del laboratorio.",
  },
];

const mobileHighlights = [
  {
    icon: Smartphone,
    title: "Las mismas funciones",
    text: "Inventario, equipos, muestras, alertas y avisos, con tu mismo usuario, rol y permisos.",
  },
  {
    icon: BellRing,
    title: "Avisos al momento",
    text: "Las alertas y los avisos del laboratorio llegan como notificación al teléfono, aunque la app esté cerrada.",
  },
  {
    icon: ScanLine,
    title: "Escaneo con la cámara",
    text: "Lee el QR de un reactivo o un equipo y abre su ficha sin escribir códigos.",
  },
  {
    icon: TabletSmartphone,
    title: "Teléfono y tablet",
    text: "La interfaz se adapta al tamaño de la pantalla, útil para trabajar dentro del laboratorio.",
  },
];

export function LandingPage() {
  return (
    <main className="landing-page" id="inicio">
      <JsonLd data={softwareApplicationJsonLd} />
      <a className="landing-skip-link" href="#soluciones">
        Saltar al contenido
      </a>

      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link href="/" className="landing-brand" aria-label="Ir al inicio de NexaLab">
            <BrandLogo compact priority />
          </Link>
          <nav className="landing-nav" aria-label="Navegación principal">
            {navLinks.map(({ href, label }) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <div className="landing-header-actions">
            <PublicThemeToggle />
            <Link className="landing-login-link" href="/login">
              Ingresar
            </Link>
            <a className="landing-button landing-button-small" href="#contacto">
              Solicitar demostración
              <ArrowRight size={14} aria-hidden="true" />
            </a>
            <LandingMobileMenu links={navLinks} />
          </div>
        </div>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-container landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">
              <span /> Sistema Integral de Laboratorio
            </p>
            <h1 id="landing-title">
              Tu plataforma digital para la <em>gestión integral del laboratorio.</em>
            </h1>
            <p className="landing-hero-description">
              NexaLab reúne muestras, inventario, equipos, alertas, calidad y cumplimiento en una
              sola plataforma segura, diseñada para laboratorios de investigación, educativos,
              clínicos, industriales y farmacéuticos.
            </p>
            <div className="landing-hero-actions">
              <a className="landing-button" href="#contacto">
                Solicitar una demostración
                <ArrowRight size={16} aria-hidden="true" />
              </a>
              <Link className="landing-secondary-button" href="/login">
                Ver la plataforma
              </Link>
            </div>
            <div className="landing-hero-note">
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>Primer mes gratis en cualquier plan. Sin costo hoy, cancela cuando quieras.</span>
            </div>
            <p className="landing-principles">
              <span>Simple</span>
              <span>Intuitivo</span>
              <span>Accesible</span>
            </p>
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
                  <button type="button" disabled aria-label="Vista previa de nuevo registro">+ Nuevo registro</button>
                </div>
                <div className="landing-preview-kpis">
                  <article>
                    <span><Boxes size={14} /></span>
                    <small>Inventario bajo</small>
                    <strong>2</strong>
                  </article>
                  <article>
                    <span><Microscope size={14} /></span>
                    <small>Equipos por calibrar</small>
                    <strong>3</strong>
                  </article>
                  <article>
                    <span><BellRing size={14} /></span>
                    <small>Alertas abiertas</small>
                    <strong>4</strong>
                  </article>
                </div>
                <div className="landing-preview-grid">
                  <article className="landing-preview-chart">
                    <div className="landing-preview-card-title">
                      <strong>Movimientos registrados</strong>
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
                    <div><span className="status-dot is-sage" /> Muestras <b>Estable</b></div>
                  </article>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-audience" aria-label="Qué incluye la plataforma">
        <div className="landing-container landing-audience-inner">
          <p>Una base clara para laboratorios que trabajan con precisión</p>
          <div>
            {trustPoints.map(({ icon: Icon, label }) => (
              <span key={label}>
                <Icon size={15} aria-hidden="true" /> {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="soluciones" aria-labelledby="audience-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Para quién es</p>
            <h2 id="audience-title">Un laboratorio no es igual a otro. La plataforma se adapta.</h2>
            <p>
              Elige el tipo de laboratorio y verás qué resuelve NexaLab en su operación diaria, con
              los módulos que se activan desde el primer día.
            </p>
          </div>
          <AudienceTabs />
        </div>
      </section>

      <section className="landing-section landing-section-tinted" id="problema" aria-labelledby="problem-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> El problema real</p>
            <h2 id="problem-title">El laboratorio no falla por falta de trabajo. Falla por falta de registro.</h2>
            <p>
              La mayoría de laboratorios ya hace bien su trabajo técnico. Lo que se pierde está en el
              papel, en el Excel que solo entiende una persona y en el reactivo que nadie anotó.
            </p>
          </div>
          <div className="landing-compare-grid">
            <div className="landing-compare-head">
              <span className="is-before">Antes de NexaLab</span>
              <span className="is-after">Con NexaLab</span>
            </div>
            {comparison.map(({ before, after }) => (
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

      <section className="landing-section" id="flujo" aria-labelledby="workflow-title">
        <div className="landing-container landing-workflow-layout">
          <div className="landing-section-heading landing-section-heading-left">
            <p className="landing-eyebrow"><span /> Flujo completo</p>
            <h2 id="workflow-title">La operación real guía la experiencia.</h2>
            <p>
              El sistema acompaña el recorrido completo de lo que entra al laboratorio, desde su
              ingreso hasta el reporte que se presenta en una auditoría.
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

      <section className="landing-section landing-section-tinted" id="capacidades" aria-labelledby="capabilities-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Capacidades</p>
            <h2 id="capabilities-title">Todo lo que un laboratorio necesita registrar, en un solo lugar.</h2>
            <p>
              Cada módulo funciona por separado y todos comparten el mismo historial. Se activa lo
              que el laboratorio usa hoy y se añade el resto cuando haga falta.
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

      <section className="landing-section" id="beneficios" aria-labelledby="features-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Características y beneficios</p>
            <h2 id="features-title">Lo que hace la plataforma y lo que gana tu laboratorio.</h2>
            <p>
              Controles pensados para el trabajo diario y para el momento en que alguien pide
              explicaciones sobre un dato de hace seis meses.
            </p>
          </div>

          <div className="landing-feature-grid">
            {featureGroups.map(({ icon: Icon, title, items }) => (
              <article key={title}>
                <span><Icon size={18} aria-hidden="true" /></span>
                <h3>{title}</h3>
                <ul>
                  {items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <ul className="landing-benefit-chips">
            {benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>

          <p className="landing-compliance-note">
            NexaLab aporta controles técnicos que apoyan la trazabilidad, la calidad y la preparación
            para auditoría, con estructuras alineadas a ISO/IEC 17025, ISO 15189, BPM, BPL y 21 CFR
            Part 11. La acreditación o certificación del laboratorio depende además de sus
            procedimientos, capacitación, validación y auditorías, y es responsabilidad de cada
            organización.
          </p>
        </div>
      </section>

      <section className="landing-section landing-section-tinted" id="seguridad" aria-labelledby="security-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Seguridad y datos</p>
            <h2 id="security-title">Tus datos son del laboratorio. Y se comportan como tal.</h2>
            <p>
              Lo que suele preguntar el área de informática antes de aprobar una plataforma nueva,
              respondido sin rodeos.
            </p>
          </div>
          <div className="landing-security-grid">
            {securityPoints.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span><Icon size={17} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section" id="movil" aria-labelledby="mobile-title">
        <div className="landing-container">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> Acceso anticipado</p>
            <h2 id="mobile-title">También en tu teléfono.</h2>
            <p>
              La app móvil de NexaLab es la misma plataforma que usas en el navegador, pensada para
              consultarla y actualizarla desde el propio laboratorio.
            </p>
          </div>

          <div className="landing-mobile-grid">
            {mobileHighlights.map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <span><Icon size={17} aria-hidden="true" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>

          {/* Sin insignias ni enlaces de tienda: iOS está en distribución de
              pruebas y Android todavía no se publica. */}
          <p className="landing-mobile-note">
            Está disponible en acceso anticipado para laboratorios durante su implementación. Si
            quieres probarla, <a href="#contacto">escríbenos</a> y te damos acceso.
          </p>
        </div>
      </section>

      <PricingSection />

      <FaqSection />

      <section className="landing-contact" id="contacto" aria-labelledby="contact-title">
        <div className="landing-container landing-contact-card">
          <div className="landing-contact-copy">
            <p className="landing-eyebrow"><span /> Da el primer paso</p>
            <h2 id="contact-title">Agenda una demostración de NexaLab.</h2>
            <p>
              Te mostramos la plataforma con el escenario de tu laboratorio, resolvemos dudas
              técnicas y te decimos con claridad si NexaLab te sirve. Treinta minutos, sin
              compromiso.
            </p>
            <p className="landing-contact-note">Respondemos el mismo día hábil.</p>
          </div>
          <div className="landing-contact-actions">
            <a className="landing-button landing-button-light" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <MessageSquare size={16} aria-hidden="true" />
              Escribir por WhatsApp
            </a>
            <a className="landing-contact-link" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Demostración de NexaLab")}`}>
              <Mail size={15} aria-hidden="true" />
              {CONTACT_EMAIL}
            </a>
            <a className="landing-contact-link" href={CONTACT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <Smartphone size={15} aria-hidden="true" />
              {CONTACT_PHONE_LABEL}
            </a>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-container landing-footer-grid">
          <div className="landing-footer-brand">
            <BrandLogo compact />
            <p>Sistema integral de gestión de laboratorio. Operación clara y trazable.</p>
            <DeveloperCredit />
          </div>
          <nav aria-label="Producto">
            <h2>Producto</h2>
            <a href="#capacidades">Capacidades</a>
            <a href="#precios">Precios</a>
            <a href="#movil">App móvil</a>
            <Link href="/docs/api">Documentación de la API</Link>
          </nav>
          <nav aria-label="Empresa">
            <h2>Empresa</h2>
            <a href="#soluciones">Soluciones</a>
            <a href="#faq">Preguntas frecuentes</a>
            <a href="#contacto">Contacto</a>
          </nav>
          <nav aria-label="Acceso">
            <h2>Acceso</h2>
            <Link href="/login">Ingresar</Link>
            <Link href="/registro">Crear cuenta</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </nav>
        </div>
        <div className="landing-container landing-footer-legal">
          <p>© {new Date().getFullYear()} NexaLab. Todos los derechos reservados.</p>
        </div>
      </footer>
    </main>
  );
}
