import { NextResponse } from "next/server";
import { getSql, hasDatabase } from "@/lib/db";
import { getSession, type UserSession } from "@/lib/session";
import { hasPermission, type PermissionKey } from "@/lib/authorization";
import { isResearchProfile } from "@/lib/lab-profile";
import { computeNextCode } from "@/lib/research";

// Utilidades comunes a las rutas del laboratorio de investigación: la guardia
// de acceso (perfil + permiso) y la numeración correlativa.

export type ResearchGuard =
  | { ok: true; session: UserSession; sql: ReturnType<typeof getSql> }
  | { ok: false; response: NextResponse };

/**
 * Guardia única de los módulos de investigación. Comprueba, en este orden:
 * sesión válida, perfil de laboratorio de investigación activo y permiso.
 *
 * El perfil se comprueba aquí y no solo en la navegación: mientras el
 * laboratorio no active el perfil, estos módulos no existen para él.
 */
export async function guardResearch(permission: PermissionKey = "research.view"): Promise<ResearchGuard> {
  const session = await getSession();
  if (!session) return { ok: false, response: NextResponse.json({ message: "No autorizado." }, { status: 401 }) };
  if (!isResearchProfile(session.profileCode)) {
    return {
      ok: false,
      response: NextResponse.json(
        { message: "Los módulos de investigación se activan en Configuración → Perfil del laboratorio." },
        { status: 404 },
      ),
    };
  }
  if (!hasPermission(session, permission)) {
    return { ok: false, response: NextResponse.json({ message: "No tienes permiso para esta operación." }, { status: 403 }) };
  }
  if (!hasDatabase()) {
    return {
      ok: false,
      response: NextResponse.json({ message: "Los módulos de investigación requieren base de datos." }, { status: 503 }),
    };
  }
  return { ok: true, session, sql: getSql() };
}

/**
 * Siguiente código correlativo de una tabla del módulo. Se consulta el año en
 * curso y se reintenta desde la ruta si la restricción única lo rechaza (dos
 * altas simultáneas pueden calcular el mismo número).
 */
export type ResearchTable =
  | "research_projects" | "research_samples" | "biobank_entries" | "protocols"
  | "lab_notebooks" | "notebook_entries" | "research_documents";

export async function nextResearchCode(
  sql: ReturnType<typeof getSql>,
  table: ResearchTable,
  laboratoryId: string,
  prefix: string,
  padding = 3,
): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-%`;
  // Cada consulta se escribe completa: el nombre de la tabla nunca se interpola.
  const rows = await queryCodes(sql, table, laboratoryId, pattern);
  return computeNextCode(rows, prefix, year, padding);
}

async function queryCodes(
  sql: ReturnType<typeof getSql>,
  table: ResearchTable,
  laboratoryId: string,
  pattern: string,
): Promise<string[]> {
  const rows = await (async () => {
    switch (table) {
      case "research_projects":
        return sql`SELECT code FROM research_projects WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
      case "research_samples":
        return sql`SELECT code FROM research_samples WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
      case "biobank_entries":
        return sql`SELECT code FROM biobank_entries WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
      case "protocols":
        return sql`SELECT code FROM protocols WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
      case "lab_notebooks":
        return sql`SELECT code FROM lab_notebooks WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
      case "notebook_entries":
        return sql`SELECT entry_code AS code FROM notebook_entries WHERE laboratory_id = ${laboratoryId} AND entry_code LIKE ${pattern}`;
      case "research_documents":
        return sql`SELECT code FROM research_documents WHERE laboratory_id = ${laboratoryId} AND code LIKE ${pattern}`;
    }
  })();
  return (rows as Array<{ code: string }>).map((row) => String(row.code));
}

export function isDuplicateKey(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("23505") || text.includes("duplicate key");
}

/** Inserta con reintentos cuando el correlativo choca con otro simultáneo. */
export async function insertWithCode<T>(
  attempt: (code: string) => Promise<T>,
  nextCode: () => Promise<string>,
  tries = 5,
): Promise<T | null> {
  for (let index = 0; index < tries; index += 1) {
    const code = await nextCode();
    try {
      return await attempt(code);
    } catch (error) {
      if (index === tries - 1 || !isDuplicateKey(error)) throw error;
    }
  }
  return null;
}
