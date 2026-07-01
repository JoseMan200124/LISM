#!/usr/bin/env node
// Bootstrap del primer usuario administrador de un laboratorio en
// producción. NO es un seed de demo: no inserta datos ficticios de
// organización/laboratorio salvo que la base esté completamente vacía (caso
// típico tras aplicar solo migraciones de esquema, sin seeds).
//
// Idempotente: si el email ya existe, no hace nada y termina con éxito
// (nunca sobreescribe una contraseña existente por accidente).
//
// Uso:
//   ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... node scripts/create-admin-user.mjs
//
// Variables:
//   ADMIN_EMAIL     (requerida)
//   ADMIN_NAME      (requerida)
//   ADMIN_PASSWORD  (requerida) — nunca se imprime ni se registra.
//   ADMIN_ROLE      (opcional, default LAB_ADMIN)
//   ORG_NAME        (opcional, default "NexaLab")
//   ORG_SLUG        (opcional, default derivado de ORG_NAME)
//   LAB_NAME        (opcional, default "Laboratorio Central")
//   LAB_CODE        (opcional, default "PRINCIPAL")

import pg from "pg";

const { Pool } = pg;

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function main() {
  const adminEmail = required("ADMIN_EMAIL").trim().toLowerCase();
  const adminName = required("ADMIN_NAME").trim();
  const adminPassword = required("ADMIN_PASSWORD");
  const adminRole = process.env.ADMIN_ROLE || "LAB_ADMIN";
  const orgName = process.env.ORG_NAME || "NexaLab";
  const orgSlug = process.env.ORG_SLUG || slugify(orgName);
  const labName = process.env.LAB_NAME || "Laboratorio Central";
  const labCode = process.env.LAB_CODE || "PRINCIPAL";

  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Define DIRECT_URL o DATABASE_URL.");
  }

  const ssl = process.env.LISM_DB_SSL_DISABLE === "true" ? false : { rejectUnauthorized: true };
  const pool = new Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 10_000 });
  const client = await pool.connect();

  try {
    const existing = await client.query("SELECT id FROM users WHERE lower(email) = $1", [adminEmail]);
    if (existing.rows.length > 0) {
      console.log(`[create-admin] ${adminEmail} ya existe — no se modifica nada.`);
      return;
    }

    await client.query("BEGIN");

    let orgResult = await client.query("SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1");
    let organizationId;
    if (orgResult.rows.length > 0) {
      organizationId = orgResult.rows[0].id;
      console.log(`[create-admin] usando organización existente ${organizationId}`);
    } else {
      const inserted = await client.query(
        "INSERT INTO organizations (name, slug, plan_code) VALUES ($1, $2, 'STARTER') RETURNING id",
        [orgName, orgSlug],
      );
      organizationId = inserted.rows[0].id;
      console.log(`[create-admin] organización creada: ${orgName} (${organizationId})`);
    }

    let labResult = await client.query(
      "SELECT id FROM laboratories WHERE organization_id = $1 ORDER BY created_at ASC LIMIT 1",
      [organizationId],
    );
    let laboratoryId;
    if (labResult.rows.length > 0) {
      laboratoryId = labResult.rows[0].id;
      console.log(`[create-admin] usando laboratorio existente ${laboratoryId}`);
    } else {
      const inserted = await client.query(
        "INSERT INTO laboratories (organization_id, name, code) VALUES ($1, $2, $3) RETURNING id",
        [organizationId, labName, labCode],
      );
      laboratoryId = inserted.rows[0].id;
      console.log(`[create-admin] laboratorio creado: ${labName} (${laboratoryId})`);
    }

    // bcrypt vía pgcrypto (misma familia de hash que bcryptjs usa para
    // verificar en app/api/auth/login/route.ts — formato $2a$/$2b$
    // interoperable). El password nunca se interpola en el texto SQL, viaja
    // como parámetro.
    const userResult = await client.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES ($1, $2, crypt($3, gen_salt('bf', 12)))
       RETURNING id`,
      [adminName, adminEmail, adminPassword],
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO memberships (organization_id, laboratory_id, user_id, role)
       VALUES ($1, $2, $3, $4)`,
      [organizationId, laboratoryId, userId, adminRole],
    );

    await client.query("COMMIT");
    console.log(`[create-admin] usuario ${adminEmail} creado con rol ${adminRole} en laboratorio ${laboratoryId}.`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[create-admin] FALLÓ:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
