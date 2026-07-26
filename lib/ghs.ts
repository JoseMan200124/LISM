// Pictogramas de peligrosidad del Sistema Globalmente Armonizado (SGA/GHS) y
// los procedimientos de seguridad asociados.
//
// Los nueve pictogramas se dibujan en la aplicación (components/ghs-pictogram.tsx)
// a partir de estos datos: no dependen de archivos ni de servicios externos, así
// que la ficha de seguridad se ve igual en la web, en la app móvil y en una
// etiqueta impresa aunque el laboratorio esté sin conexión.
//
// Los procedimientos que se listan aquí son la guía general por tipo de peligro.
// Cada laboratorio puede sobrescribirlos por reactivo (inventory_items.safety_procedures)
// y siempre debe consultarse la ficha de datos de seguridad (SDS) del proveedor,
// que es la fuente autorizada.

export type GhsCode =
  | "GHS01" | "GHS02" | "GHS03" | "GHS04" | "GHS05" | "GHS06" | "GHS07" | "GHS08" | "GHS09";

export type SafetyProcedureKey =
  | "firstAid" | "spill" | "fire" | "ppe" | "storage" | "disposal" | "emergencyContact";

export type GhsPictogram = {
  code: GhsCode;
  /** Nombre corto tal como aparece en la etiqueta. */
  name: string;
  /** Qué significa el pictograma, en lenguaje llano. */
  meaning: string;
  /** Ejemplos típicos de reactivos de laboratorio. */
  examples: string;
  /** Qué hacer en caso de accidente con un producto que lo lleva. */
  emergency: string;
  /** Equipo de protección mínimo recomendado. */
  ppe: string;
};

