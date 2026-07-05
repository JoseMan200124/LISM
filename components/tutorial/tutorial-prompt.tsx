"use client";

import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { pathnameToModuleKey } from "@/lib/tutorial-steps";
import { useTutorial } from "@/components/tutorial/tutorial-context";

/**
 * Banner discreto y no bloqueante que ofrece iniciar el tutorial la primera
 * vez que el usuario visita una sección con tutorial disponible y que
 * todavía no ha completado. Rechazarlo se persiste igual que completar u
 * omitir el tutorial, así no vuelve a ofrecerse en futuras sesiones.
 */
export function TutorialPrompt() {
  const pathname = usePathname();
  const { activeModule, loaded, isModuleCompleted, isPromptDismissed, dismissPromptForSession, startTutorial } = useTutorial();
  const moduleKey = pathnameToModuleKey(pathname);

  if (activeModule || !loaded || !moduleKey) return null;
  if (isModuleCompleted(moduleKey) || isPromptDismissed(moduleKey)) return null;

  return (
    <div className="tutorial-prompt" role="status">
      <Sparkles size={16} />
      <p>¿Quieres un recorrido guiado de esta sección?</p>
      <div className="tutorial-prompt-actions">
        <button className="secondary-button" onClick={() => dismissPromptForSession(moduleKey)}>No, gracias</button>
        <button className="primary-button" onClick={() => startTutorial(moduleKey)}>Mostrarme</button>
      </div>
      <button className="icon-button tutorial-prompt-close" aria-label="Cerrar" onClick={() => dismissPromptForSession(moduleKey)}><X size={14} /></button>
    </div>
  );
}
