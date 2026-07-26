// Lógica y catálogos del perfil "Laboratorio de investigación".
//
// Vive aparte de las rutas para poder probarla sin base de datos y para que la
// web y la app móvil usen exactamente las mismas etiquetas, estados y reglas.

// ─── Proyectos ──────────────────────────────────────────────────────────────

export const PROJECT_STATUSES = ["DRAFT", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  DRAFT: "Borrador",
  ACTIVE: "En ejecución",
  ON_HOLD: "En pausa",
  COMPLETED: "Finalizado",
  CANCELLED: "Cancelado",
};

export const PROJECT_ROLES = ["PI", "CO_INVESTIGATOR", "RESEARCHER", "TECHNICIAN", "STUDENT", "COLLABORATOR"] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  PI: "Investigador principal",
  CO_INVESTIGATOR: "Coinvestigador",
  RESEARCHER: "Investigador",
  TECHNICIAN: "Técnico",
  STUDENT: "Estudiante o tesista",
  COLLABORATOR: "Colaborador externo",
};

export const MILESTONE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "DELAYED", "CANCELLED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  PLANNED: "Planificado",
  IN_PROGRESS: "En curso",
  DONE: "Completado",
  DELAYED: "Retrasado",
  CANCELLED: "Cancelado",
};

export const PROJECT_LINK_TYPES = ["PROTOCOL", "SAMPLE", "EQUIPMENT", "INVENTORY_ITEM", "BIOBANK_ENTRY", "NOTEBOOK", "DOCUMENT"] as const;
export type ProjectLinkType = (typeof PROJECT_LINK_TYPES)[number];

export const PROJECT_LINK_LABEL: Record<ProjectLinkType, string> = {
  PROTOCOL: "Protocolo",
  SAMPLE: "Muestra",
  EQUIPMENT: "Equipo",
  INVENTORY_ITEM: "Reactivo o insumo",
  BIOBANK_ENTRY: "Biobanco",
  NOTEBOOK: "Cuaderno",
  DOCUMENT: "Documento",
};

// ─── Protocolos ─────────────────────────────────────────────────────────────

export const PROTOCOL_KINDS = ["SOP", "RESEARCH_PROTOCOL", "METHOD", "SAFETY"] as const;
export type ProtocolKind = (typeof PROTOCOL_KINDS)[number];

export const PROTOCOL_KIND_LABEL: Record<ProtocolKind, string> = {
  SOP: "SOP institucional",
  RESEARCH_PROTOCOL: "Protocolo de investigación",
  METHOD: "Método analítico",
  SAFETY: "Procedimiento de seguridad",
};

export const PROTOCOL_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "ARCHIVED"] as const;
export type ProtocolStatus = (typeof PROTOCOL_STATUSES)[number];

export const PROTOCOL_STATUS_LABEL: Record<ProtocolStatus, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Aprobado",
  ARCHIVED: "Archivado",
};

export const VERSION_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  APPROVED: "Vigente",
  SUPERSEDED: "Reemplazada",
};

// ─── Muestras ───────────────────────────────────────────────────────────────

export const SAMPLE_TYPES = ["BIOLOGICAL", "MICROBIOLOGICAL", "ENVIRONMENTAL", "BIOTECHNOLOGICAL", "ZOOTECHNICAL_BOTANICAL"] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export const SAMPLE_TYPE_LABEL: Record<SampleType, string> = {
  BIOLOGICAL: "Biológica",
  MICROBIOLOGICAL: "Microbiológica",
  ENVIRONMENTAL: "Ambiental",
  BIOTECHNOLOGICAL: "Biotecnológica",
  ZOOTECHNICAL_BOTANICAL: "Zootecnia o botánica",
};

export const SAMPLE_STATUSES = [
  "REGISTERED", "PENDING_ANALYSIS", "IN_ANALYSIS", "ANALYZED", "PENDING_REPORT", "REPORTED", "STORED", "DISCARDED",
] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

export const SAMPLE_STATUS_LABEL: Record<SampleStatus, string> = {
  REGISTERED: "Ingresada",
  PENDING_ANALYSIS: "Por analizar",
  IN_ANALYSIS: "En análisis",
  ANALYZED: "Analizada",
  PENDING_REPORT: "Por reportar",
  REPORTED: "Analizada y reportada",
  STORED: "En biobanco",
  DISCARDED: "Descartada",
};

export type SampleField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  options?: readonly string[];
  hint?: string;
};

/**
 * Formulario dinámico: el tipo de muestra decide qué secciones aparecen.
 * Ninguno de estos campos es obligatorio en la base; lo que se muestra depende
 * del tipo elegido y lo que se llene se guarda en `type_details`.
 */
