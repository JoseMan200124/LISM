"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, FlaskConical, LockKeyhole, Mail } from "lucide-react";

export function LoginForm() {
  const [email, setEmail] = useState("admin@nexalab.local");
  const [password, setPassword] = useState("Demo1234!");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "No fue posible iniciar sesión.");

      window.location.href = "/app";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-card">
      <div className="login-mobile-brand">
        <span className="brand-symbol" aria-hidden="true"><FlaskConical /></span>
        <div><strong>NexaLab</strong><span>LIS</span></div>
      </div>
      <p className="eyebrow">ACCESO SEGURO</p>
      <h2>Bienvenido de nuevo</h2>
      <p className="login-subtitle">Ingresa a tu espacio de laboratorio.</p>
      <form onSubmit={onSubmit} className="login-form">
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
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} required autoComplete="current-password" />
            <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>
        <div className="login-form-row">
          <label className="checkbox-line"><input type="checkbox" /> <span>Recordar dispositivo</span></label>
          <button type="button" className="text-button">Recuperar acceso</button>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button login-button" type="submit" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}<ArrowRight size={16} />
        </button>
      </form>
      <div className="demo-callout">
        <strong>Modo demostración</strong>
        <span>Usa las credenciales precargadas para explorar el MVP.</span>
      </div>
      <p className="login-footer">NexaLab · Entorno protegido · v0.1</p>
    </div>
  );
}
