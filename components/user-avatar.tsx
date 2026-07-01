"use client";

import { useEffect, useState } from "react";

const INITIAL_TONES = ["avatar-tone-teal", "avatar-tone-amber", "avatar-tone-slate", "avatar-tone-sage"];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase() || "?";
}

function toneForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return INITIAL_TONES[hash % INITIAL_TONES.length];
}

const SIZE_PX: Record<"sm" | "md" | "lg", number> = { sm: 26, md: 34, lg: 72 };

export function UserAvatar({
  userId,
  name,
  size = "md",
  cacheBust,
}: Readonly<{ userId?: string | null; name: string; size?: "sm" | "md" | "lg"; cacheBust?: number }>) {
  const dimension = SIZE_PX[size];
  const src = userId ? `/api/users/${userId}/avatar${cacheBust ? `?v=${cacheBust}` : ""}` : null;

  // Se precarga la imagen del lado del cliente antes de decidir qué
  // renderizar: un <img> con `onError` renderizado directamente desde HTML
  // generado en el servidor pierde el evento de error nativo si la imagen
  // falla (404 local, casi instantáneo) antes de que React termine de
  // hidratar y adjuntar el listener — los eventos "error"/"load" de <img>
  // no burbujean, así que ese error nunca llega a dispararse. Precargar con
  // `Image()` evita la carrera por completo.
  const [status, setStatus] = useState<"checking" | "ok" | "failed">(src ? "checking" : "failed");

  useEffect(() => {
    if (!src) {
      setStatus("failed");
      return;
    }
    let cancelled = false;
    setStatus("checking");
    const probe = new Image();
    probe.onload = () => { if (!cancelled) setStatus("ok"); };
    probe.onerror = () => { if (!cancelled) setStatus("failed"); };
    probe.src = src;
    return () => { cancelled = true; };
  }, [src]);

  if (status === "ok" && src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- imagen autenticada servida por nuestro propio proxy, ya precargada y verificada
      <img
        src={src}
        alt={`Foto de perfil de ${name}`}
        width={dimension}
        height={dimension}
        className="user-avatar-image"
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <span
      className={`user-avatar-initials ${toneForName(name)}`}
      style={{ width: dimension, height: dimension, fontSize: Math.max(10, dimension * 0.36) }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}
