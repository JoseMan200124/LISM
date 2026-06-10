export type LaboratoryProfileKey = "EDUCATIONAL" | "PHARMA_QC" | "CLINICAL" | "FOOD_WATER" | "INDUSTRIAL" | "CALIBRATION";
export type ControlState = "IMPLEMENTED" | "CONFIGURE" | "PROCEDURE";
export type Severity = "Informativa" | "Baja" | "Media" | "Alta" | "Crítica";

export type LaboratoryProfile = {
  key: LaboratoryProfileKey;
  name: string;
  description: string;
  modules: string[];
  suggestedFor: string;
};

export type CustomFieldDefinition = {
  id: string;
  module: string;
  label: string;
  type: string;
  required: string;
  visibility: string;
  version: string;
};

export type AlertRule = {
  id: string;
  name: string;
  source: string;
  trigger: string;
  severity: Severity;
  recipients: string;
  channel: string;
  active: boolean;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  appliesTo: string;
  version: string;
  active: boolean;
  stages: Array<{ name: string; help: string; requirement?: string }>;
};

export type RoleTemplate = {
  key: string;
  name: string;
  description: string;
  scope: string;
  permissions: string[];
};

export type ComplianceControl = {
  id: string;
  standard: string;
  area: string;
  requirement: string;
  implementation: string;
  evidence: string;
  owner: string;
  state: ControlState;
};

export const laboratoryProfiles: LaboratoryProfile[] = [
  {
    key: "EDUCATIONAL",
    name: "Educativo y universitario",
    description: "Inventario, prácticas, reservas, docentes y consulta segura para estudiantes.",
    modules: ["Inventario", "Equipos", "Prácticas", "Reservas", "Bitácoras", "Alertas"],
    suggestedFor: "Universidades, colegios y laboratorios de docencia",
  },
  {
    key: "PHARMA_QC",
    name: "Farmacéutico y control de calidad",
    description: "Trazabilidad reforzada, métodos, OOS/OOT, CAPA, documentos y firmas electrónicas.",
    modules: ["Muestras", "Métodos", "Resultados", "OOS/OOT", "CAPA", "Ambiental", "Documentos", "Firmas"],
    suggestedFor: "Farmacéuticas y laboratorios de control de calidad",
  },
  {
    key: "CLINICAL",
    name: "Clínico y hospitalario",
    description: "Recepción preanalítica, pacientes, valores críticos, revisión y liberación de resultados.",
    modules: ["Pacientes", "Órdenes", "Muestras", "Resultados", "Valores críticos", "Solicitantes", "Reportes"],
    suggestedFor: "Laboratorios clínicos y hospitales",
  },
  {
    key: "FOOD_WATER",
    name: "Alimentos y agua",
    description: "Muestreo, microbiología, fisicoquímica, tendencias y certificados por lote.",
    modules: ["Muestras", "Ensayos", "Resultados", "Tendencias", "Reportes", "Inventario"],
    suggestedFor: "Alimentos, bebidas, agua y saneamiento",
  },
  {
    key: "INDUSTRIAL",
    name: "Industrial",
    description: "Control de lotes, especificaciones, equipos, resultados y certificados.",
    modules: ["Lotes", "Muestras", "Métodos", "Resultados", "Equipos", "Certificados"],
    suggestedFor: "Operaciones industriales y control de proceso",
  },
  {
    key: "CALIBRATION",
    name: "Calibración",
    description: "Patrones, certificados, trazabilidad metrológica y programación de calibraciones.",
    modules: ["Equipos", "Patrones", "Calibraciones", "Certificados", "Competencia", "Auditoría"],
    suggestedFor: "Laboratorios de calibración",
  },
];

export const defaultCustomFields: CustomFieldDefinition[] = [
  { id: "fld-01", module: "Reactivos", label: "Fórmula", type: "Texto", required: "Opcional", visibility: "Inventario y analistas", version: "v2" },
  { id: "fld-02", module: "Reactivos", label: "Fecha de apertura", type: "Fecha", required: "Según categoría", visibility: "Inventario y analistas", version: "v2" },
  { id: "fld-03", module: "Reactivos", label: "Ficha de seguridad", type: "Archivo", required: "Reactivos químicos", visibility: "Todos", version: "v1" },
  { id: "fld-04", module: "Equipos", label: "Criticidad", type: "Selección", required: "Obligatorio", visibility: "Jefatura y calidad", version: "v1" },
  { id: "fld-05", module: "Muestras", label: "Temperatura de recepción", type: "Número + unidad", required: "Condicional", visibility: "Recepción y calidad", version: "v3" },
  { id: "fld-06", module: "Prácticas", label: "Curso o sección", type: "Texto", required: "Obligatorio", visibility: "Docentes y estudiantes", version: "v1" },
];

