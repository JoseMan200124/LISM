import Anthropic from "@anthropic-ai/sdk";

// Integración con la API de Claude (Anthropic) para la digitalización de fichas
// técnicas y de seguridad (SDS/MSDS) de reactivos, materiales y consumibles.
//
// Si ANTHROPIC_API_KEY no está configurada, hasAI() devuelve false y los
// endpoints que dependen de esto responden con un 503 claro y controlado —
// nunca un crash. Mismo patrón que hasDatabase() (lib/db.ts) y hasBlobStorage()
// (lib/blob-storage.ts).

export function hasAI(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  // El SDK resuelve la credencial desde ANTHROPIC_API_KEY del entorno.
  cachedClient = new Anthropic();
  return cachedClient;
}

// Tipos de artículo soportados por el inventario (ver app/api/inventory).
export const AI_ITEM_TYPES = ["REAGENT", "MATERIAL", "CONSUMABLE", "CULTURE_MEDIA", "OTHER"] as const;
export type AiItemType = (typeof AI_ITEM_TYPES)[number];

// Datos estructurados que la IA extrae de una ficha para precargar el alta de
// inventario. Todos los campos son cadenas (vacías si el dato no aparece en la
// ficha) salvo isControlled, para poder mapearlos 1:1 al formulario del modal.
export type ExtractedSheet = {
  name: string;
  itemType: AiItemType;
  vendor: string;
  brand: string;
  concentration: string;
  presentation: string;
  internalFormula: string;
  casNumber: string;
  unit: string;
  storageConditions: string;
  hazards: string;
  isControlled: boolean;
  notes: string;
};

// Esquema JSON de salida estructurada. Las restricciones (additionalProperties,
// required completo, enum) siguen las reglas de structured outputs de la API.
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string", description: "Nombre del producto o reactivo tal como aparece en la ficha." },
    itemType: { type: "string", enum: [...AI_ITEM_TYPES], description: "Tipo: REAGENT (reactivo/sustancia química), MATERIAL (material de laboratorio reutilizable), CONSUMABLE (insumo desechable), CULTURE_MEDIA (medio de cultivo) u OTHER." },
    vendor: { type: "string", description: "Proveedor o fabricante." },
    brand: { type: "string", description: "Marca comercial." },
    concentration: { type: "string", description: "Concentración o pureza (por ejemplo 96%, 1 M, 0.1 N)." },
    presentation: { type: "string", description: "Presentación o tamaño del envase (por ejemplo Frasco 500 mL)." },
    internalFormula: { type: "string", description: "Fórmula química (por ejemplo H2SO4, C2H5OH)." },
    casNumber: { type: "string", description: "Número CAS si aparece." },
    unit: { type: "string", description: "Unidad de medida sugerida para el inventario (mL, g, unidades, L…)." },
    storageConditions: { type: "string", description: "Condiciones de almacenamiento recomendadas." },
    hazards: { type: "string", description: "Resumen breve de peligros: pictogramas, frases H o clasificación GHS." },
    isControlled: { type: "boolean", description: "true si la ficha sugiere que es un precursor químico o sustancia de doble uso controlada." },
    notes: { type: "string", description: "Resumen breve (1-2 frases) del contenido de la ficha." },
  },
  required: ["name", "itemType", "vendor", "brand", "concentration", "presentation", "internalFormula", "casNumber", "unit", "storageConditions", "hazards", "isControlled", "notes"],
} as const;

export const AI_ALLOWED_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);
export const AI_MAX_BYTES = 15 * 1024 * 1024;

const SYSTEM_PROMPT =
  "Eres un asistente experto en laboratorios que extrae información estructurada de fichas técnicas y de seguridad (SDS/MSDS/ficha técnica) de reactivos, materiales y consumibles. " +
  "Extrae únicamente datos presentes en el documento; si un campo no aparece, déjalo como cadena vacía (no inventes datos). " +
  "Responde siempre en español.";

/**
 * Extrae datos estructurados de una ficha técnica o de seguridad (PDF o imagen)
 * usando Claude. Lanza si la IA no está configurada o el documento no es legible.
 */
export async function extractTechnicalSheet(file: { buffer: Buffer; mimeType: string }): Promise<ExtractedSheet> {
  const client = getClient();
  const base64 = file.buffer.toString("base64");

  const documentBlock: Anthropic.ContentBlockParam =
    file.mimeType === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.mimeType as "image/png" | "image/jpeg" | "image/webp", data: base64 } };

  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: EXTRACTION_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          documentBlock,
          { type: "text", text: "Extrae los datos de esta ficha técnica o de seguridad de laboratorio para dar de alta el artículo en el inventario. Rellena cada campo del esquema; deja en blanco lo que no aparezca." },
        ],
      },
    ],
  });

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  if (!textBlock) throw new Error("La IA no devolvió datos legibles de la ficha.");

  let parsed: Partial<ExtractedSheet>;
  try {
    parsed = JSON.parse(textBlock.text) as Partial<ExtractedSheet>;
  } catch {
    throw new Error("No se pudo interpretar la respuesta de la IA.");
  }

  const itemType = AI_ITEM_TYPES.includes(parsed.itemType as AiItemType) ? (parsed.itemType as AiItemType) : "REAGENT";
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  return {
    name: str(parsed.name),
    itemType,
    vendor: str(parsed.vendor),
    brand: str(parsed.brand),
    concentration: str(parsed.concentration),
    presentation: str(parsed.presentation),
    internalFormula: str(parsed.internalFormula),
    casNumber: str(parsed.casNumber),
    unit: str(parsed.unit),
    storageConditions: str(parsed.storageConditions),
    hazards: str(parsed.hazards),
    isControlled: parsed.isControlled === true,
    notes: str(parsed.notes),
  };
}
