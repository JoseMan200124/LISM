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
        <BrandLogo className="brand-lockup-light" subtitle="Laboratory Information System" priority />
        <div className="login-side-content">
          <p className="eyebrow eyebrow-light">OPERACIÓN TRAZABLE</p>
          <h1>Del ingreso de la muestra a un resultado confiable.</h1>
          <p>
            Un espacio clínico claro para coordinar recepción, análisis, control de calidad,
            inventario y reportes sin sobrecargar a tu equipo.
          </p>
          <div className="login-feature-grid">
            <div><strong>01</strong><span>Flujo guiado por muestra</span></div>
            <div><strong>02</strong><span>Trazabilidad y auditoría</span></div>
            <div><strong>03</strong><span>Alertas accionables</span></div>
            <div><strong>04</strong><span>Escalable por laboratorio</span></div>
          </div>
        </div>
        <p className="login-caption">Diseñado para equipos que necesitan precisión sin complejidad innecesaria.</p>
      </section>
      <section className="login-form-panel">
        <LoginForm />
      </section>
    </main>
  );
}
