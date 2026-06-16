import type { UserSession } from "@/lib/session";
import type { ModuleKey } from "@/lib/navigation";

export const ACTIVE_LAB_PROFILE = "EDUCATIONAL_SMALL_LAB" as const;

export type LabProfile = typeof ACTIVE_LAB_PROFILE | "CLINICAL" | "PHARMA_QC" | "INDUSTRIAL" | "CALIBRATION";

const educationalModulesByRole: Partial<Record<UserSession["role"], ModuleKey[]>> = {
  OWNER: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  LAB_ADMIN: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  HEAD_OF_LAB: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  PROFESSOR: ["dashboard", "education", "inventory", "equipment", "alerts"],
  STUDENT: ["dashboard", "education", "alerts"],
  AUDITOR: ["dashboard", "inventory", "equipment", "education", "audit"],
  VIEWER: ["dashboard", "inventory", "equipment", "education", "alerts"],
  CONSULTATION: ["dashboard", "inventory", "equipment", "education"],
};

export function getEducationalModules(role: UserSession["role"]): Set<ModuleKey> {
  return new Set(educationalModulesByRole[role] ?? ["dashboard", "education"]);
}

export function isEducationalProfile(): boolean {
  return ACTIVE_LAB_PROFILE === "EDUCATIONAL_SMALL_LAB";
}

export const defaultInventoryCategories = [
  { code: "RQ", name: "Reactivos químicos", prefix: "RQ" },
  { code: "RM", name: "Reactivos microbiológicos", prefix: "RM" },
  { code: "MAT", name: "Materiales", prefix: "MAT" },
  { code: "INS", name: "Insumos o consumibles", prefix: "INS" },
  { code: "OTR", name: "Otros", prefix: "OTR" },
] as const;
