import { notFound, redirect } from "next/navigation";
import { ModuleView } from "@/components/module-view";
import { canAccessModule } from "@/lib/authorization";
import { getSession } from "@/lib/session";
import type { ModuleKey } from "@/lib/navigation";
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

const educationalModules = new Set<ModuleKey>(["inventory", "controlled", "equipment", "education", "purchasing", "alerts", "incidents", "audit", "configuration", "administration", "billing"]);

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
  if (!research && isEducationalProfile(session.profileCode) && !educationalModules.has(moduleKey)) redirect("/app");
  if (!canAccessModule(session, moduleKey)) redirect("/app");

  return <ModuleView module={module as Exclude<ModuleKey, "dashboard">} session={session} />;
}