export const SAMPLE_TYPE_FIELDS: Record<SampleType, readonly SampleField[]> = {
  BIOLOGICAL: [
    { key: "matrix", label: "Matriz biológica", type: "select", options: ["Sangre total", "Suero", "Plasma", "Orina", "Tejido", "Saliva", "Heces", "Líquido cefalorraquídeo", "Otro"] },
    { key: "volume", label: "Volumen o cantidad", type: "text", hint: "Ej. 5 mL" },
    { key: "container", label: "Recipiente", type: "text", hint: "Tubo EDTA, criovial…" },
    { key: "preservative", label: "Anticoagulante o conservante", type: "text" },
    { key: "coldChain", label: "Cadena de frío", type: "select", options: ["No aplica", "Refrigerada 2-8 °C", "Congelada -20 °C", "Ultracongelada -80 °C", "Nitrógeno líquido"] },
  ],
  MICROBIOLOGICAL: [
    { key: "organism", label: "Microorganismo o sospecha", type: "text" },
    { key: "culture", label: "Medio de cultivo", type: "text" },
    { key: "isolationDate", label: "Fecha de aislamiento", type: "date" },
    { key: "biosafetyLevel", label: "Nivel de bioseguridad", type: "select", options: ["BSL-1", "BSL-2", "BSL-3", "BSL-4"] },
    { key: "strainCode", label: "Código de cepa", type: "text" },
  ],
  ENVIRONMENTAL: [
    { key: "matrix", label: "Matriz ambiental", type: "select", options: ["Agua", "Suelo", "Aire", "Sedimento", "Residuo", "Otro"] },
    { key: "volume", label: "Volumen o masa", type: "text" },
    { key: "temperatureC", label: "Temperatura en campo (°C)", type: "number" },
    { key: "ph", label: "pH en campo", type: "number" },
    { key: "weather", label: "Condiciones al momento de la toma", type: "text" },
  ],
  BIOTECHNOLOGICAL: [
    { key: "material", label: "Tipo de material", type: "select", options: ["ADN", "ARN", "Proteína", "Plásmido", "Línea celular", "Enzima", "Otro"] },
    { key: "concentration", label: "Concentración", type: "text", hint: "Ej. 120 ng/µL" },
    { key: "purity", label: "Pureza (A260/A280)", type: "text" },
    { key: "extractionMethod", label: "Método de extracción", type: "text" },
    { key: "host", label: "Organismo hospedero o de origen", type: "text" },
  ],
  ZOOTECHNICAL_BOTANICAL: [
    { key: "species", label: "Especie", type: "text" },
    { key: "commonName", label: "Nombre común", type: "text" },
    { key: "part", label: "Parte o tejido", type: "text", hint: "Hoja, raíz, músculo, sangre…" },
    { key: "developmentStage", label: "Etapa de desarrollo", type: "text" },
    { key: "herbariumCode", label: "Código de herbario o registro", type: "text" },
  ],
};

/** Datos del donante o la fuente. Solo se piden cuando el tipo lo justifica. */
export const SAMPLE_SOURCE_FIELDS: Partial<Record<SampleType, readonly SampleField[]>> = {
  BIOLOGICAL: [
    { key: "donorCode", label: "Código del donante", type: "text", hint: "Identificador anonimizado" },
    { key: "donorAge", label: "Edad", type: "number" },
    { key: "donorSex", label: "Sexo", type: "select", options: ["No registrado", "Femenino", "Masculino", "Otro"] },
    { key: "clinicalNote", label: "Antecedente relevante", type: "textarea" },
    { key: "consentCode", label: "Consentimiento informado", type: "text", hint: "Folio del consentimiento firmado" },
  ],
  ZOOTECHNICAL_BOTANICAL: [
    { key: "individualCode", label: "Identificación del individuo", type: "text" },
    { key: "sex", label: "Sexo", type: "select", options: ["No aplica", "Hembra", "Macho"] },
    { key: "ageOrStage", label: "Edad o etapa", type: "text" },
    { key: "ownerOrSite", label: "Propietario o finca de origen", type: "text" },
  ],
  MICROBIOLOGICAL: [
    { key: "sourceHost", label: "Hospedero u origen", type: "text" },
    { key: "isolationSource", label: "Fuente de aislamiento", type: "text" },
  ],
};

export function sampleTypeFields(sampleType: string): readonly SampleField[] {
  return SAMPLE_TYPE_FIELDS[sampleType as SampleType] ?? [];
}

export function sampleSourceFields(sampleType: string): readonly SampleField[] {
  return SAMPLE_SOURCE_FIELDS[sampleType as SampleType] ?? [];
}

// ─── Biobanco ───────────────────────────────────────────────────────────────

