"use client";

import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { pathnameToModuleKey, tutorialsByModule } from "@/lib/tutorial-steps";
import { useTutorial } from "@/components/tutorial/tutorial-context";

/**
 * Botón de la barra lateral que reinicia el tutorial de la sección actual
 * bajo demanda, sin importar si ya se completó antes.
 */
export function TutorialTriggerButton() {
  const pathname = usePathname();
  const { startTutorial } = useTutorial();
  const moduleKey = pathnameToModuleKey(pathname) ?? "dashboard";
  if (!tutorialsByModule[moduleKey]) return null;

  return (
    <button className="sidebar-link" onClick={() => startTutorial(moduleKey)}>
      <Sparkles size={17} />
      <span>Tutorial guiado</span>
    </button>
  );
}
