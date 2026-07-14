"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { tutorialsByModule } from "@/lib/tutorial-steps";
import { useTutorial } from "@/components/tutorial/tutorial-context";

type Rect = { top: number; left: number; width: number; height: number };

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", handler);
    return () => query.removeEventListener("change", handler);
  }, []);
  return reduced;
}

export function TutorialOverlay() {
  const { activeModule, stepIndex, next, back, skip, close } = useTutorial();
  const [rect, setRect] = useState<Rect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const definition = activeModule ? tutorialsByModule[activeModule] : null;
  const step = definition?.steps[stepIndex] ?? null;

  useEffect(() => {
    setNotFound(false);
    setRect(null);
    if (!step) return;

    let cancelled = false;
    let timer = 0;
    let attempts = 0;
    let preActionDone = false;
    let removeListeners: (() => void) | null = null;

    function locate() {
      if (cancelled) return;
      const target = document.querySelector(step!.selector);
      if (target) {
        const update = () => {
          const box = target!.getBoundingClientRect();
          setRect({ top: box.top, left: box.left, width: box.width, height: box.height });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        removeListeners = () => {
          window.removeEventListener("resize", update);
          window.removeEventListener("scroll", update, true);
        };
        target.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
        return;
      }
      // Acción previa (abrir la pestaña donde vive el elemento) antes de reintentar.
      if (step!.preAction && !preActionDone) {
        preActionDone = true;
        const trigger = document.querySelector(step!.preAction.click) as HTMLElement | null;
        trigger?.click();
      }
      attempts += 1;
      if (attempts <= 12) {
        timer = window.setTimeout(locate, 150);
        return;
      }
      // Tras reintentar, si aún no aparece NO se avanza en silencio (§2.4):
      // se muestra un estado controlado con opción de reintentar u omitir.
      setNotFound(true);
    }

    locate();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      removeListeners?.();
    };
  }, [step, reducedMotion, retryNonce]);

  useEffect(() => {
    nextButtonRef.current?.focus();
  }, [stepIndex, activeModule]);

  useEffect(() => {
    if (!activeModule) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeModule, close]);

  if (!activeModule || !definition || !step) return null;

  // Estado controlado: el elemento del paso no apareció (ni tras abrir su
  // pestaña). No se salta solo; el usuario decide reintentar u omitir.
  if (notFound) {
    return (
      <div className="tutorial-root">
        <button className="tutorial-backdrop" aria-label="Cerrar tutorial" onClick={close} />
        <div className="tutorial-tooltip tutorial-tooltip-centered" role="dialog" aria-modal="true" aria-labelledby="tutorial-step-title">
          <div className="tutorial-tooltip-head">
            <span className="tutorial-progress">{stepIndex + 1} / {definition.steps.length}</span>
            <button className="icon-button" aria-label="Cerrar tutorial" onClick={close}><X size={15} /></button>
          </div>
          <h3 id="tutorial-step-title">{step.title}</h3>
          <p>No pudimos mostrar este paso en la pantalla actual. Puedes reintentar u omitirlo.</p>
          <footer className="tutorial-actions">
            <button className="secondary-button" onClick={skip}>Omitir tutorial</button>
            <div className="tutorial-actions-nav">
              <button className="secondary-button" onClick={() => setRetryNonce((n) => n + 1)}>Reintentar</button>
              <button ref={nextButtonRef} className="primary-button" onClick={next}>Omitir paso <ArrowRight size={15} /></button>
            </div>
          </footer>
        </div>
      </div>
    );
  }

  if (!rect) return null;

  const isLast = stepIndex === definition.steps.length - 1;
  const placement = step.placement ?? "bottom";
  const tooltipStyle = computeTooltipPosition(rect, placement);

  return (
    <div className="tutorial-root">
      <button className="tutorial-backdrop" aria-label="Cerrar tutorial" onClick={close} />
      <div
        className="tutorial-spotlight"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          transition: reducedMotion ? "none" : "all .22s ease",
        }}
      />
      <div className="tutorial-tooltip" role="dialog" aria-modal="true" aria-labelledby="tutorial-step-title" style={tooltipStyle}>
        <div className="tutorial-tooltip-head">
          <span className="tutorial-progress">{stepIndex + 1} / {definition.steps.length}</span>
          <button className="icon-button" aria-label="Cerrar tutorial" onClick={close}><X size={15} /></button>
        </div>
        <h3 id="tutorial-step-title">{step.title}</h3>
        <p>{step.body}</p>
        <div className="tutorial-dots">
          {definition.steps.map((s, i) => (
            <span key={s.id} className={`tutorial-dot ${i === stepIndex ? "tutorial-dot-active" : ""}`} />
          ))}
        </div>
        <footer className="tutorial-actions">
          <button className="secondary-button" onClick={skip}>Omitir</button>
          <div className="tutorial-actions-nav">
            {stepIndex > 0 ? <button className="secondary-button icon-only" aria-label="Atrás" onClick={back}><ArrowLeft size={15} /></button> : null}
            <button ref={nextButtonRef} className="primary-button" onClick={next}>
              {isLast ? "Finalizar" : "Siguiente"} {!isLast ? <ArrowRight size={15} /> : null}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function computeTooltipPosition(rect: Rect, placement: "bottom" | "top" | "left" | "right"): React.CSSProperties {
  const margin = 14;
  const tooltipWidth = 320;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1024;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 768;

  let top = rect.top + rect.height + margin;
  let left = rect.left;

  if (placement === "top") top = rect.top - margin;
  if (placement === "left") { top = rect.top; left = rect.left - tooltipWidth - margin; }
  if (placement === "right") { top = rect.top; left = rect.left + rect.width + margin; }

  left = Math.max(12, Math.min(left, viewportWidth - tooltipWidth - 12));
  top = Math.max(12, Math.min(top, viewportHeight - 220));

  return { top, left, width: tooltipWidth };
}
