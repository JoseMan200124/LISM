"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Building2, Eye, EyeOff, LockKeyhole, Mail, User } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { formatPlanAmount } from "@/lib/billing-plans";

type PublicPlan = {
  id: string;
  name: string;
  description: string;
  price_monthly_cents: number;
  currency: string;
};

export function SignupForm() {
  const searchParams = useSearchParams();
  const planId = searchParams.get("plan");

  const [plan, setPlan] = useState<PublicPlan | null>(null);
  const [planError, setPlanError] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accountCreatedButPaymentFailed, setAccountCreatedButPaymentFailed] = useState(false);

  useEffect(() => {
    if (!planId) {
      setPlanError("Selecciona un plan desde la sección de precios antes de crear tu cuenta.");
      return;
    }
    let cancelled = false;
    fetch("/api/billing/plans")
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("request failed"))))
      .then((payload: { data?: PublicPlan[] }) => {
        if (cancelled) return;
        const found = (payload.data ?? []).find((candidate) => candidate.id === planId);
        if (found) setPlan(found);
        else setPlanError("El plan seleccionado ya no está disponible.");
      })
      .catch(() => {
        if (!cancelled) setPlanError("No se pudo verificar el plan seleccionado. Intenta de nuevo.");
      });
    return () => { cancelled = true; };
  }, [planId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAccountCreatedButPaymentFailed(false);

    if (!planId) {
      setError("Selecciona un plan antes de continuar.");
      return;
    }
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationName, fullName, email, password, planId }),
      });
      const payload = await response.json() as { message?: string; data?: { checkoutUrl?: string; accountCreated?: boolean } };

      if (!response.ok) {
        if (payload.data?.accountCreated) {
          setAccountCreatedButPaymentFailed(true);
          setError(payload.message || "Tu cuenta se creó, pero no se pudo iniciar el pago. Inicia sesión y reintenta desde Facturación.");
        } else {
          setError(payload.message || "No se pudo crear la cuenta.");
        }
        return;
      }

      if (payload.data?.checkoutUrl) {
        window.location.href = payload.data.checkoutUrl;
      } else {
        window.location.href = "/app";
      }
    } catch {
      setError("No se pudo crear la cuenta. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-mobile-brand">
        <BrandLogo compact subtitle="Laboratorio Educativo" priority />
      </div>
      <p className="eyebrow">CREAR CUENTA</p>
      <h2>Empieza tu laboratorio en NexaLab</h2>
      <p className="login-subtitle">Un mes gratis de prueba. Sin costo hoy.</p>

      {plan ? (
        <div className="signup-plan-summary">
          <div>
            <strong>{plan.name}</strong>
            <span>{plan.description}</span>
          </div>
          <div className="signup-plan-price">
            <strong>{formatPlanAmount(plan.price_monthly_cents, plan.currency)}</strong>
            <a href="/#precios">Cambiar plan</a>
          </div>
        </div>
      ) : planError ? (
        <div className="form-error">{planError} <a href="/#precios">Ver planes</a></div>
      ) : (
        <p className="login-subtitle">Cargando plan…</p>
      )}

      <form onSubmit={onSubmit} className="login-form">
        <label>
          <span>Nombre de la institución</span>
          <div className="input-with-icon">
            <Building2 size={16} />
            <input value={organizationName} onChange={(event) => setOrganizationName(event.target.value)} type="text" required autoComplete="organization" placeholder="Colegio o universidad" />
          </div>
        </label>
        <label>
          <span>Tu nombre completo</span>
          <div className="input-with-icon">
            <User size={16} />
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} type="text" required autoComplete="name" />
          </div>
        </label>
        <label>
          <span>Correo electrónico</span>
          <div className="input-with-icon">
            <Mail size={16} />
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required autoComplete="email" />
          </div>
        </label>
        <label>
          <span>Contraseña</span>
          <div className="input-with-icon">
            <LockKeyhole size={16} />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <label>
          <span>Confirmar contraseña</span>
          <div className="input-with-icon">
            <LockKeyhole size={16} />
            <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? "text" : "password"} required minLength={8} autoComplete="new-password" />
          </div>
        </label>
        {error ? (
          <p className="form-error">
            {error}
            {accountCreatedButPaymentFailed ? <> <a href="/login">Iniciar sesión</a></> : null}
          </p>
        ) : null}
        <button className="primary-button login-button" type="submit" disabled={loading || !plan}>
          {loading ? "Creando cuenta…" : "Crear cuenta y continuar al pago"}<ArrowRight size={16} />
        </button>
      </form>
      <p className="login-footer">¿Ya tienes cuenta? <a href="/login">Inicia sesión</a></p>
      <p className="login-footer">NexaLab · Entorno protegido · v0.1</p>
    </div>
  );
}
