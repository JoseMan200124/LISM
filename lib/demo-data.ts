export type Severity = "Crítica" | "Alta" | "Media" | "Baja";
export type SpecimenStatus = "Recibida" | "En preparación" | "En análisis" | "Por validar" | "Liberada" | "Rechazada";

export const overviewKpis = [
  { label: "Muestras activas", value: "184", delta: "+12 hoy", tone: "primary" },
  { label: "TAT mediano", value: "3 h 24 m", delta: "−18 min vs. semana", tone: "sage" },
  { label: "Resultados por validar", value: "26", delta: "8 prioritarios", tone: "amber" },
  { label: "Cumplimiento QC", value: "98.6%", delta: "+0.9% este mes", tone: "sage" },
];

export const workflowStages = [
  { label: "Recepción", value: 38, hint: "11 nuevas" },
  { label: "Preparación", value: 27, hint: "3 por priorizar" },
  { label: "En análisis", value: 71, hint: "6 cerca del SLA" },
  { label: "Validación", value: 26, hint: "8 urgentes" },
  { label: "Liberadas hoy", value: 142, hint: "94% dentro del SLA" },
];

export const turnaroundBars = [
  { day: "Lun", within: 91, outside: 9 },
  { day: "Mar", within: 94, outside: 6 },
  { day: "Mié", within: 89, outside: 11 },
  { day: "Jue", within: 96, outside: 4 },
  { day: "Vie", within: 93, outside: 7 },
  { day: "Sáb", within: 98, outside: 2 },
  { day: "Dom", within: 95, outside: 5 },
];

export const recentSpecimens = [
  { accession: "GT-260603-0184", patient: "María López", type: "Sangre total", tests: "Hemograma, Glucosa", priority: "Rutina", status: "En análisis", received: "16:08", tat: "01:42" },
  { accession: "GT-260603-0183", patient: "Carlos Ramírez", type: "Suero", tests: "Perfil hepático", priority: "Urgente", status: "Por validar", received: "15:51", tat: "02:16" },
  { accession: "GT-260603-0182", patient: "Ana Morales", type: "Hisopado", tests: "Panel respiratorio", priority: "Prioritario", status: "En preparación", received: "15:37", tat: "00:58" },
  { accession: "GT-260603-0181", patient: "Luis Hernández", type: "Plasma", tests: "Dímero D", priority: "Urgente", status: "Liberada", received: "15:11", tat: "01:06" },
  { accession: "GT-260603-0180", patient: "Sofía Méndez", type: "Orina", tests: "Uroanálisis", priority: "Rutina", status: "Recibida", received: "14:58", tat: "00:21" },
];

export const alerts = [
  { title: "Reactivo por debajo del mínimo", detail: "Control hematológico nivel 2 · quedan 2 unidades", severity: "Alta" as Severity, when: "Hace 12 min" },
  { title: "Validación prioritaria pendiente", detail: "GT-260603-0183 · perfil hepático", severity: "Media" as Severity, when: "Hace 21 min" },
  { title: "Mantenimiento próximo", detail: "Analizador Cobas c311 · programado para mañana", severity: "Baja" as Severity, when: "Hace 44 min" },
];

export const workbenchRows = [
  { accession: "GT-260603-0184", patient: "María López", station: "Hematología", task: "Procesar hemograma", assigned: "Andrea Ruiz", priority: "Rutina", due: "17:05", status: "En análisis" },
  { accession: "GT-260603-0183", patient: "Carlos Ramírez", station: "Química", task: "Revisar banderas", assigned: "Dra. Vega", priority: "Urgente", due: "16:42", status: "Por validar" },
  { accession: "GT-260603-0182", patient: "Ana Morales", station: "Molecular", task: "Preparar extracción", assigned: "Diego Ortiz", priority: "Prioritario", due: "17:20", status: "En preparación" },
  { accession: "GT-260603-0179", patient: "Pedro Guerra", station: "Microbiología", task: "Confirmar cultivo", assigned: "Laura Soto", priority: "Rutina", due: "18:10", status: "En análisis" },
];

export const orderRows = [
  { id: "ORD-260603-0488", patient: "Carlos Ramírez", provider: "Dra. Lucía Santos", tests: "Perfil hepático", priority: "Urgente", created: "15:49", status: "En curso" },
  { id: "ORD-260603-0487", patient: "Ana Morales", provider: "Hospital Universitario", tests: "Panel respiratorio", priority: "Prioritario", created: "15:34", status: "En curso" },
  { id: "ORD-260603-0486", patient: "Luis Hernández", provider: "Dr. Jorge Paz", tests: "Dímero D", priority: "Urgente", created: "15:09", status: "Completada" },
  { id: "ORD-260603-0485", patient: "Sofía Méndez", provider: "Clínica Central", tests: "Uroanálisis", priority: "Rutina", created: "14:55", status: "Recibida" },
];

