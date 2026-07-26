"use client";

import { useCallback, useEffect, useState } from "react";

// Piezas que comparten los seis módulos de investigación: carga de datos,
// directorio de personas y presentación de errores.

export type DirectoryUser = { id: string; full_name: string; email?: string };

export async function apiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json() as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

/** Directorio del laboratorio para los selectores de responsable o equipo. */
export function useDirectory(): DirectoryUser[] {
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  useEffect(() => {
    let active = true;
    void fetch("/api/users?scope=directory")
      .then((response) => (response.ok ? response.json() : { data: [] }))
      .catch(() => ({ data: [] }))
      .then((payload: { data?: DirectoryUser[] }) => { if (active) setUsers(payload.data ?? []); });
    return () => { active = false; };
  }, []);
  return users;
}

export type ListState<T> = {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/** Carga de una lista del módulo con estado de error y recarga manual. */
export function useResearchList<T>(url: string): ListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (response.status === 404) {
        setError("Este módulo se activa en Configuración → Perfil del laboratorio.");
        return;
      }
      if (!response.ok) {
        setError(await apiMessage(response, "No se pudo cargar la información."));
        return;
      }
      const payload = await response.json() as { data?: T[] };
      setItems(payload.data ?? []);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => { void reload(); }, [reload]);

  return { items, loading, error, reload };
}

/** Lee un parámetro de la URL (para abrir un registro concreto desde otro módulo). */
export function useQueryParam(name: string): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}

export function formatDay(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatMoment(value: unknown): string {
  if (!value) return "—";
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("es-GT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function toDateInput(value: unknown): string {
  if (!value) return "";
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : "";
}