export const GHS_PICTOGRAMS: readonly GhsPictogram[] = [
  {
    code: "GHS01",
    name: "Explosivo",
    meaning: "Explosivo, autorreactivo o peróxido orgánico capaz de explotar por calor, choque o fricción.",
    examples: "Ácido pícrico seco, azidas, peróxidos orgánicos, nitratos orgánicos.",
    emergency: "Evacuar el área de inmediato y avisar al responsable del laboratorio. No intentar mover, golpear ni enfriar el envase. Cortar toda fuente de ignición desde fuera del área si puede hacerse sin riesgo y llamar a emergencias.",
    ppe: "Pantalla facial, bata ignífuga y trabajo detrás de barrera o pantalla de seguridad.",
  },
  {
    code: "GHS02",
    name: "Inflamable",
    meaning: "Líquido, sólido, gas o aerosol que se enciende con facilidad; también sustancias pirofóricas o que emiten gases inflamables con el agua.",
    examples: "Etanol, metanol, acetona, éter etílico, hexano, sodio metálico.",
    emergency: "Cortar la fuente de ignición y ventilar. Si hay fuego pequeño y contenido, sofocar con extintor de CO₂ o polvo químico seco (nunca agua en disolventes). Si la ropa se incendia: detenerse, tirarse al suelo y rodar, o usar la ducha de seguridad.",
    ppe: "Bata de algodón, guantes resistentes a disolventes, gafas de seguridad y campana de extracción.",
  },
  {
    code: "GHS03",
    name: "Comburente",
    meaning: "Oxidante que puede provocar o agravar un incendio y hacer arder materiales que normalmente no arden.",
    examples: "Peróxido de hidrógeno concentrado, permanganato de potasio, ácido nítrico, cloratos.",
    emergency: "Alejar cualquier material combustible (papel, disolventes, trapos). En caso de fuego usar abundante agua a distancia salvo indicación contraria de la SDS. No usar trapos ni serrín para recoger un derrame: pueden inflamarse.",
    ppe: "Guantes de nitrilo, gafas de seguridad o pantalla facial y bata; manipular en campana.",
  },
  {
    code: "GHS04",
    name: "Gas a presión",
    meaning: "Gas comprimido, licuado o disuelto; puede explotar con el calor y los gases licuados refrigerados causan quemaduras por frío.",
    examples: "Nitrógeno, oxígeno, argón, dióxido de carbono, nitrógeno líquido.",
    emergency: "Cerrar la válvula si es seguro hacerlo, ventilar el área y evacuar ante fugas. Ante quemadura por frío, enjuagar con agua templada sin frotar y solicitar atención médica. Riesgo de asfixia en espacios cerrados: salir y no volver a entrar sin medición de oxígeno.",
    ppe: "Guantes criogénicos si aplica, pantalla facial y sujeción del cilindro con cadena o soporte.",
  },
  {
    code: "GHS05",
    name: "Corrosivo",
    meaning: "Provoca quemaduras graves en la piel, lesiones oculares serias o corroe los metales.",
    examples: "Ácido sulfúrico, ácido clorhídrico, hidróxido de sodio, amoníaco concentrado.",
    emergency: "Enjuagar la zona afectada con agua durante al menos 15 minutos (ducha de seguridad o lavaojos), retirando la ropa contaminada. No neutralizar sobre la piel. Solicitar atención médica siempre que haya contacto con los ojos o quemadura visible.",
    ppe: "Guantes resistentes a químicos, gafas de seguridad cerradas o pantalla facial, bata y delantal.",
  },
  {
    code: "GHS06",
    name: "Toxicidad aguda",
    meaning: "Tóxico o mortal por inhalación, ingestión o contacto con la piel, incluso en cantidades pequeñas.",
    examples: "Cianuros, metanol, azida de sodio, sales de mercurio, arsenicales.",
    emergency: "Retirar a la persona al aire libre sin exponerse. No inducir el vómito salvo indicación expresa de la SDS. Llamar de inmediato a emergencias y al centro de intoxicaciones, llevando la etiqueta o la SDS del producto.",
    ppe: "Guantes dobles, campana de extracción obligatoria, gafas de seguridad y bata cerrada.",
  },
  {
    code: "GHS07",
    name: "Nocivo o irritante",
    meaning: "Irrita la piel, los ojos o las vías respiratorias, produce somnolencia o es nocivo si se ingiere o inhala.",
    examples: "Etilenglicol, cloruro de metileno, muchos detergentes y disolventes de uso común.",
    emergency: "Lavar la zona con agua abundante y jabón. Ante irritación respiratoria, salir a un lugar ventilado. Si la molestia persiste o hay contacto ocular, acudir al servicio médico con la ficha del producto.",
    ppe: "Guantes de nitrilo, gafas de seguridad y ventilación adecuada.",
  },
  {
    code: "GHS08",
    name: "Peligro para la salud",
    meaning: "Cancerígeno, mutágeno, tóxico para la reproducción, sensibilizante respiratorio o con toxicidad sobre órganos.",
    examples: "Benceno, formaldehído, bromuro de etidio, cloroformo, acrilamida.",
    emergency: "Retirar a la persona de la exposición y registrar el incidente aunque no haya síntomas: estos efectos pueden aparecer tarde. Solicitar valoración médica indicando el producto y el tiempo de exposición.",
    ppe: "Campana de extracción, guantes adecuados al producto, bata y control de exposición documentado.",
  },
  {
    code: "GHS09",
    name: "Peligro ambiental",
    meaning: "Tóxico para los organismos acuáticos, con efectos duraderos sobre el medio ambiente.",
    examples: "Sales de metales pesados, plaguicidas, compuestos organoclorados.",
    emergency: "Contener el derrame con material absorbente inerte y evitar que llegue al desagüe. Recoger en envase identificado como residuo peligroso y avisar al responsable de gestión de residuos.",
    ppe: "Guantes, gafas y kit de contención de derrames a mano.",
  },
] as const;

const PICTOGRAM_BY_CODE = new Map(GHS_PICTOGRAMS.map((pictogram) => [pictogram.code, pictogram]));

export function ghsPictogram(code: string): GhsPictogram | undefined {
  return PICTOGRAM_BY_CODE.get(code as GhsCode);
}

export function isGhsCode(value: unknown): value is GhsCode {
  return typeof value === "string" && PICTOGRAM_BY_CODE.has(value as GhsCode);
}

