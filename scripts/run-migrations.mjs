#!/usr/bin/env node
// Runner seguro de migraciones SQL crudas para LISM.
//
// Por qué existe: las migraciones en database/*.sql no son necesariamente
// idempotentes (algunas son CREATE TABLE completos, sin IF NOT EXISTS). Este
// runner lleva un registro de qué archivo ya se aplicó (con su checksum) en
// la tabla `schema_migrations`, para nunca reaplicar nada ni reordenar.
//
// No se ejecuta automáticamente al arrancar la aplicación (eso violaría el
// principio de "no migraciones automáticas en cada arranque"). Se invoca
// manualmente: `node scripts/run-migrations.mjs`, normalmente desde el
// Container Apps Job de migraciones (ver lism-infra/modules/container-apps)
// o el workflow run-migrations.yml.
//
// Por convención, los archivos que contienen "_seed_" u "_optional_" en el
// nombre se OMITEN salvo que se pasen explícitamente las flags
// --include-seeds / --include-optional. Hoy eso cubre:
//   - 0002_seed_demo.sql, 0005_seed_configurable_demo.sql,
//     0008_seed_educational_demo.sql -> nunca en producción.
//   - 0003_optional_rls.sql -> documentado en database/README.md como
//     "no se aplica automáticamente", requiere validación previa.
//
// Uso:
//   node scripts/run-migrations.mjs                  # solo migraciones de esquema
//   node scripts/run-migrations.mjs --include-seeds   # + seeds (nunca en prod)
//   node scripts/run-migrations.mjs --dry-run         # solo muestra qué aplicaría

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

const DATABASE_DIR = path.resolve(import.meta.dirname, "..", "database");
const ADVISORY_LOCK_KEY = 727_001; // arbitrario, fijo y exclusivo de LISM — evita ejecuciones concurrentes

const args = new Set(process.argv.slice(2));
const includeSeeds = args.has("--include-seeds");
const includeOptional = args.has("--include-optional");
const dryRun = args.has("--dry-run");

function getConnectionString() {
  const value = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Define DIRECT_URL o DATABASE_URL antes de ejecutar las migraciones.");
  }
  return value;
}

function shouldSkipByConvention(filename) {
  if (filename.includes("_seed_") && !includeSeeds) return "seed (usa --include-seeds para forzar)";
  if (filename.includes("_optional_") && !includeOptional) return "opcional (usa --include-optional para forzar)";
  return null;
}

async function listMigrationFiles() {
  const entries = await readdir(DATABASE_DIR);
  return entries
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query("SELECT filename, checksum FROM schema_migrations");
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.filename, row.checksum);
  }
  return map;
}

function checksumOf(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

async function applyMigration(client, filename, content) {
  await client.query("BEGIN");
  try {
    await client.query(content);
    await client.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
      [filename, checksumOf(content)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  const connectionString = getConnectionString();
  // Ver nota en lib/db.ts sobre por qué se usa LISM_DB_SSL_DISABLE y no PGSSLMODE.
  const ssl = process.env.LISM_DB_SSL_DISABLE === "true" ? false : { rejectUnauthorized: true };
  const pool = new Pool({ connectionString, ssl, max: 1 });
  const client = await pool.connect();

  console.log(`[migrate] conectado (host oculto por seguridad), dry-run=${dryRun}`);

  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    console.log("[migrate] lock adquirido");

    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = await listMigrationFiles();

    let appliedCount = 0;
    let skippedCount = 0;

    for (const filename of files) {
      const skipReason = shouldSkipByConvention(filename);
      if (skipReason) {
        console.log(`[migrate] omitido ${filename} (${skipReason})`);
        skippedCount += 1;
        continue;
      }

      const content = await readFile(path.join(DATABASE_DIR, filename), "utf8");
      const checksum = checksumOf(content);
      const appliedChecksum = applied.get(filename);

      if (appliedChecksum) {
        if (appliedChecksum !== checksum) {
          throw new Error(
            `${filename} ya fue aplicado con un checksum distinto. No modifiques migraciones ya aplicadas — crea una migración nueva en su lugar.`,
          );
        }
        console.log(`[migrate] ya aplicado ${filename}`);
        continue;
      }

      if (dryRun) {
        console.log(`[migrate] (dry-run) aplicaría ${filename}`);
        continue;
      }

      console.log(`[migrate] aplicando ${filename}…`);
      await applyMigration(client, filename, content);
      appliedCount += 1;
      console.log(`[migrate] OK ${filename}`);
    }

    console.log(`[migrate] listo. aplicadas=${appliedCount} omitidas=${skippedCount}`);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]).catch(() => {});
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] FALLÓ:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