export const resultRows = [
  { accession: "GT-260603-0183", patient: "Carlos Ramírez", test: "ALT / TGP", value: "86 U/L", flag: "Alto", reviewer: "Dra. Vega", status: "Por validar" },
  { accession: "GT-260603-0183", patient: "Carlos Ramírez", test: "AST / TGO", value: "72 U/L", flag: "Alto", reviewer: "Dra. Vega", status: "Por validar" },
  { accession: "GT-260603-0181", patient: "Luis Hernández", test: "Dímero D", value: "0.41 mg/L", flag: "Normal", reviewer: "Dr. Molina", status: "Liberado" },
  { accession: "GT-260603-0178", patient: "Elena Cabrera", test: "Hemoglobina", value: "11.2 g/dL", flag: "Bajo", reviewer: "Dra. Vega", status: "Liberado" },
];

export const patientRows = [
  { id: "PAC-000842", name: "María López", document: "CUI •••• 1842", birth: "14/08/1994", sex: "F", lastOrder: "Hoy · 16:04", activeOrders: 1 },
  { id: "PAC-000841", name: "Carlos Ramírez", document: "CUI •••• 6671", birth: "03/12/1987", sex: "M", lastOrder: "Hoy · 15:49", activeOrders: 1 },
  { id: "PAC-000839", name: "Ana Morales", document: "CUI •••• 2290", birth: "21/06/2001", sex: "F", lastOrder: "Hoy · 15:34", activeOrders: 1 },
  { id: "PAC-000836", name: "Luis Hernández", document: "CUI •••• 9054", birth: "10/02/1978", sex: "M", lastOrder: "Hoy · 15:09", activeOrders: 0 },
];

export const providerRows = [
  { code: "MED-0182", name: "Dra. Lucía Santos", type: "Médico", institution: "Hospital Universitario", channel: "Portal seguro", lastOrder: "Hoy · 15:49" },
  { code: "ORG-0041", name: "Clínica Central", type: "Institución", institution: "Zona 10", channel: "HL7 / Portal", lastOrder: "Hoy · 14:55" },
  { code: "MED-0175", name: "Dr. Jorge Paz", type: "Médico", institution: "Consulta privada", channel: "Portal seguro", lastOrder: "Hoy · 15:09" },
  { code: "ORG-0037", name: "Hospital Regional", type: "Institución", institution: "Mixco", channel: "Referencia", lastOrder: "Ayer · 18:21" },
];

export const catalogRows = [
  { code: "HEM-001", name: "Hemograma completo", section: "Hematología", specimen: "Sangre total EDTA", tat: "2 h", loinc: "57021-8", active: "Sí" },
  { code: "QUI-014", name: "Perfil hepático", section: "Química", specimen: "Suero", tat: "4 h", loinc: "24325-3", active: "Sí" },
  { code: "MOL-009", name: "Panel respiratorio", section: "Molecular", specimen: "Hisopado", tat: "8 h", loinc: "92142-9", active: "Sí" },
  { code: "URI-001", name: "Uroanálisis", section: "Uroanálisis", specimen: "Orina", tat: "3 h", loinc: "24357-6", active: "Sí" },
];

export const inventoryRows = [
  { sku: "REA-HEM-029", name: "Control hematológico nivel 2", category: "Reactivo", lot: "HC-24091", location: "Frío A · Nivel 2", quantity: "2 unidades", minimum: "6 unidades", expires: "19/07/2026", status: "Reponer" },
  { sku: "REA-QUI-118", name: "ALT reagent cassette", category: "Reactivo", lot: "ALT-8851", location: "Frío B · Nivel 1", quantity: "14 unidades", minimum: "8 unidades", expires: "01/10/2026", status: "Disponible" },
  { sku: "CON-GEN-011", name: "Tubos EDTA 4 ml", category: "Consumible", lot: "ED-26012", location: "Almacén · Estante 4", quantity: "186 unidades", minimum: "100 unidades", expires: "12/02/2028", status: "Disponible" },
  { sku: "REA-MOL-074", name: "Kit extracción ARN", category: "Kit", lot: "RNA-6610", location: "Congelador −20 °C", quantity: "5 kits", minimum: "4 kits", expires: "04/08/2026", status: "Vigilar" },
];

