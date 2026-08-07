"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, ShieldAlert, TriangleAlert } from "lucide-react";
import { ActionModal } from "@/components/action-kit";
import { GhsPictogramMark, GhsPictogramPicker, GhsPictogramRow } from "@/components/ghs-pictogram";
import {
  GENERAL_EMERGENCY_STEPS,
  SAFETY_PROCEDURE_KEYS,
  SAFETY_PROCEDURE_LABELS,
  ghsPictogram,
  normalizePictograms,
  normalizeSafetyProcedures,
  resolveSafetyGuidance,
  type GhsCode,
  type SafetyProcedures,
} from "@/lib/ghs";

// Botón y ficha de seguridad de un reactivo: qué hacer en caso de accidente,
// qué significan sus pictogramas y dónde está su ficha de datos de seguridad.

export type SafetyItem = {
  id?: string;
  name?: string;
  sku?: string;
  hazard_pictograms?: unknown;
  hazard_statements?: string | null;
  safety_procedures?: unknown;
  safety_sheet_url?: string | null;
  storage_conditions?: string | null;
  is_controlled?: boolean;
};

export function SafetyButton({ item, compact = false }: Readonly<{ item: SafetyItem; compact?: boolean }>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={compact ? "text-button safety-button" : "secondary-button safety-button"}
        onClick={(event) => { event.stopPropagation(); setOpen(true); }}
      >
        <ShieldAlert size={compact ? 14 : 15} /> Seguridad
      </button>
      <SafetySheetModal open={open} item={item} onClose={() => setOpen(false)} />
    </>
  );
}

