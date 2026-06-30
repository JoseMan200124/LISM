import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "@/components/login-form";
import { BrandLogo } from "@/components/brand-logo";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/app");

  return (
    <main className="login-page">
      <section className="login-side-panel">
        <BrandLogo className="brand-lockup-light" subtitle="Laboratorio Educativo" priority />
        <div className="login-side-content">
          <p className="eyebrow eyebrow-light">OPERACIÓN TRAZABLE</p>
          <h1>Del inventario a una práctica bien ejecutada.</h1>
          <p>
            Un espacio claro para coordinar inventario, equipos, prácticas y reservas de tu
            laboratorio educativo sin sobrecargar a tu equipo.
          </p>
          <div className="login-feature-grid">
            <div><strong>01</strong><span>Inventario y equipos con QR seguro</span></div>
            <div><strong>02</strong><span>Programa de prácticas y reservas</span></div>
            <div><strong>03</strong><span>Alertas y vencimientos bajo control</span></div>
            <div><strong>04</strong><span>Trazabilidad y auditoría completa</span></div>
          </div>
        </div>
        <p className="login-caption">Diseñado para colegios, universidades y laboratorios escolares que necesitan precisión sin complejidad innecesaria.</p>
      </section>
      <section className="login-form-panel">
        <LoginForm />
      </section>
    </main>
  );
}