export const defaultAlertRules: AlertRule[] = [
  { id: "rule-01", name: "Stock crítico", source: "Inventario", trigger: "Existencia ≤ stock mínimo", severity: "Alta", recipients: "Inventario y jefatura", channel: "Panel + correo", active: true },
  { id: "rule-02", name: "Reactivo próximo a vencer", source: "Reactivos", trigger: "90, 60, 30 y 0 días antes", severity: "Media", recipients: "Inventario", channel: "Panel + resumen diario", active: true },
  { id: "rule-03", name: "Uso de reactivo controlado", source: "Movimientos", trigger: "Cada salida de categoría controlada", severity: "Informativa", recipients: "Jefatura", channel: "Bitácora + panel", active: true },
  { id: "rule-04", name: "Calibración vencida", source: "Equipos", trigger: "Fecha de calibración superada", severity: "Crítica", recipients: "Calidad y mantenimiento", channel: "Panel + correo", active: true },
  { id: "rule-05", name: "Resultado fuera de especificación", source: "Resultados", trigger: "Resultado fuera del rango vigente", severity: "Crítica", recipients: "Analista, revisor y calidad", channel: "Panel + correo", active: true },
  { id: "rule-06", name: "Verificación diaria omitida", source: "Bitácoras", trigger: "No existe registro al cierre del turno", severity: "Alta", recipients: "Responsable y jefatura", channel: "Panel + correo", active: true },
  { id: "rule-07", name: "Recordatorio de práctica", source: "Educativo", trigger: "24 horas antes de la práctica", severity: "Informativa", recipients: "Docente y estudiantes", channel: "Panel + correo", active: true },
];

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "wf-sample",
    name: "Ciclo completo de muestra",
    appliesTo: "Muestras",
    version: "v3 vigente",
    active: true,
    stages: [
      { name: "Registrada", help: "Se genera número único y etiqueta QR." },
      { name: "Recibida", help: "Se verifican identificación, condiciones y cantidad.", requirement: "Recepción conforme o motivo de rechazo" },
      { name: "En análisis", help: "El analista registra método, equipo y reactivos utilizados." },
      { name: "En revisión", help: "Un responsable revisa resultados, alertas y evidencia." },
      { name: "Aprobada", help: "Se solicita firma electrónica para liberar el informe.", requirement: "Firma del revisor" },
      { name: "Cerrada", help: "El registro queda protegido y disponible para consulta." },
    ],
  },
  {
    id: "wf-oos",
    name: "Investigación OOS / OOT",
    appliesTo: "Calidad",
    version: "v2 vigente",
    active: true,
    stages: [
      { name: "Detectada", help: "El motor identifica una desviación o tendencia." },
      { name: "Confirmada", help: "Calidad evalúa impacto y decide investigación." },
      { name: "Investigación", help: "Se registra causa raíz, evidencia y reanálisis sin borrar el resultado inicial." },
      { name: "CAPA", help: "Se documentan acciones correctivas y preventivas." },
      { name: "Verificación", help: "Se comprueba efectividad de las acciones." },
      { name: "Cerrada", help: "El cierre requiere aprobación y firma." },
    ],
  },
  {
    id: "wf-document",
    name: "Control documental",
    appliesTo: "Documentos",
    version: "v1 vigente",
    active: true,
    stages: [
      { name: "Borrador", help: "Edición controlada por el responsable." },
      { name: "En revisión", help: "Revisión por una persona autorizada." },
      { name: "Aprobado", help: "Firma electrónica y fecha de vigencia." },
      { name: "Vigente", help: "Disponible para consulta y capacitación." },
      { name: "Obsoleto", help: "Se conserva para auditoría sin permitir uso operativo." },
    ],
  },
];

