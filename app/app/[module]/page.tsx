import { notFound } from "next/navigation";
import { ModuleView } from "@/components/module-view";
import type { ModuleKey } from "@/lib/navigation";

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
  "quality",
  "alerts",
  "reports",
  "integrations",
  "audit",
  "administration",
]);

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  if (!supportedModules.has(module as ModuleKey)) notFound();

  return <ModuleView module={module as Exclude<ModuleKey, "dashboard">} />;
}
