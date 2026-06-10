import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export type QrEntityType = "INVENTORY_ITEM" | "EQUIPMENT";

export type PublicQrProfile = {
  entityType: QrEntityType;
  labelCode: string;
  name: string;
  status: string;
  location: string;
  responsible: string;
  summary: Array<{ label: string; value: string }>;
  history: Array<{ title: string; detail: string; when: string }>;
  allowedActions: string[];
};

export type QrLabelRecord = {
  id: string;
  laboratoryId: string;
  entityType: QrEntityType;
  entityId: string;
  opaqueToken: string;
  labelCode: string;
  status: string;
  displayName: string;
  location: string;
  createdAt: string;
  profile: PublicQrProfile;
};

type DemoAccessCode = {
  hash: string;
  expiresAt: number;
  consumedAt: number | null;
  attempts: number;
};

declare global {
  // eslint-disable-next-line no-var
  var __nexalabDemoQrCodes: Map<string, DemoAccessCode> | undefined;
  // eslint-disable-next-line no-var
  var __nexalabDynamicQrLabels: Map<string, QrLabelRecord> | undefined;
}

const DEMO_LAB_ID = "00000000-0000-0000-0000-000000000011";
const DEMO_CODE_TTL_MINUTES = 10;

export const demoQrLabels: QrLabelRecord[] = [
  {
    id: "demo-qr-inventory-hcl-018",
    laboratoryId: DEMO_LAB_ID,
    entityType: "INVENTORY_ITEM",
    entityId: "00000000-0000-0000-0000-000000000561",
    opaqueToken: "nxl_demo_rea_mic_018_4e7fa30b2d0948ae",
    labelCode: "REA-MIC-018",
    status: "ACTIVE",
    displayName: "Ácido clorhídrico 0.1 N",
    location: "Armario C1 · Laboratorio de Micro",
    createdAt: "2026-06-10T08:00:00.000Z",
    profile: {
      entityType: "INVENTORY_ITEM",
      labelCode: "REA-MIC-018",
      name: "Ácido clorhídrico 0.1 N",
      status: "Disponible",
      location: "Armario C1 · Laboratorio de Micro",
      responsible: "Profesor Juan",
      summary: [
        { label: "Categoría", value: "Reactivo químico" },
        { label: "Fórmula", value: "HCl 0.1 N" },
        { label: "Lote", value: "HCL-2604-08" },
        { label: "Existencia", value: "850 mL" },
        { label: "Stock mínimo", value: "250 mL" },
        { label: "Vencimiento", value: "18/11/2026" },
      ],
      history: [
        { title: "Consumo registrado", detail: "25 mL · práctica de tinción de Gram", when: "09/06/2026 · 17:42" },
        { title: "Transferencia", detail: "Almacén general → Armario C1", when: "05/06/2026 · 10:18" },
        { title: "Ingreso de lote", detail: "Recepción inicial de 1,000 mL", when: "28/05/2026 · 08:31" },
      ],
      allowedActions: ["Consultar ficha", "Registrar consumo", "Transferir", "Reportar incidencia"],
    },
  },
  {
    id: "demo-qr-inventory-control-029",
    laboratoryId: DEMO_LAB_ID,
    entityType: "INVENTORY_ITEM",
    entityId: "00000000-0000-0000-0000-000000000562",
    opaqueToken: "nxl_demo_rea_hem_029_9a2c8e15d4904cb1",
    labelCode: "REA-HEM-029",
    status: "ACTIVE",
    displayName: "Control hematológico nivel 2",
    location: "Frío A · Nivel 2",
    createdAt: "2026-06-10T08:00:00.000Z",
    profile: {
      entityType: "INVENTORY_ITEM",
      labelCode: "REA-HEM-029",
      name: "Control hematológico nivel 2",
      status: "Reponer",
      location: "Frío A · Nivel 2",
      responsible: "Abastecimiento",
      summary: [
        { label: "Categoría", value: "Reactivo" },
        { label: "Lote", value: "HC-24091" },
        { label: "Existencia", value: "2 unidades" },
        { label: "Stock mínimo", value: "6 unidades" },
        { label: "Vencimiento", value: "19/07/2026" },
      ],
      history: [
        { title: "Alerta automática", detail: "Existencia por debajo del mínimo", when: "Hoy · 16:18" },
        { title: "Consumo registrado", detail: "1 unidad · control de turno", when: "Hoy · 08:04" },
      ],
      allowedActions: ["Consultar ficha", "Registrar entrada", "Registrar consumo", "Reportar incidencia"],
    },
  },
  {
    id: "demo-qr-equipment-balance-004",
    laboratoryId: DEMO_LAB_ID,
    entityType: "EQUIPMENT",
    entityId: "00000000-0000-0000-0000-000000000571",
    opaqueToken: "nxl_demo_eq_bal_004_60a2a8db490542b5",
    labelCode: "EQ-BAL-004",
    status: "ACTIVE",
    displayName: "Balanza analítica",
    location: "Laboratorio fisicoquímico",
    createdAt: "2026-06-10T08:00:00.000Z",
    profile: {
      entityType: "EQUIPMENT",
      labelCode: "EQ-BAL-004",
      name: "Balanza analítica",
      status: "Operativo",
      location: "Laboratorio fisicoquímico",
      responsible: "Jefe de laboratorio",
      summary: [
        { label: "Marca", value: "Mettler Toledo" },
        { label: "Modelo", value: "ME204E" },
        { label: "Serie", value: "MT-204-8841" },
        { label: "Próxima calibración", value: "10/07/2026" },
        { label: "Próximo mantenimiento", value: "02/09/2026" },
      ],
      history: [
        { title: "Verificación diaria", detail: "Resultado conforme", when: "Hoy · 07:51" },
        { title: "Calibración", detail: "Certificado CERT-2026-071", when: "10/01/2026" },
      ],
      allowedActions: ["Consultar ficha", "Registrar verificación", "Reportar mantenimiento", "Abrir incidencia"],
    },
  },
  {
    id: "demo-qr-equipment-cobas-002",
    laboratoryId: DEMO_LAB_ID,
    entityType: "EQUIPMENT",
    entityId: "00000000-0000-0000-0000-000000000572",
    opaqueToken: "nxl_demo_eq_qui_002_d04b558ca3464821",
    labelCode: "EQ-QUI-002",
    status: "ACTIVE",
    displayName: "Cobas c311",
    location: "Química",
    createdAt: "2026-06-10T08:00:00.000Z",
    profile: {
      entityType: "EQUIPMENT",
      labelCode: "EQ-QUI-002",
      name: "Cobas c311",
      status: "Mantenimiento próximo",
      location: "Química",
      responsible: "Mantenimiento",
      summary: [
        { label: "Marca", value: "Roche" },
        { label: "Modelo", value: "Cobas c311" },
        { label: "Uso", value: "83%" },
        { label: "Última calibración", value: "22/05/2026" },
        { label: "Próximo mantenimiento", value: "04/06/2026" },
      ],
      history: [
        { title: "Alerta automática", detail: "Mantenimiento preventivo pendiente", when: "Hoy · 15:46" },
        { title: "Calibración", detail: "Resultado conforme", when: "22/05/2026" },
      ],
      allowedActions: ["Consultar ficha", "Registrar mantenimiento", "Adjuntar certificado", "Abrir incidencia"],
    },
  },
];