export const roleTemplates: RoleTemplate[] = [
  { key: "ADMIN", name: "Administrador", description: "Configura la plataforma y administra accesos.", scope: "Organización", permissions: ["Usuarios y roles", "Configuración", "Catálogos", "Auditoría", "Respaldos"] },
  { key: "HEAD", name: "Jefe de laboratorio", description: "Supervisa operación, calidad y liberaciones.", scope: "Laboratorio o sede", permissions: ["Aprobar resultados", "Firmar", "Revisar OOS/CAPA", "Equipos", "Reportes"] },
  { key: "ANALYST", name: "Analista", description: "Ejecuta ensayos y registra evidencia técnica.", scope: "Áreas autorizadas", permissions: ["Muestras asignadas", "Resultados", "Movimientos", "Bitácoras"] },
  { key: "ASSISTANT", name: "Auxiliar", description: "Apoya recepción, inventario y preparación.", scope: "Áreas autorizadas", permissions: ["Recepción", "Inventario limitado", "Reservas", "Bitácoras"] },
  { key: "AUDITOR", name: "Inspector / auditor", description: "Consulta registros y evidencia sin modificar datos.", scope: "Lectura controlada", permissions: ["Consulta", "Auditoría", "Reportes", "Documentos vigentes e históricos"] },
  { key: "CONSULT", name: "Consulta", description: "Solo visualiza información operativa autorizada.", scope: "Lectura limitada", permissions: ["Inventario", "Equipos", "Estado de muestras"] },
  { key: "PROFESSOR", name: "Profesor o encargado", description: "Programa prácticas y administra reservas educativas.", scope: "Cursos asignados", permissions: ["Prácticas", "Reservas", "Consulta de inventario", "Avisos"] },
  { key: "STUDENT", name: "Estudiante", description: "Consulta recursos y recordatorios permitidos.", scope: "Solo lectura", permissions: ["Prácticas", "Disponibilidad", "Ubicaciones autorizadas", "Avisos"] },
];

export const complianceControls: ComplianceControl[] = [
  { id: "iso17025-01", standard: "ISO/IEC 17025", area: "Personal", requirement: "Competencia y autorización del personal", implementation: "Expediente de competencia, capacitaciones y métodos autorizados por usuario.", evidence: "Registros de competencia, vencimientos y aprobaciones", owner: "Jefatura", state: "IMPLEMENTED" },
  { id: "iso17025-02", standard: "ISO/IEC 17025", area: "Equipos", requirement: "Control de equipos y trazabilidad metrológica", implementation: "Registro maestro, planes, verificaciones, certificados y bloqueo configurable por vencimiento.", evidence: "Historial de equipo y certificados versionados", owner: "Calidad", state: "IMPLEMENTED" },
  { id: "iso17025-03", standard: "ISO/IEC 17025", area: "Métodos", requirement: "Métodos vigentes y controlados", implementation: "Catálogo versionado con vigencia, especificaciones y aprobaciones.", evidence: "Versión aplicada a cada resultado", owner: "Calidad", state: "CONFIGURE" },
  { id: "iso17025-04", standard: "ISO/IEC 17025", area: "Registros técnicos", requirement: "Reconstrucción completa del análisis", implementation: "Cada resultado vincula muestra, método, analista, equipo, reactivos, datos y cambios.", evidence: "Ficha técnica y audit trail", owner: "Analista", state: "IMPLEMENTED" },
  { id: "iso17025-05", standard: "ISO/IEC 17025", area: "Trabajo no conforme", requirement: "Tratamiento de desviaciones", implementation: "Flujo OOS/OOT, investigación, reanálisis, CAPA y cierre firmado.", evidence: "Expediente OOS/CAPA", owner: "Calidad", state: "IMPLEMENTED" },
  { id: "iso15189-01", standard: "ISO 15189", area: "Preanalítica", requirement: "Identificación, recepción y rechazo de muestras", implementation: "Recepción guiada, criterios configurables y cadena de custodia.", evidence: "Historial de muestra y transferencias", owner: "Recepción", state: "IMPLEMENTED" },
  { id: "iso15189-02", standard: "ISO 15189", area: "Resultados", requirement: "Valores críticos y comunicación", implementation: "Reglas configurables con acuse, escalamiento y registro de notificación.", evidence: "Alerta, acuse y bitácora de comunicación", owner: "Revisor", state: "CONFIGURE" },
  { id: "gxp-01", standard: "BPM / BPL", area: "Integridad de datos", requirement: "Datos atribuibles, legibles, contemporáneos, originales y exactos", implementation: "Auditoría inmutable, firmas vinculadas y conservación de versiones.", evidence: "Audit trail exportable", owner: "Calidad", state: "IMPLEMENTED" },
  { id: "part11-01", standard: "21 CFR Part 11", area: "Firma electrónica", requirement: "Firma vinculada al registro y reautenticación", implementation: "Motivo de firma, marca de tiempo, hash del contenido y reautenticación.", evidence: "Registro de firma electrónica", owner: "Administrador", state: "CONFIGURE" },
  { id: "iso27001-01", standard: "ISO/IEC 27001", area: "Seguridad", requirement: "Control de acceso basado en riesgo", implementation: "Roles, permisos granulares, sesiones seguras y aislamiento por laboratorio.", evidence: "Matriz de permisos y registros de acceso", owner: "Administrador", state: "IMPLEMENTED" },
  { id: "iso25010-01", standard: "ISO/IEC 25010", area: "Calidad del software", requirement: "Adecuación, seguridad, mantenibilidad y fiabilidad", implementation: "Arquitectura modular, validaciones, pruebas automatizables y documentación de aceptación.", evidence: "Plan de validación y pruebas", owner: "Equipo técnico", state: "PROCEDURE" },
  { id: "iso9001-01", standard: "ISO 9001", area: "Mejora continua", requirement: "Control de cambios y mejora", implementation: "Solicitudes de cambio, aprobaciones, CAPA, indicadores y revisión periódica.", evidence: "Registro de cambios y actas", owner: "Dirección", state: "PROCEDURE" },
];

