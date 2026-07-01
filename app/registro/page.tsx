import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { SignupForm } from "@/components/signup-form";
import { BrandLogo } from "@/components/brand-logo";

export default async function RegisterPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main className="login-page">
      <section className="login-side-panel">
        <BrandLogo className="brand-lockup-light" subtitle="Laboratorio Educativo" priority />
        <div className="login-side-content">
          <p className="eyebrow eyebrow-light">EMPIEZA HOY</p>
          <h1>Un mes gratis para conocer NexaLab.</h1>
          <p>
            Crea tu cuenta, elige tu plan y organiza inventario, equipos, prácticas y reservas
            desde el primer día.
          </p>
          <div className="login-feature-grid">
            <div><strong>01</strong><span>Inventario y equipos con QR seguro</span></div>
            <div><strong>02</strong><span>Programa de prácticas y reservas</span></div>
            <div><strong>03</strong><span>Alertas y vencimientos bajo control</span></div>
            <div><strong>04</strong><span>Trazabilidad y auditoría completa</span></div>
          </div>
        </div>
        <p className="login-caption">Sin costo hoy. Cancela cuando quieras durante el mes de prueba.</p>
      </section>
      <section className="login-form-panel">
        <Suspense fallback={<p className="login-subtitle">Cargando…</p>}>
          <SignupForm />
        </Suspense>
      </section>
    </main>
  );
}