function qrSecret() {
  return process.env.QR_ACCESS_SECRET || process.env.SESSION_SECRET || "nexalab-demo-qr-secret-change-before-production";
}

function codeStore() {
  globalThis.__nexalabDemoQrCodes ??= new Map<string, DemoAccessCode>();
  return globalThis.__nexalabDemoQrCodes;
}

function dynamicLabelStore() {
  globalThis.__nexalabDynamicQrLabels ??= new Map<string, QrLabelRecord>();
  return globalThis.__nexalabDynamicQrLabels;
}

export function listDemoQrLabels() {
  return [...demoQrLabels, ...dynamicLabelStore().values()];
}

export function createDemoQrLabel(input: {
  entityType: QrEntityType;
  entityId: string;
  labelCode: string;
  displayName: string;
  location?: string;
  status?: string;
  summary?: Array<{ label: string; value: string }>;
}) {
  const existing = listDemoQrLabels().find((label) => label.entityType === input.entityType && label.entityId === input.entityId);
  if (existing) return existing;
  const location = input.location || "Sin ubicación";
  const label: QrLabelRecord = {
    id: crypto.randomUUID(),
    laboratoryId: DEMO_LAB_ID,
    entityType: input.entityType,
    entityId: input.entityId,
    opaqueToken: createOpaqueToken(),
    labelCode: input.labelCode,
    status: "ACTIVE",
    displayName: input.displayName,
    location,
    createdAt: new Date().toISOString(),
    profile: {
      entityType: input.entityType,
      labelCode: input.labelCode,
      name: input.displayName,
      status: input.status || "Disponible",
      location,
      responsible: "Laboratorio Central",
      summary: input.summary ?? [{ label: "Código interno", value: input.labelCode }],
      history: [{ title: "Alta del recurso", detail: "Etiqueta QR generada automáticamente", when: "Ahora" }],
      allowedActions: input.entityType === "EQUIPMENT"
        ? ["Consultar ficha", "Registrar verificación desde NexaLab", "Reportar mantenimiento", "Abrir incidencia"]
        : ["Consultar ficha", "Registrar consumo desde NexaLab", "Transferir desde NexaLab", "Reportar incidencia"],
    },
  };
  dynamicLabelStore().set(label.id, label);
  return label;
}