export const qualityRecords = {
  oos: [
    { code: "OOS-2026-014", source: "Resultado", detail: "Potencia lote PT-004 fuera del límite vigente", phase: "Investigación", owner: "Laura Méndez", due: "12/06/2026", status: "En curso" },
    { code: "OOT-2026-008", source: "Ambiental", detail: "Tendencia ascendente en superficie Micro A", phase: "Evaluación", owner: "Calidad", due: "14/06/2026", status: "Revisar" },
  ],
  capa: [
    { code: "CAPA-2026-011", origin: "OOS-2026-009", action: "Actualizar secuencia de limpieza y verificar efectividad", owner: "Microbiología", target: "18/06/2026", status: "Verificación" },
    { code: "CAPA-2026-012", origin: "INC-2026-041", action: "Capacitar sobre registro obligatorio de salida", owner: "Inventario", target: "11/06/2026", status: "En ejecución" },
  ],
  documents: [
    { code: "POE-MIC-004", title: "Limpieza de cabina microbiológica", version: "v5", validFrom: "01/05/2026", review: "01/05/2027", status: "Vigente" },
    { code: "SOP-INV-002", title: "Recepción y almacenamiento de reactivos", version: "v3", validFrom: "12/03/2026", review: "12/03/2027", status: "Vigente" },
    { code: "FOR-QA-008", title: "Formato de investigación OOS", version: "v2", validFrom: "20/02/2026", review: "20/02/2027", status: "Vigente" },
  ],
  environmental: [
    { point: "MIC-A-SUP-01", type: "Superficie", area: "Microbiología A", result: "4 UFC", alert: "10 UFC", action: "20 UFC", trend: "Estable", status: "Conforme" },
    { point: "MIC-A-SED-02", type: "Sedimentación", area: "Microbiología A", result: "9 UFC", alert: "10 UFC", action: "20 UFC", trend: "Ascendente", status: "Vigilar" },
    { point: "PRO-MAN-03", type: "Manos", area: "Producción", result: "0 UFC", alert: "5 UFC", action: "10 UFC", trend: "Estable", status: "Conforme" },
  ],
  logbooks: [
    { code: "BIT-REF-01", template: "Temperatura de refrigerador", frequency: "Cada turno", responsible: "Auxiliar", last: "Hoy · 14:05", status: "Completa" },
    { code: "BIT-CAB-02", template: "Limpieza de cabina", frequency: "Diaria", responsible: "Analista", last: "Ayer · 17:40", status: "Pendiente" },
    { code: "BIT-BAL-04", template: "Verificación de balanza", frequency: "Antes de uso", responsible: "Analista", last: "Hoy · 09:12", status: "Completa" },
  ],
  training: [
    { person: "Ana Morales", role: "Analista", qualification: "Recuento microbiológico", validUntil: "31/12/2026", evidence: "CAP-2026-031", status: "Vigente" },
    { person: "Carlos Gómez", role: "Auxiliar", qualification: "Recepción de reactivos", validUntil: "18/06/2026", evidence: "CAP-2025-018", status: "Próxima a vencer" },
    { person: "Andrea Ruiz", role: "Analista", qualification: "Uso de balanza EQ-BAL-004", validUntil: "15/01/2027", evidence: "CAP-2026-044", status: "Vigente" },
  ],
  signatures: [
    { code: "SIG-260609-188", actor: "Dra. Elena Vega", meaning: "Aprobación de resultado", object: "GT-260609-0181 · Informe v2", signedAt: "Hoy · 15:42:11", hash: "a81c…f429" },
    { code: "SIG-260609-187", actor: "Laura Méndez", meaning: "Cierre de investigación", object: "OOS-2026-006", signedAt: "Hoy · 14:18:27", hash: "71bd…9ae0" },
  ],
};

