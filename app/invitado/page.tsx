import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { GuestAccessForm } from "@/components/guest-access-form";
import { BrandLogo } from "@/components/brand-logo";
import { PublicThemeToggle } from "@/components/public-theme-toggle";

export const metadata: Metadata = {
  title: "Acceso de invitado",
  robots: { index: false, follow: true },
};

export default async function GuestAccessPage({ searchParams }: { searchParams: Promise<{ codigo?: string }> }) {
  const session = await getSession();
  if (session) redirect("/app");
  const { codigo } = await searchParams;

  return (
    <main className="login-page">
      <PublicThemeToggle className="login-theme-toggle" />
      <section className="login-side-panel">
        <BrandLogo className="brand-lockup-light" subtitle="Acceso de invitado" priority />
        <div className="login-side-content">
          <p className="eyebrow eyebrow-light">ENTRADA TEMPORAL</p>
          <h1>Entra al laboratorio con el código de tu curso.</h1>
          <p>
            El profesor decide cuánto dura el acceso y qué se puede consultar o registrar.
            No necesitas cuenta ni contraseña.
          </p>
          <div className="login-feature-grid">
            <div><strong>01</strong><span>Consulta el inventario y su ficha de seguridad</span></div>
            <div><strong>02</strong><span>Revisa los equipos disponibles</span></div>
            <div><strong>03</strong><span>Registra el consumo de la práctica si te fue permitido</span></div>
            <div><strong>04</strong><span>Todo queda registrado con tu nombre</span></div>
          </div>
        </div>
        <p className="login-caption">El acceso caduca automáticamente al terminar la vigencia que definió tu profesor.</p>
      </section>
      <section className="login-form-panel">
        <GuestAccessForm initialCode={codigo ?? ""} />
      </section>
    </main>
  );
}