export function createOpaqueToken() {
  return randomBytes(28).toString("base64url");
}

export function createAccessCode() {
  return String(randomInt(100000, 1000000));
}

export function hashAccessCode(qrIdentifierId: string, code: string) {
  return createHmac("sha256", qrSecret()).update(`${qrIdentifierId}:${code}`).digest("hex");
}

export function secureHashesEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function publicScanUrl(request: Request, opaqueToken: string) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const origin = configured || new URL(request.url).origin;
  return `${origin}/qr/${encodeURIComponent(opaqueToken)}`;
}

export function findDemoQrLabelById(id: string) {
  return listDemoQrLabels().find((label) => label.id === id);
}

export function findDemoQrLabelByToken(token: string) {
  return listDemoQrLabels().find((label) => label.opaqueToken === token);
}

export function issueDemoAccessCode(labelId: string) {
  const code = createAccessCode();
  const expiresAt = Date.now() + DEMO_CODE_TTL_MINUTES * 60_000;
  codeStore().set(labelId, { hash: hashAccessCode(labelId, code), expiresAt, consumedAt: null, attempts: 0 });
  return { code, expiresAt: new Date(expiresAt).toISOString(), ttlMinutes: DEMO_CODE_TTL_MINUTES };
}

export function consumeDemoAccessCode(labelId: string, code: string) {
  const entry = codeStore().get(labelId);
  if (!entry) return { ok: false as const, message: "Solicita un código temporal desde NexaLab antes de consultar la etiqueta." };
  if (entry.consumedAt) return { ok: false as const, message: "El código ya fue utilizado. Genera uno nuevo desde NexaLab." };
  if (entry.expiresAt <= Date.now()) return { ok: false as const, message: "El código temporal venció. Genera uno nuevo desde NexaLab." };
  if (entry.attempts >= 5) return { ok: false as const, message: "El código temporal fue bloqueado por intentos fallidos." };
  entry.attempts += 1;
  if (!secureHashesEqual(entry.hash, hashAccessCode(labelId, code))) {
    return { ok: false as const, message: "Código temporal incorrecto." };
  }
  entry.consumedAt = Date.now();
  return { ok: true as const };
}