export const equipmentRows = [
  { code: "EQ-HEM-004", name: "Sysmex XN-550", area: "Hematología", status: "Operativo", calibration: "28/05/2026", maintenance: "14/06/2026", utilization: "71%" },
  { code: "EQ-QUI-002", name: "Cobas c311", area: "Química", status: "Mantenimiento próximo", calibration: "22/05/2026", maintenance: "04/06/2026", utilization: "83%" },
  { code: "EQ-MOL-008", name: "QuantStudio 5", area: "Molecular", status: "Operativo", calibration: "17/05/2026", maintenance: "30/06/2026", utilization: "49%" },
  { code: "EQ-URI-003", name: "Urisys 2400", area: "Uroanálisis", status: "Operativo", calibration: "31/05/2026", maintenance: "18/06/2026", utilization: "62%" },
];

export const qualityRows = [
  { id: "QC-260603-084", area: "Hematología", control: "Nivel 2", run: "16:03", result: "Dentro de rango", owner: "Andrea Ruiz", status: "Conforme" },
  { id: "QC-260603-083", area: "Química", control: "ALT control", run: "15:22", result: "Desviación +1.8 SD", owner: "Diego Ortiz", status: "Revisar" },
  { id: "QC-260603-082", area: "Molecular", control: "Control positivo", run: "14:44", result: "Amplificación esperada", owner: "Laura Soto", status: "Conforme" },
  { id: "QC-260603-081", area: "Uroanálisis", control: "Tira control", run: "13:18", result: "Dentro de rango", owner: "Andrea Ruiz", status: "Conforme" },
];

export const incidentRows = [
  { id: "INC-260603-019", type: "Inventario", title: "Control hematológico bajo mínimo", severity: "Alta", owner: "Abastecimiento", opened: "16:18", status: "Abierta" },
  { id: "INC-260603-018", type: "Equipo", title: "Cobas c311 requiere mantenimiento preventivo", severity: "Media", owner: "Mantenimiento", opened: "15:46", status: "Asignada" },
  { id: "INC-260603-017", type: "Calidad", title: "Revisar desviación de ALT control", severity: "Media", owner: "Dra. Vega", opened: "15:24", status: "En revisión" },
  { id: "INC-260602-016", type: "Muestra", title: "Hisopado rechazado por identificación incompleta", severity: "Baja", owner: "Recepción", opened: "Ayer · 17:11", status: "Cerrada" },
];

export const reportCards = [
  { title: "Tiempos de respuesta", detail: "Cumplimiento de SLA por área, prueba y prioridad.", badge: "Operación" },
  { title: "Productividad del laboratorio", detail: "Volumen procesado, carga por estación y tendencias.", badge: "Gestión" },
  { title: "Calidad y rechazos", detail: "QC, causas de rechazo y acciones correctivas.", badge: "Calidad" },
  { title: "Consumo e inventario", detail: "Existencias, próximos vencimientos y reposición.", badge: "Inventario" },
  { title: "Vigilancia epidemiológica", detail: "Resultados agregados y exportables por ubicación.", badge: "Salud pública" },
  { title: "Auditoría de accesos", detail: "Trazabilidad de cambios, usuarios y operaciones críticas.", badge: "Cumplimiento" },
];

export const integrationRows = [
  { name: "Portal de resultados", type: "Salida segura", standard: "HTTPS / PDF", status: "Activo", lastSync: "Hace 3 min" },
  { name: "Hospital Universitario", type: "HIS", standard: "HL7 v2", status: "Activo", lastSync: "Hace 7 min" },
  { name: "Cobas c311", type: "Analizador", standard: "ASTM / Middleware", status: "Activo", lastSync: "Hace 12 min" },
  { name: "Reporte epidemiológico", type: "Exportación", standard: "CSV normalizado", status: "Programado", lastSync: "Hoy · 06:00" },
];

export const auditRows = [
  { actor: "Dra. Vega", action: "Liberó resultado", object: "GT-260603-0181 · Dímero D", origin: "Portal web", when: "16:17:42" },
  { actor: "Andrea Ruiz", action: "Registró QC", object: "QC-260603-084", origin: "Mesa de trabajo", when: "16:04:18" },
  { actor: "Diego Ortiz", action: "Actualizó muestra", object: "GT-260603-0182", origin: "Recepción", when: "15:41:09" },
  { actor: "Sistema", action: "Generó alerta", object: "REA-HEM-029 · stock mínimo", origin: "Regla automática", when: "15:38:50" },
];

export const usersRows = [
  { name: "Elena Vega", email: "elena.vega@nexalab.local", role: "Revisor clínico", area: "Química", status: "Activo" },
  { name: "Andrea Ruiz", email: "andrea.ruiz@nexalab.local", role: "Técnico", area: "Hematología", status: "Activo" },
  { name: "Diego Ortiz", email: "diego.ortiz@nexalab.local", role: "Técnico", area: "Molecular", status: "Activo" },
  { name: "José Admin", email: "admin@nexalab.local", role: "Administrador", area: "General", status: "Activo" },
];
