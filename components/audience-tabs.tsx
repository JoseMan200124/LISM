"use client";

import { useRef, useState } from "react";
import {
  Beaker,
  Building2,
  CheckCircle2,
  FlaskConical,
  GraduationCap,
  Microscope,
  Stethoscope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type AudienceStatus = "AVAILABLE" | "EVALUATION" | "SOON";

type Audience = {
  id: string;
  icon: LucideIcon;
  label: string;
  context: string;
  title: string;
  description: string;
  modules: string[];
  status: AudienceStatus;
};

// Los estados son deliberadamente honestos: el perfil clínico exige evaluación
// previa antes de operar con datos reales (docs/COMPLIANCE_BOUNDARIES.md), y
// anunciarlo como listo sería una promesa que el producto no puede sostener.
const STATUS_LABEL: Record<AudienceStatus, string> = {
  AVAILABLE: "Disponible",
  EVALUATION: "Requiere evaluación previa",
  SOON: "Próximamente",
};

const audiences: Audience[] = [
  {
    id: "educativo",
    icon: GraduationCap,
    label: "Educativo",
    context: "Colegios y universidades",
    title: "Cada práctica preparada a tiempo.",
    description:
      "Programa prácticas, reserva materiales y equipos, avisa a los estudiantes y registra el consumo real de cada sesión. El inventario se actualiza solo y el docente deja de perseguir faltantes.",
    modules: ["Cronograma de prácticas", "Reservas", "Inventario", "Avisos a estudiantes"],
    status: "AVAILABLE",
  },
  {
    id: "investigacion",
    icon: Microscope,
    label: "Investigación",
    context: "Universidades e institutos",
    title: "Resultados que se pueden reconstruir.",
    description:
      "Proyectos, muestras, cadena de custodia, bitácoras electrónicas y documentos versionados. Cada dato conserva quién, cuándo y con qué método, listo para publicar o auditar.",
    modules: ["Proyectos", "Cadena de custodia", "Bitácoras electrónicas", "Documentos controlados"],
    status: "AVAILABLE",
  },
  {
    id: "salud",
    icon: Stethoscope,
    label: "Salud",
    context: "Clínicos y diagnósticos",
    title: "Del ingreso de la orden a la liberación del resultado.",
    description:
      "Órdenes, recepción, identificación de muestra, resultados, revisión y liberación como pasos separados y firmados, con bases alineadas a ISO 15189.",
    modules: ["Órdenes", "Muestras", "Resultados", "Revisión y liberación"],
    status: "EVALUATION",
  },
  {
    id: "calidad",
    icon: FlaskConical,
    label: "Control de calidad",
    context: "Farmacéutico e industrial",
    title: "Métodos, especificaciones y desvíos bajo control.",
    description:
      "Resultados contra la especificación vigente, apertura automática de OOS cuando un valor queda fuera de límites, OOT, CAPA, documentos controlados y firma electrónica con reautenticación.",
    modules: ["Métodos y especificaciones", "OOS y OOT", "CAPA", "Firmas electrónicas"],
    status: "AVAILABLE",
  },
  {
    id: "industrial",
    icon: Building2,
    label: "Industrial",
    context: "Alimentos y manufactura",
    title: "Calidad de lote sin hojas sueltas.",
    description:
      "Monitoreo ambiental por punto, bitácoras por turno, control de reactivos e insumos con vencimiento y stock mínimo, y alertas antes de que falte algo en línea.",
    modules: ["Monitoreo ambiental", "Bitácoras por turno", "Inventario por lote", "Alertas"],
    status: "AVAILABLE",
  },
];

export function AudienceTabs() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Navegación de tablist según el patrón WAI-ARIA: flechas mueven el foco y la
  // selección, Home y End saltan a los extremos.
  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = audiences.length - 1;
    let next: number | null = null;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === lastIndex ? 0 : index + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? lastIndex : index - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = lastIndex;

    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  }

  const current = audiences[active];
  const CurrentIcon = current.icon;

  return (
    <div className="landing-audience-tabs">
      <div className="landing-audience-tablist" role="tablist" aria-label="Tipos de laboratorio">
        {audiences.map((audience, index) => {
          const Icon = audience.icon;
          const selected = index === active;
          return (
            <button
              key={audience.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`audience-tab-${audience.id}`}
              aria-selected={selected}
              aria-controls={`audience-panel-${audience.id}`}
              tabIndex={selected ? 0 : -1}
              className={selected ? "is-active" : ""}
              onClick={() => setActive(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>
                <strong>{audience.label}</strong>
                <small>{audience.context}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div
        className="landing-audience-panel"
        role="tabpanel"
        id={`audience-panel-${current.id}`}
        aria-labelledby={`audience-tab-${current.id}`}
        tabIndex={0}
      >
        <div className="landing-audience-panel-head">
          <span className="landing-audience-panel-icon">
            <CurrentIcon size={20} aria-hidden="true" />
          </span>
          <span
            className={`landing-audience-status${current.status === "AVAILABLE" ? " is-available" : ""}`}
          >
            {STATUS_LABEL[current.status]}
          </span>
        </div>
        <h3>{current.title}</h3>
        <p>{current.description}</p>
        <ul>
          {current.modules.map((module) => (
            <li key={module}>
              <CheckCircle2 size={14} aria-hidden="true" /> {module}
            </li>
          ))}
        </ul>
        {current.status === "EVALUATION" ? (
          <p className="landing-audience-footnote">
            <Beaker size={13} aria-hidden="true" /> Antes de operar con datos clínicos reales
            revisamos contigo alcance, validación y procedimientos del laboratorio.
          </p>
        ) : null}
      </div>
    </div>
  );
}
