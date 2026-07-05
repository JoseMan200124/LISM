"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ModuleKey } from "@/lib/navigation";
import { tutorialsByModule } from "@/lib/tutorial-steps";

type TutorialCompletionState = Record<string, { completedAt: string; version: number }>;

type TutorialContextValue = {
  activeModule: ModuleKey | null;
  stepIndex: number;
  startTutorial: (moduleKey: ModuleKey) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  close: () => void;
  isModuleCompleted: (moduleKey: ModuleKey) => boolean;
  isPromptDismissed: (moduleKey: ModuleKey) => boolean;
  dismissPromptForSession: (moduleKey: ModuleKey) => void;
  loaded: boolean;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

export function useTutorial(): TutorialContextValue {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial debe usarse dentro de TutorialProvider.");
  return ctx;
}

export function TutorialProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [completion, setCompletion] = useState<TutorialCompletionState>({});
  const [loaded, setLoaded] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleKey | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissedThisSession, setDismissedThisSession] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me/tutorial")
      .then((res) => (res.ok ? res.json() : { data: {} }))
      .then((payload: { data?: TutorialCompletionState }) => {
        if (!cancelled) setCompletion(payload.data ?? {});
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const startTutorial = useCallback((moduleKey: ModuleKey) => {
    if (!tutorialsByModule[moduleKey]) return;
    setActiveModule(moduleKey);
    setStepIndex(0);
  }, []);

  const persistCompletion = useCallback(async (moduleKey: ModuleKey) => {
    const definition = tutorialsByModule[moduleKey];
    if (!definition) return;
    setCompletion((prev) => ({ ...prev, [moduleKey]: { completedAt: new Date().toISOString(), version: definition.version } }));
    try {
      await fetch("/api/users/me/tutorial", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleKey, version: definition.version }),
      });
    } catch {
      // El estado local ya se actualizó; si falla la persistencia el
      // tutorial simplemente podría re-ofrecerse en una futura sesión.
    }
  }, []);

  const next = useCallback(() => {
    if (!activeModule) return;
    const definition = tutorialsByModule[activeModule];
    if (!definition) return;
    if (stepIndex + 1 >= definition.steps.length) {
      void persistCompletion(activeModule);
      setActiveModule(null);
      return;
    }
    setStepIndex((i) => i + 1);
  }, [activeModule, stepIndex, persistCompletion]);

  const back = useCallback(() => {
    setStepIndex((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => {
    if (activeModule) void persistCompletion(activeModule);
    setActiveModule(null);
  }, [activeModule, persistCompletion]);

  const close = useCallback(() => {
    if (activeModule) void persistCompletion(activeModule);
    setActiveModule(null);
  }, [activeModule, persistCompletion]);

  const isModuleCompleted = useCallback((moduleKey: ModuleKey) => {
    const definition = tutorialsByModule[moduleKey];
    const state = completion[moduleKey];
    if (!definition || !state) return false;
    return state.version >= definition.version;
  }, [completion]);

  const isPromptDismissed = useCallback((moduleKey: ModuleKey) => dismissedThisSession.has(moduleKey), [dismissedThisSession]);

  const dismissPromptForSession = useCallback((moduleKey: ModuleKey) => {
    // "No, gracias" se persiste igual que completar/omitir el tutorial (se
    // guarda en users.tutorial_state) — así el banner no vuelve a
    // aparecer en próximas visitas/sesiones, no solo en la pestaña actual.
    setDismissedThisSession((prev) => new Set(prev).add(moduleKey));
    void persistCompletion(moduleKey);
  }, [persistCompletion]);

  const value = useMemo<TutorialContextValue>(() => ({
    activeModule, stepIndex, startTutorial, next, back, skip, close,
    isModuleCompleted, isPromptDismissed, dismissPromptForSession, loaded,
  }), [activeModule, stepIndex, startTutorial, next, back, skip, close, isModuleCompleted, isPromptDismissed, dismissPromptForSession, loaded]);

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}
