import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Pool, type QueryResultRow } from "pg";

// Soporte dual de driver, requerido para poder apuntar a Azure Database for
// PostgreSQL Flexible Server además de Neon (ver lism-infra, módulo
// `postgres`, y docs/database-migration-neon-to-azure.md en ese repo).
//
// `@neondatabase/serverless` habla el protocolo HTTP propietario de Neon —
// NO funciona contra un servidor PostgreSQL genérico. Por eso, cuando
// DATABASE_DRIVER=azure_postgresql, se usa `pg` (wire protocol estándar) en
// su lugar, envuelto en un adaptador de tagged-template que imita la firma
// de `neon()` para que el resto del código (40+ llamadas a `sql\`...\``` en
// todo el repo) no necesite cambiar ni una línea.
//
// DATABASE_DRIVER es una variable NO secreta (se define junto al resto de
// env vars de despliegue). Si no está definida, el comportamiento es
// exactamente el de antes (Neon) — cero riesgo para despliegues existentes
// en Vercel.

type SqlFn = NeonQueryFunction<false, false>;

let cachedSql: SqlFn | null = null;
let pgPool: Pool | null = null;

export function hasDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function usesAzurePostgresDriver(): boolean {
  return process.env.DATABASE_DRIVER === "azure_postgresql";
}

/**
 * Convierte una llamada de template literal `sql\`SELECT * FROM x WHERE id = ${id}\``
 * en una consulta parametrizada de `pg` (`$1`, `$2`, …) y devuelve solo las
 * filas — mismo contrato observable que `neon()` en modo `{ fullResults: false }`.
 */
function buildPgTaggedTemplate(pool: Pool): SqlFn {
  async function sql(strings: TemplateStringsArray, ...values: unknown[]): Promise<QueryResultRow[]> {
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) {
      text += `$${i + 1}${strings[i + 1] ?? ""}`;
    }
    const result = await pool.query(text, values);
    return result.rows;
  }
  return sql as unknown as SqlFn;
}

export function getSql(): SqlFn {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL no está configurada.");
  }

  if (cachedSql) return cachedSql;

  if (usesAzurePostgresDriver()) {
    pgPool = new Pool({
      connectionString,
      // LISM_DB_SSL_DISABLE es solo para Postgres local de desarrollo/pruebas
      // (sin TLS). Azure Postgres Flexible Server y Neon siempre requieren
      // SSL en producción/staging — no se desactiva por defecto. A propósito
      // NO se usa el nombre "PGSSLMODE": `pg` lo reconoce internamente y lo
      // consulta por su cuenta en ciertos casos, lo que puede pisar este
      // mismo valor de forma confusa — un nombre propio evita esa colisión.
      ssl: process.env.LISM_DB_SSL_DISABLE === "true" ? false : { rejectUnauthorized: true },
      max: 5,
      idleTimeoutMillis: 30_000,
      // `pg` no tiene timeout de conexión por defecto (espera indefinidamente).
      // Sin esto, un problema de red/DNS/credenciales hace que /api/health
      // (y por lo tanto los liveness/readiness probes de Container Apps)
      // se cuelguen en vez de fallar rápido con un error legible.
      connectionTimeoutMillis: 5_000,
    });
    // Sin este listener, un error en un cliente inactivo del pool (p. ej. el
    // servidor cierra la conexión, un fallo de red transitorio) emite un
    // evento "error" no manejado en el Pool que TUMBA TODO EL PROCESO de
    // Node (comportamiento documentado de `pg`, no específico de Next.js).
    // Capturarlo aquí evita que un problema de conexión a la base de datos
    // se convierta en un crash-loop del contenedor entero.
    pgPool.on("error", (error) => {
      console.error("[lib/db] Error inesperado en el pool de PostgreSQL:", error.message);
    });
    cachedSql = buildPgTaggedTemplate(pgPool);
  } else {
    cachedSql = neon(connectionString);
  }

  return cachedSql;
}
