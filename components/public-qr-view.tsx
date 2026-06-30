"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, MapPin, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import type { PublicQrProfile } from "@/lib/qr-security";

export function PublicQrView({ token }: Readonly<{ token: string }>) {
  const [code, setCode] = useState("");
  const [profile, setProfile] = useState<PublicQrProfile | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/public/qr/${encodeURIComponent(token)}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = await response.json() as { message?: string; data?: PublicQrProfile };
      if (!response.ok || !payload.data) throw new Error(payload.message || "No fue posible validar el acceso.");
      setProfile(payload.data);
      setCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible validar el acceso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="public-qr-page">
      <section className="public-qr-shell">
        <header className="public-qr-header">
          <BrandLogo compact subtitle="Consulta segura de etiqueta" priority />
          <span><ShieldCheck size={15} /> Acceso protegido</span>
        </header>
        {!profile ? (
          <div className="public-qr-gate">
            <span className="public-qr-icon"><QrCode size={28} /></span>
            <p className="eyebrow">ETIQUETA NEXALAB</p>
            <h1>Ingresa el código temporal</h1>
            <p>El QR no contiene información del reactivo o del equipo. Solicita a un usuario autorizado el código de seis dígitos generado desde NexaLab. El código vence y solo funciona una vez.</p>
            <form className="public-qr-form" onSubmit={submit}>
              <label>
                <span>Código de acceso de un solo uso</span>
                <input
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  autoFocus
                  aria-describedby={error ? "qr-access-error" : "qr-access-hint"}
                  aria-invalid={error ? true : undefined}
                />
              </label>
              {error ? (
                <p className="form-error" id="qr-access-error" role="alert"><TriangleAlert size={14} /> {error}</p>
              ) : (
                <span id="qr-access-hint" className="sr-only">Ingresa los 6 dígitos del código temporal entregado por un usuario autorizado.</span>
              )}
              <button className="primary-button" disabled={loading || code.length !== 6}>{loading ? "Validando…" : "Consultar etiqueta"}</button>
            </form>
            <div className="public-qr-note"><Clock3 size={15} /><span>Por seguridad, al recargar la página deberás solicitar un código nuevo.</span></div>
          </div>
        ) : (
          <div className="public-qr-profile">
            <div className="public-qr-profile-heading">
              <span className="public-qr-icon"><CheckCircle2 size={27} /></span>
              <div><p className="eyebrow">CONSULTA AUTORIZADA</p><h1>{profile.name}</h1><strong>{profile.labelCode}</strong></div>
            </div>
            <div className="public-qr-status"><span>{profile.status}</span><p><MapPin size={15} /> {profile.location}</p><small>Responsable: {profile.responsible}</small></div>
            <section className="public-qr-summary">{profile.summary.map((item) => <article key={item.label}><small>{item.label}</small><strong>{item.value}</strong></article>)}</section>
            <section className="public-qr-history"><h2>Historial reciente</h2>{profile.history.length ? profile.history.map((item) => <article key={`${item.title}-${item.when}`}><span /><div><strong>{item.title}</strong><p>{item.detail}</p><small>{item.when}</small></div></article>) : <p>Este recurso todavía no registra eventos visibles.</p>}</section>
            <section className="public-qr-actions"><h2>Acciones disponibles dentro de NexaLab</h2><div>{profile.allowedActions.map((action) => <span key={action}>{action}</span>)}</div></section>
            <button className="secondary-button public-qr-close" onClick={() => setProfile(null)}>Cerrar consulta</button>
          </div>
        )}
      </section>
    </main>
  );
}
