"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, KeyRound, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { DeveloperCredit } from "@/components/developer-credit";
import { GUEST_SCOPE_LABEL, normalizeGuestCode, type GuestScope } from "@/lib/guest-access";

// Entrada de estudiantes con el código que compartió su profesor. No crea
// cuenta: abre una sesión limitada al alcance del código y a su vigencia.

export function GuestAccessForm({ initialCode = "" }: Readonly<{ initialCode?: string }>) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [granted, setGranted] = useState<{ laboratoryName: string; grantLabel?: string; scopes: GuestScope[] } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!normalizeGuestCode(code)) {
      setError("El código debe tener el formato NXL-XXXX-XXXX.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/guest-access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, displayName, identifier: identifier || undefined }),
      });
      const payload = await response.json() as { message?: string; session?: { laboratoryName: string; grantLabel?: string; scopes: GuestScope[] } };
      if (!response.ok) throw new Error(payload.message || "No fue posible entrar con ese código.");
      setGranted(payload.session ?? null);
      // Pequeña pausa para que se lea el alcance concedido antes de entrar.
      window.setTimeout(() => { window.location.href = "/app"; }, 1200);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible entrar con ese código.");
      setLoading(false);
    }
  }

  if (granted) {
    return (
      <div className="login-card">
        <p className="eyebrow">ACCESO CONCEDIDO</p>
        <h2>{granted.laboratoryName}</h2>
        <p className="login-subtitle">{granted.grantLabel}</p>
        <ul className="guest-scope-list">
          {granted.scopes.map((scope) => <li key={scope}>{GUEST_SCOPE_LABEL[scope] ?? scope}</li>)}
        </ul>
        <p className="form-help">Entrando…</p>
      </div>
    );
  }

  return (
    <div className="login-card">
      <div className="login-mobile-brand">
        <BrandLogo compact subtitle="Acceso de invitado" priority />
      </div>
      <p className="eyebrow">ACCESO DE INVITADO</p>
      <h2>Entrar con un código</h2>
      <p className="login-subtitle">
        Si tu profesor o coordinador te compartió un código, escríbelo aquí. No necesitas crear una cuenta.
      </p>
      <form onSubmit={onSubmit} className="login-form">
        <label>
          <span>Código de acceso</span>
          <div className="input-with-icon">
            <KeyRound size={16} />
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="NXL-ABCD-2345"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
        </label>
        <label>
          <span>Tu nombre completo</span>
          <div className="input-with-icon">
            <UserRound size={16} />
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={3} autoComplete="name" />
          </div>
        </label>
        <label>
          <span>Carné o identificación <small>(opcional)</small></span>
          <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="off" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button login-button" type="submit" disabled={loading}>
          {loading ? "Verificando…" : "Entrar como invitado"}<ArrowRight size={16} />
        </button>
      </form>
      <p className="login-footer">
        Tu nombre queda registrado en cada consumo que anotes, igual que el de cualquier usuario del laboratorio.
      </p>
      <p className="login-footer">¿Tienes cuenta? <a href="/login">Iniciar sesión</a></p>
      <DeveloperCredit variant="compact" className="login-developer-credit" />
    </div>
  );
}
