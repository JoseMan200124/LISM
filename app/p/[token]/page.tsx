import { getSql, hasDatabase } from "@/lib/db";
import { verifyPracticeShareToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Borrador", PLANNED: "Planificada", PREPARING: "En preparación", READY: "Lista", EXECUTED: "Ejecutada", CLOSED: "Cerrada", CANCELLED: "Cancelada" };

function fmt(value: unknown): string {
  if (!value) return "—";
  try { return new Date(String(value)).toLocaleString("es-GT", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return String(value); }
}

export default async function SharedPracticePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = await verifyPracticeShareToken(token);

  if (!payload || !hasDatabase()) {
    return (
      <main className="share-page">
        <section className="share-card">
          <p className="eyebrow">NEXALAB</p>
          <h1>Enlace no válido</h1>
          <p>Este enlace de práctica no es válido o ya expiró. Solicita uno nuevo a tu docente.</p>
        </section>
      </main>
    );
  }

  const sql = getSql();
  const rows = await sql`
    SELECT ep.practice_code, ep.title, ep.course_name, ep.starts_at, ep.ends_at, ep.instructions, ep.status,
      u.full_name AS teacher_name
    FROM educational_practices ep
    LEFT JOIN users u ON u.id = ep.teacher_user_id
    WHERE ep.id = ${payload.practiceId} AND ep.laboratory_id = ${payload.laboratoryId} LIMIT 1
  `;
  const practice = rows[0] as Record<string, unknown> | undefined;

  if (!practice) {
    return (
      <main className="share-page">
        <section className="share-card">
          <p className="eyebrow">NEXALAB</p>
          <h1>Práctica no encontrada</h1>
          <p>La práctica compartida ya no está disponible.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="share-page">
      <section className="share-card">
        <p className="eyebrow">NEXALAB · PRÁCTICA</p>
        <h1>{String(practice.title)}</h1>
        <p className="share-code">{String(practice.practice_code)}</p>
        <dl className="share-meta">
          <div><dt>Curso</dt><dd>{String(practice.course_name ?? "—")}</dd></div>
          <div><dt>Responsable</dt><dd>{String(practice.teacher_name ?? "—")}</dd></div>
          <div><dt>Inicio</dt><dd>{fmt(practice.starts_at)}</dd></div>
          <div><dt>Fin</dt><dd>{fmt(practice.ends_at)}</dd></div>
          <div><dt>Estado</dt><dd>{STATUS_LABEL[String(practice.status)] ?? String(practice.status)}</dd></div>
        </dl>
        {practice.instructions ? (
          <div className="share-instructions">
            <h2>Instrucciones</h2>
            <p>{String(practice.instructions)}</p>
          </div>
        ) : null}
        <p className="share-foot">Vista de solo lectura compartida por tu laboratorio educativo.</p>
      </section>
    </main>
  );
}