/** Normaliza el valor guardado en inventory_items.hazard_pictograms. */
export function normalizePictograms(value: unknown): GhsCode[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? safeParseArray(value) : [];
  const seen = new Set<GhsCode>();
  for (const entry of list) {
    const code = typeof entry === "string" ? entry.trim().toUpperCase() : "";
    if (isGhsCode(code)) seen.add(code);
  }
  // Se devuelven en el orden oficial del SGA, no en el de captura.
  return GHS_PICTOGRAMS.filter((pictogram) => seen.has(pictogram.code)).map((pictogram) => pictogram.code);
}

function safeParseArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const SAFETY_PROCEDURE_LABELS: Record<SafetyProcedureKey, string> = {
  firstAid: "Primeros auxilios",
  spill: "Derrame o fuga",
  fire: "Incendio",
  ppe: "Equipo de protección",
  storage: "Almacenamiento seguro",
  disposal: "Eliminación de residuos",
  emergencyContact: "Contacto de emergencia",
};

export const SAFETY_PROCEDURE_KEYS = Object.keys(SAFETY_PROCEDURE_LABELS) as SafetyProcedureKey[];

export type SafetyProcedures = Partial<Record<SafetyProcedureKey, string>>;

export function normalizeSafetyProcedures(value: unknown): SafetyProcedures {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: SafetyProcedures = {};
  for (const key of SAFETY_PROCEDURE_KEYS) {
    const text = source[key];
    if (typeof text === "string" && text.trim()) result[key] = text.trim();
  }
  return result;
}

// Procedimiento general que se aplica en cualquier accidente de laboratorio,
// haya o no pictogramas declarados. Es lo primero que ve quien abre la ficha.
export const GENERAL_EMERGENCY_STEPS: readonly string[] = [
  "Mantener la calma y alejar a las personas del punto del accidente.",
  "Cortar la fuente del peligro si puede hacerse sin exponerse (cerrar válvula, apagar equipo, tapar el envase).",
  "Avisar de inmediato al responsable del laboratorio o al docente a cargo.",
  "Ante contacto con la piel o los ojos, usar la ducha de seguridad o el lavaojos durante 15 minutos como mínimo.",
  "Llevar la etiqueta o la ficha de datos de seguridad (SDS) del producto al personal médico.",
  "Registrar el hecho como incidencia en NexaLab al terminar la atención.",
] as const;

/**
 * Procedimientos aplicables a un reactivo: los que escribió el laboratorio y,
 * cuando falta alguno, la guía general derivada de sus pictogramas. Así la
 * ficha nunca aparece vacía aunque nadie haya redactado el procedimiento.
 */
export function resolveSafetyGuidance(
  pictograms: readonly GhsCode[],
  procedures: SafetyProcedures,
): Array<{ key: SafetyProcedureKey; label: string; text: string; source: "lab" | "ghs" }> {
  const codes = normalizePictograms(pictograms);
  const declared = codes.map((code) => PICTOGRAM_BY_CODE.get(code)!).filter(Boolean);

  const fallback: Partial<Record<SafetyProcedureKey, string>> = {};
  if (declared.length) {
    fallback.firstAid = declared.map((pictogram) => `${pictogram.name}: ${pictogram.emergency}`).join("\n\n");
    fallback.ppe = declared.map((pictogram) => `${pictogram.name}: ${pictogram.ppe}`).join("\n\n");
  }

  const result: Array<{ key: SafetyProcedureKey; label: string; text: string; source: "lab" | "ghs" }> = [];
  for (const key of SAFETY_PROCEDURE_KEYS) {
    const own = procedures[key];
    if (own) {
      result.push({ key, label: SAFETY_PROCEDURE_LABELS[key], text: own, source: "lab" });
      continue;
    }
    const generic = fallback[key];
    if (generic) result.push({ key, label: SAFETY_PROCEDURE_LABELS[key], text: generic, source: "ghs" });
  }
  return result;
}
