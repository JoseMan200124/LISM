import { notFound, redirect } from "next/navigation";
import { ModuleView } from "@/components/module-view";
import { canAccessModule } from "@/lib/authorization";
import { getSession, type UserSession } from "@/lib/session";
import { educationalNavigationByRole, type ModuleKey } from "@/lib/navigation";
import { isEducationalProfile, isResearchModule, isResearchProfile, researchProfileModules } from "@/lib/lab-profile";

const supportedModules = new Set<ModuleKey>([
  "workbench",
  "accessioning",
  "orders",
  "results",
  "patients",
  "providers",
  "catalog",
  "inventory",
  "controlled",
  "equipment",
  "education",
  "projects",
  "protocols",
  "samples",
  "biobank",
  "notebook",
  "library",
  "purchasing",
  "messages",
  "quality",
  "documents",
  "logbooks",
  "training",
  "alerts",
  "incidents",
  "reports",
  "integrations",
  "audit",
  "compliance",
  "configuration",
  "administration",
  "billing",
]);

const educationalModules = new Set<ModuleKey>(["inventory", "controlled", "equipment", "education", "purchasing", "messages", "alerts", "incidents", "audit", "integrations", "configuration", "administration", "billing"]);

// Roles cuyo menú en educationalNavigationByRole es el límite real de lo que
// deben poder abrir en el perfil educativo, no solo una sugerencia de UI.
// LAB_ADMIN, OWNER y HEAD_OF_LAB quedan fuera a propósito: siguen dependiendo
// únicamente de canAccessModule (matriz de permisos), que ya les da acceso
// total. Sin este límite, un Estudiante o Analista podía escribir la URL de
// un módulo que su menú no muestra (p. ej. /app/inventory) y entrar de
// todas formas, porque su permiso base de "ver" (necesario para el flujo de
// escaneo de QR) también abre, sin querer, la pantalla completa de gestión.
const rolesScopedToEducationalNav = new Set<UserSession["role"]>(["STUDENT", "PROFESSOR", "AUDITOR", "ANALYST", "ASSISTANT", "CONSULTATION"]);

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { module } = await params;
  if (!supportedModules.has(module as ModuleKey)) notFound();

  const moduleKey = module as ModuleKey;
  const research = isResearchProfile(session.profileCode);
  // Los módulos de investigación existen siempre en el código pero solo se
  // abren cuando el laboratorio activa ese perfil desde Configuración.
  if (isResearchModule(moduleKey) && !research) redirect("/app");
  if (research && !researchProfileModules.has(moduleKey)) redirect("/app");
  if (!research && isEducationalProfile(session.profileCode)) {
    if (!educationalModules.has(moduleKey)) redirect("/app");
    // Mensajes queda fuera de este límite por diseño: está disponible para
    // cualquier sesión no invitada, independientemente del rol.
    if (moduleKey !== "messages" && rolesScopedToEducationalNav.has(session.role)) {
      const roleNav = educationalNavigationByRole[session.role] ?? [];
      const allowedKeys = new Set<ModuleKey>(roleNav.flatMap((group) => group.items.map((item) => item.key)));
      if (!allowedKeys.has(moduleKey)) redirect("/app");
    }
  }
  if (!canAccessModule(session, moduleKey)) redirect("/app");

  return <ModuleView module={module as Exclude<ModuleKey, "dashboard">} session={session} />;
}
