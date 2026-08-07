import { getSql } from "@/lib/db";
import { normalizePictograms } from "@/lib/ghs";
import { COMPLIANCE_CODE_PREFIX, type ReagentCategory } from "@/lib/compliance-reagents";
import { computeNextCode } from "@/lib/research";

/**
 * Sincronización del catálogo de reactivos con el alta de un frasco.
 *
 * El catálogo describe la sustancia (CAS, clasificación, requisitos de la
 * autoridad) y el inventario describe el frasco. Antes había que capturar dos
 * veces la misma información: una al registrar el reactivo en inventario y otra
 * al darlo de alta en "Reactivos controlados → Catálogo".
 *
 * Ahora el alta de un reactivo crea o reutiliza su ficha de catálogo y enlaza el
 * frasco (`inventory_items.catalog_id`). Lo que se registra a mano en el
 * catálogo (requisitos regulatorios, permisos, sinónimos) no se pisa nunca: en
 * una ficha existente solo se rellenan los campos que estén vacíos.
 */

type CatalogSyncInput = {
  name: string;
  itemType: string;
  isControlled: boolean;
  controlKind?: string | null;
  vendor?: string;
  internalFormula?: string;
  concentration?: string;
  presentation?: string;
  storageConditions?: string;
  safetySheetUrl?: string;
  hazardPictograms?: string[];
  hazardStatements?: string;
};

/** Categoría del catálogo que corresponde al control declarado en el frasco. */
export function catalogCategoryFor(input: Pick<CatalogSyncInput, "isControlled" | "controlKind">): ReagentCategory {
  if (!input.isControlled) return "UNCONTROLLED";
  if (input.controlKind === "DUAL_USE") return "DUAL_USE";
  if (input.controlKind === "PRECURSOR") return "PRECURSOR";
  // BOTH (doble uso y precursor a la vez) es el caso más exigente.
  return "CONTROLLED";
}

/** Solo las sustancias tienen ficha de catálogo; el material de vidrio no. */
export function needsCatalogEntry(input: Pick<CatalogSyncInput, "itemType" | "isControlled">): boolean {
  return input.isControlled || input.itemType === "REAGENT" || input.itemType === "CULTURE_MEDIA";
}

function textOrNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Devuelve el id de la ficha de catálogo del reactivo, creándola si no existe.
 * `null` cuando el artículo no necesita ficha o cuando el catálogo todavía no
 * está instalado (migración 0024 sin aplicar): el alta del frasco no debe fallar
 * por eso.
 */
export async function syncReagentCatalogEntry(
  sql: ReturnType<typeof getSql>,
  laboratoryId: string,
  userId: string,
  input: CatalogSyncInput,
): Promise<string | null> {
  if (!needsCatalogEntry(input)) return null;

  const name = input.name.trim();
  if (!name) return null;
  const category = catalogCategoryFor(input);
  const pictograms = normalizePictograms(input.hazardPictograms ?? []);

  try {
    // Se busca por nombre exacto sin distinguir mayúsculas: es como el
    // laboratorio identifica la sustancia al escribirla en el alta.
    const existing = await sql`
      SELECT id, category FROM reagent_catalog
      WHERE laboratory_id = ${laboratoryId} AND lower(name) = lower(${name}) AND status = 'ACTIVE'
      LIMIT 1
    `;
    const found = existing[0] as Record<string, unknown> | undefined;

    if (found) {
      // Ficha existente: se completan huecos y se eleva la clasificación si el
      // frasco declara un control que la ficha todavía no tenía. Nunca se
      // degrada a "no controlado" desde aquí.
      const upgrade = category !== "UNCONTROLLED" && String(found.category) === "UNCONTROLLED";
      await sql`
        UPDATE reagent_catalog SET
          category = ${upgrade ? category : String(found.category)},
          formula = COALESCE(formula, ${textOrNull(input.internalFormula)}),
          concentration = COALESCE(concentration, ${textOrNull(input.concentration)}),
          presentation = COALESCE(presentation, ${textOrNull(input.presentation)}),
          default_vendor = COALESCE(default_vendor, ${textOrNull(input.vendor)}),
          hazard_statements = COALESCE(hazard_statements, ${textOrNull(input.hazardStatements)}),
          storage_conditions = COALESCE(storage_conditions, ${textOrNull(input.storageConditions)}),
          sds_url = COALESCE(sds_url, ${textOrNull(input.safetySheetUrl)}),
          hazard_pictograms = CASE
            WHEN hazard_pictograms = '[]'::jsonb THEN ${JSON.stringify(pictograms)}::jsonb
            ELSE hazard_pictograms END,
          updated_at = now()
        WHERE id = ${String(found.id)} AND laboratory_id = ${laboratoryId}
      `;
      return String(found.id);
    }

    const year = new Date().getFullYear();
    const codes = await sql`
      SELECT code FROM reagent_catalog
      WHERE laboratory_id = ${laboratoryId} AND code LIKE ${`${COMPLIANCE_CODE_PREFIX.catalog}-${year}-%`}
    `;
    const code = computeNextCode((codes as Array<{ code: string }>).map((row) => String(row.code)), COMPLIANCE_CODE_PREFIX.catalog, year, 4);

    const created = await sql`
      INSERT INTO reagent_catalog (
        laboratory_id, code, name, formula, concentration, presentation, default_vendor,
        category, hazard_pictograms, hazard_statements, storage_conditions, sds_url,
        requires_preapproval, created_by
      ) VALUES (
        ${laboratoryId}, ${code}, ${name}, ${textOrNull(input.internalFormula)}, ${textOrNull(input.concentration)},
        ${textOrNull(input.presentation)}, ${textOrNull(input.vendor)}, ${category},
        ${JSON.stringify(pictograms)}::jsonb, ${textOrNull(input.hazardStatements)},
        ${textOrNull(input.storageConditions)}, ${textOrNull(input.safetySheetUrl)},
        ${category !== "UNCONTROLLED"}, ${userId}
      )
      RETURNING id
    `;
    return String(created[0].id);
  } catch {
    // Sin la migración 0024 no existe `reagent_catalog`. El frasco se registra
    // igual y queda sin enlazar; al aplicar la migración, las altas siguientes
    // vuelven a crear su ficha.
    return null;
  }
}