export const inventoryMovements = [
  { code: "MOV-260609-112", item: "Ácido clorhídrico 0.1 N", lot: "HCL-2026-08", type: "Salida", quantity: "25 mL", reason: "Práctica de microbiología", performedBy: "Profesor Juan", when: "Hoy · 15:40" },
  { code: "MOV-260609-111", item: "Control hematológico nivel 2", lot: "HC-24091", type: "Consumo", quantity: "1 unidad", reason: "Corrida QC", performedBy: "Andrea Ruiz", when: "Hoy · 14:22" },
  { code: "MOV-260608-109", item: "Tubos EDTA 4 ml", lot: "ED-26012", type: "Entrada", quantity: "120 unidades", reason: "Recepción de proveedor", performedBy: "Carlos Gómez", when: "Ayer · 10:05" },
];

export const locationRows = [
  { code: "SED-CEN", hierarchy: "Sede central", type: "Sede", responsible: "Administración", status: "Activa" },
  { code: "LAB-MIC", hierarchy: "Sede central → Laboratorio de Microbiología", type: "Laboratorio", responsible: "Jefatura Micro", status: "Activa" },
  { code: "ARM-C1", hierarchy: "Sede central → Laboratorio de Microbiología → Armario C1", type: "Armario", responsible: "Inventario", status: "Activa" },
  { code: "REF-A", hierarchy: "Sede central → Almacén → Refrigerador A → Nivel 2", type: "Refrigerado", responsible: "Inventario", status: "Activa" },
];

export const equipmentPlans = [
  { code: "EQ-BAL-004", equipment: "Balanza analítica", plan: "Verificación antes de uso", frequency: "Cada uso", next: "Al utilizar", blocking: "Sí", status: "Vigente" },
  { code: "EQ-INC-002", equipment: "Incubadora microbiológica", plan: "Mantenimiento preventivo", frequency: "Cada 6 meses", next: "22/06/2026", blocking: "No", status: "Próximo" },
  { code: "EQ-QUI-002", equipment: "Cobas c311", plan: "Calibración", frequency: "Cada 12 meses", next: "04/06/2026", blocking: "Sí", status: "Vencido" },
];

export const educationalPractices = [
  { code: "PRA-2026-021", title: "Tinción de Gram", course: "Microbiología I", teacher: "Profesor Juan", scheduled: "Mañana · 10:00", resources: "HCl, colorantes, portaobjetos", status: "Confirmada" },
  { code: "PRA-2026-022", title: "Uso y verificación de microscopio", course: "Laboratorio básico", teacher: "Ana Morales", scheduled: "12/06 · 14:00", resources: "Microscopios, aceite de inmersión", status: "Preparación" },
];

export const educationalReservations = [
  { code: "RES-2026-088", requester: "Profesor Juan", practice: "Tinción de Gram", resource: "Ácido clorhídrico 0.1 N", quantity: "25 mL", needed: "Mañana · 09:30", status: "Pendiente" },
  { code: "RES-2026-087", requester: "Ana Morales", practice: "Microscopía", resource: "Microscopios", quantity: "12 equipos", needed: "12/06 · 13:30", status: "Aprobada" },
];
