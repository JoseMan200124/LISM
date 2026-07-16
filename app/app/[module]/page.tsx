import { notFound, redirect } from "next/navigation";
import { ModuleView } from "@/components/module-view";
import { canAccessModule } from "@/lib/authorization";
import { getSession } from "@/lib/session";
import type { ModuleKey } from "@/lib/navigation";
import { isEducationalProfile } from "@/lib/lab-profile";

const supportedModules = new Set<ModuleKey>([
  "workbench",
  "accessioning",
  "orders",
  "results",
  "patients",
  "providers",
  "catalog",
  "inventory",
  "equipment",
  "education",
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

const educationalModules = new Set<ModuleKey>(["inventory", "equipment", "education", "alerts", "incidents", "audit", "configuration", "administration", "billing"]);

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { module } = await params;
  if (!supportedModules.has(module as ModuleKey)) notFound();
  if (isEducationalProfile(session.profileCode) && !educationalModules.has(module as ModuleKey)) redirect("/app");
  if (!canAccessModule(session, module as ModuleKey)) redirect("/app");

  return <ModuleView module={module as Exclude<ModuleKey, "dashboard">} session={session} />;
}
