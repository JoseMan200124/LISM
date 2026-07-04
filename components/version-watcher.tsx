"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DISMISS_KEY = "nexalab-update-dismissed";
const CHUNK_ERROR_PATTERN = /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module/i;

async function fetchVersion(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as { version?: string };
    return payload.version ?? null;
  } catch {
    return null;
  }
}

export function VersionWatcher({ initialVersion }: Readonly<{ initialVersion: string }>) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);

    let cancelled = false;

    async function check() {
      const latest = await fetchVersion();
      if (!cancelled && latest && latest !== initialVersion) setUpdateAvailable(true);
    }

    void check();
    const interval = window.setInterval(() => void check(), CHECK_INTERVAL_MS);

    function handleVisibility() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", handleVisibility);

    function handlePossibleChunkError(message: string) {
      if (CHUNK_ERROR_PATTERN.test(message)) window.location.reload();
    }
    function handleError(event: ErrorEvent) {
      handlePossibleChunkError(event.message ?? "");
    }
    function handleRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason ?? "");
      handlePossibleChunkError(message);
    }
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [initialVersion]);

  if (!updateAvailable || dismissed) return null;

  return (
    <div className="version-update-banner" role="status">
      <span>Hay una actualización disponible.</span>
      <button
        className="version-update-refresh"
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={13} /> Actualizar ahora
      </button>
      <button
        aria-label="Cerrar aviso"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