export function SafetySheetModal({ open, item, onClose }: Readonly<{ open: boolean; item: SafetyItem; onClose: () => void }>) {
  const pictograms = normalizePictograms(item.hazard_pictograms);
  const procedures = normalizeSafetyProcedures(item.safety_procedures);
  const guidance = resolveSafetyGuidance(pictograms, procedures);
  const attachmentUrl = item.id ? `/api/inventory/${item.id}/safety-sheet` : null;

  return (
    <ActionModal
      open={open}
      onClose={onClose}
      wide
      eyebrow="SEGURIDAD DEL REACTIVO"
      title={item.name ? `${item.name}` : "Ficha de seguridad"}
      description="Qué hacer ante un accidente, qué significan los pictogramas y dónde consultar la ficha de datos de seguridad."
    >
      <div className="modal-form safety-sheet">
        <section className="safety-emergency">
          <h3><TriangleAlert size={16} /> En caso de accidente</h3>
          <ol>
            {GENERAL_EMERGENCY_STEPS.map((step) => <li key={step}>{step}</li>)}
          </ol>
        </section>

        {pictograms.length ? (
          <section className="safety-block">
            <h3>Peligros identificados</h3>
            <div className="safety-pictogram-grid">
              {pictograms.map((code) => {
                const pictogram = ghsPictogram(code);
                if (!pictogram) return null;
                return (
                  <article key={code} className="safety-pictogram-card">
                    <GhsPictogramMark code={code} size={64} />
                    <div>
                      <strong>{pictogram.name}</strong>
                      <p>{pictogram.meaning}</p>
                      <small>Ejemplos: {pictogram.examples}</small>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <p className="modal-note">
            Este artículo no tiene pictogramas de peligrosidad declarados. Si es un reactivo, edítalo y añádelos:
            aparecerán en su ficha y en la etiqueta.
          </p>
        )}

        {item.hazard_statements ? (
          <section className="safety-block">
            <h3>Indicaciones de peligro y prudencia</h3>
            <p className="safety-text">{item.hazard_statements}</p>
          </section>
        ) : null}

        {guidance.length ? (
          <section className="safety-block">
            <h3>Procedimientos</h3>
            <div className="definition-list">
              {guidance.map((entry) => (
                <article className="definition-row" key={entry.key}>
                  <div>
                    <strong>{entry.label}</strong>
                    <p className="safety-text">{entry.text}</p>
                    {entry.source === "ghs" ? <small>Guía general según los pictogramas declarados. Consulta siempre la SDS del proveedor.</small> : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {item.storage_conditions ? (
          <section className="safety-block">
            <h3>Condiciones de almacenamiento</h3>
            <p className="safety-text">{item.storage_conditions}</p>
          </section>
        ) : null}

        <section className="safety-block">
          <h3>Ficha de datos de seguridad (SDS)</h3>
          <div className="safety-sds-actions">
            {attachmentUrl ? (
              <a className="secondary-button" href={attachmentUrl} target="_blank" rel="noreferrer">
                <FileText size={15} /> Abrir SDS adjunta
              </a>
            ) : null}
            {item.safety_sheet_url ? (
              <a className="secondary-button" href={item.safety_sheet_url} target="_blank" rel="noreferrer">
                <FileText size={15} /> Abrir ficha enlazada
              </a>
            ) : null}
          </div>
          {!item.safety_sheet_url && !attachmentUrl ? (
            <p className="modal-note">Este artículo no tiene ficha de datos de seguridad cargada. Adjúntala al editarlo.</p>
          ) : (
            <p className="modal-note">Si el archivo no abre, es que aún no se ha adjuntado la SDS de este lote.</p>
          )}
        </section>

        <footer className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </ActionModal>
  );
}

/**
 * Sección de seguridad del formulario de alta y edición de un reactivo:
 * pictogramas, frases H/P y procedimientos propios del laboratorio.
 */
export function SafetyFields({
  pictograms,
  onPictogramsChange,
  defaultStatements = "",
  defaultProcedures = {},
}: Readonly<{
  pictograms: GhsCode[];
  onPictogramsChange: (codes: GhsCode[]) => void;
  defaultStatements?: string;
  defaultProcedures?: SafetyProcedures;
}>) {
  const [showProcedures, setShowProcedures] = useState(
    SAFETY_PROCEDURE_KEYS.some((key) => Boolean(defaultProcedures[key])),
  );

  return (
    <>
      <span className="form-section-title field-span-two"><ShieldAlert size={14} /> Peligrosidad y seguridad</span>
      <div className="field-span-two">
        <span className="weekday-picker-label">Pictogramas SGA (los de la etiqueta del envase)</span>
        <GhsPictogramPicker value={pictograms} onChange={onPictogramsChange} />
        {pictograms.length ? (
          <div className="safety-selected-preview">
            <span>Se mostrarán así en la ficha:</span>
            <GhsPictogramRow codes={pictograms} size={34} />
          </div>
        ) : null}
      </div>
      <label className="field-span-two">
        <span>Indicaciones de peligro y prudencia <small>(frases H y P)</small></span>
        <textarea name="hazardStatements" rows={2} defaultValue={defaultStatements} placeholder="H225 Líquido y vapores muy inflamables · P210 Mantener alejado del calor" />
      </label>
      {/* Antes esto era un enlace seguido de una nota con borde: parecía un campo
          de texto vacío y el usuario hacía clic dentro de la nota esperando poder
          escribir. Ahora es un botón explícito que despliega los campos. */}
      <div className="field-span-two safety-procedures-toggle">
        <button
          type="button"
          className="secondary-button"
          aria-expanded={showProcedures}
          onClick={() => setShowProcedures((current) => !current)}
        >
          {showProcedures ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          {showProcedures ? "Ocultar procedimientos propios" : "Escribir procedimientos propios del laboratorio"}
        </button>
        <p className="safety-procedures-hint">
          Si no escribes nada, la ficha muestra la guía general de cada pictograma. Lo que escribas aquí tiene prioridad.
        </p>
      </div>
      {showProcedures ? (
        <>
          {SAFETY_PROCEDURE_KEYS.map((key) => (
            <label className="field-span-two" key={key}>
              <span>{SAFETY_PROCEDURE_LABELS[key]}</span>
              <textarea name={`safety_${key}`} rows={2} defaultValue={defaultProcedures[key] ?? ""} placeholder="Escribe aquí el procedimiento propio del laboratorio…" />
            </label>
          ))}
        </>
      ) : null}
    </>
  );
}

/** Extrae los procedimientos escritos en el formulario. */
export function collectSafetyProcedures(data: FormData): SafetyProcedures {
  const result: SafetyProcedures = {};
  for (const key of SAFETY_PROCEDURE_KEYS) {
    const value = String(data.get(`safety_${key}`) ?? "").trim();
    if (value) result[key] = value;
  }
  return result;
}
