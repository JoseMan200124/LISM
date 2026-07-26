import type { UserSession } from "@/lib/session";
import type { ModuleKey } from "@/lib/navigation";

export const DEMO_LAB_PROFILE = "EDUCATIONAL_SMALL_LAB" as const;
export const RESEARCH_LAB_PROFILE = "RESEARCH_LAB" as const;

export type LabProfile =
  | typeof DEMO_LAB_PROFILE
  | typeof RESEARCH_LAB_PROFILE
  | "CLINICAL"
  | "PHARMA_QC"
  | "INDUSTRIAL"
  | "CALIBRATION";

export function resolveLabProfile(profileCode?: string | null): LabProfile {
  if (
    profileCode === "CLINICAL" ||
    profileCode === "PHARMA_QC" ||
    profileCode === "INDUSTRIAL" ||
    profileCode === "CALIBRATION" ||
    profileCode === RESEARCH_LAB_PROFILE
  ) {
    return profileCode;
  }
  return DEMO_LAB_PROFILE;
}

// Perfiles que el laboratorio puede elegir desde Configuración. Cambiar el
// perfil no borra datos: solo cambia qué módulos se muestran.
export const LAB_PROFILE_OPTIONS: ReadonlyArray<{ code: LabProfile; label: string; description: string }> = [
  {
    code: DEMO_LAB_PROFILE,
    label: "Laboratorio educativo",
    description: "Colegios, universidades y laboratorios pequeños: inventario, equipos, prácticas y reservas.",
  },
  {
    code: RESEARCH_LAB_PROFILE,
    label: "Laboratorio de investigación",
    description: "Trabajo por proyecto o por muestra: proyectos, protocolos, muestras, biobancos, cuaderno electrónico y gestión documental.",
  },
  {
    code: "CLINICAL",
    label: "Laboratorio clínico",
    description: "Pacientes, órdenes, resultados y liberación con firma.",
  },
  {
    code: "PHARMA_QC",
    label: "Control de calidad farmacéutico",
    description: "Lotes, especificaciones, OOS/OOT, CAPA y documentación controlada.",
  },
];

const educationalModulesByRole: Partial<Record<UserSession["role"], ModuleKey[]>> = {
  OWNER: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  LAB_ADMIN: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  HEAD_OF_LAB: ["dashboard", "inventory", "equipment", "education", "alerts", "administration", "audit", "configuration"],
  PROFESSOR: ["dashboard", "education", "inventory", "equipment", "alerts"],
  STUDENT: ["dashboard", "education"],
  AUDITOR: ["dashboard", "inventory", "equipment", "education", "audit"],
  VIEWER: ["dashboard", "inventory", "equipment", "education", "alerts"],
  CONSULTATION: ["dashboard", "inventory", "equipment", "education"],
  // El invitado ve como mucho esto; el alcance real de su código lo acota
  // después canAccessModule con los permisos que trae la sesión.
  GUEST: ["dashboard", "inventory", "equipment", "education"],
};

export function getEducationalModules(role: UserSession["role"]): Set<ModuleKey> {
  return new Set(educationalModulesByRole[role] ?? ["dashboard", "education"]);
}

export function isEducationalProfile(profileCode?: string | null): boolean {
  return resolveLabProfile(profileCode) === DEMO_LAB_PROFILE;
}

export function isResearchProfile(profileCode?: string | null): boolean {
  return resolveLabProfile(profileCode) === RESEARCH_LAB_PROFILE;
}

// Módulos propios del laboratorio de investigación. Existen siempre en el
// código, pero solo se muestran cuando el laboratorio elige este perfil en
// Configuración: en el resto de perfiles quedan ocultos.
export const researchModules: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  "projects",
  "protocols",
  "samples",
  "biobank",
  "notebook",
  "library",
]);

/** Módulos disponibles con el perfil de investigación activo. */
export const researchProfileModules: ReadonlySet<ModuleKey> = new Set<ModuleKey>([
  ...researchModules,
  "dashboard",
  "inventory",
  "controlled",
  "equipment",
  "purchasing",
  "messages",
  "alerts",
  "incidents",
  "audit",
  "configuration",
  "administration",
  "billing",
]);

export function isResearchModule(moduleKey: ModuleKey): boolean {
  return researchModules.has(moduleKey);
}

export const defaultInventoryCategories = [
  { code: "RQ", name: "Reactivos químicos", prefix: "RQ" },
  { code: "RM", name: "Reactivos microbiológicos", prefix: "RM" },
  { code: "MAT", name: "Materiales", prefix: "MAT" },
  { code: "INS", name: "Insumos o consumibles", prefix: "INS" },
  { code: "OTR", name: "Otros", prefix: "OTR" },
] as const;