export const BIOBANK_STATUSES = ["ACTIVE", "LOANED", "IN_USE", "DEPLETED", "DISCARDED"] as const;
export type BiobankStatus = (typeof BIOBANK_STATUSES)[number];

export const BIOBANK_STATUS_LABEL: Record<BiobankStatus, string> = {
  ACTIVE: "Activa",
  LOANED: "Prestada",
  IN_USE: "En uso",
  DEPLETED: "Agotada",
  DISCARDED: "Descartada",
};

export const STORAGE_KINDS = ["REFRIGERATED", "FROZEN", "ULTRAFREEZER", "LIQUID_NITROGEN", "ROOM_TEMPERATURE"] as const;
export type StorageKind = (typeof STORAGE_KINDS)[number];

export const STORAGE_KIND_LABEL: Record<StorageKind, string> = {
  REFRIGERATED: "Refrigerado (2-8 °C)",
  FROZEN: "Congelado (-20 °C)",
  ULTRAFREEZER: "Ultracongelado (-80 °C)",
  LIQUID_NITROGEN: "Nitrógeno líquido (-196 °C)",
  ROOM_TEMPERATURE: "Temperatura ambiente",
};

export const BIOBANK_MOVEMENT_TYPES = ["STORED", "RETRIEVED", "ALIQUOT_TAKEN", "LOANED", "RETURNED", "RELOCATED", "DISCARDED"] as const;

export const BIOBANK_MOVEMENT_LABEL: Record<string, string> = {
  STORED: "Ingreso al biobanco",
  RETRIEVED: "Retiro",
  ALIQUOT_TAKEN: "Alícuota tomada",
  LOANED: "Préstamo",
  RETURNED: "Devolución",
  RELOCATED: "Reubicación",
  DISCARDED: "Descarte",
};

export const QC_RESULT_LABEL: Record<string, string> = {
  PASS: "Conforme",
  WARNING: "Con observación",
  FAIL: "No conforme",
};

/** Fecha de expiración a partir del ingreso y la vida útil en meses. */
export function expiryFromShelfLife(storedOn: string | null, months: number | null): string | null {
  if (!storedOn || !months || months <= 0) return null;
  const date = new Date(`${storedOn}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

// ─── Cuaderno electrónico ───────────────────────────────────────────────────

export const NOTEBOOK_ENTRY_STATUSES = ["DRAFT", "COMPLETED", "SIGNED", "WITNESSED"] as const;

export const NOTEBOOK_ENTRY_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  COMPLETED: "Completado",
  SIGNED: "Firmado",
  WITNESSED: "Firmado y atestiguado",
};

/** Una entrada firmada solo se modifica dejando una versión nueva y un motivo. */
export function requiresChangeReason(status: string): boolean {
  return status === "SIGNED" || status === "WITNESSED";
}

// ─── Gestión documental ─────────────────────────────────────────────────────

export const DOCUMENT_CATEGORIES = [
  "ARTICLE", "PROTOCOL", "CONSENT", "PERMIT", "REPORT",
  "EQUIPMENT_CERTIFICATE", "REAGENT_CERTIFICATE", "SDS", "LICENSE", "OTHER",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  ARTICLE: "Artículo científico",
  PROTOCOL: "Protocolo",
  CONSENT: "Consentimiento informado",
  PERMIT: "Permiso o autorización",
  REPORT: "Reporte",
  EQUIPMENT_CERTIFICATE: "Certificado de equipo",
  REAGENT_CERTIFICATE: "Certificado de reactivo",
  SDS: "Ficha de datos de seguridad (SDS)",
  LICENSE: "Licencia",
  OTHER: "Otro",
};

// ─── Códigos correlativos ───────────────────────────────────────────────────

/**
 * Siguiente correlativo con prefijo y año: PRY-2026-001, MU-2026-0001, …
 * Ignora cualquier código que no siga el formato del año en curso, de modo que
 * importar datos antiguos no rompe la numeración.
 */
export function computeNextCode(
  existingCodes: readonly string[],
  prefix: string,
  year: number,
  padding = 3,
): string {
  const head = `${prefix}-${year}-`;
  let max = 0;
  for (const code of existingCodes) {
    if (!code.startsWith(head)) continue;
    const suffix = code.slice(head.length);
    if (!/^\d+$/.test(suffix)) continue;
    const value = Number(suffix);
    if (Number.isFinite(value) && value > max) max = value;
  }
  return `${head}${String(max + 1).padStart(padding, "0")}`;
}

export const CODE_PREFIX = {
  project: "PRY",
  sample: "MU",
  biobank: "BIO",
  protocol: "PROT",
  notebook: "CDN",
  entry: "EXP",
  document: "DOC",
} as const;
