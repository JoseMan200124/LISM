#!/usr/bin/env node
/**
 * Inspecciona y, con confirmación explícita, asigna el perfil educativo al
 * laboratorio principal de un usuario existente. No modifica rol, plan ni
 * datos operativos.
 */
import process from "node:process";
import pg from "pg";

const { Pool } = pg;
const targetEmail = process.env.TARGET_USER_EMAIL?.trim().toLowerCase();
const applyChange = process.env.APPLY_PROFILE_CHANGE === "true";
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!targetEmail || !/^\S+@\S+\.\S+$/.test(targetEmail) || !connectionString) {
  console.error("Define TARGET_USER_EMAIL y DIRECT_URL o DATABASE_URL. Usa APPLY_PROFILE_CHANGE=true únicamente para confirmar el cambio.");
  process.exit(1);
}

const ssl = process.env.LISM_DB_SSL_DISABLE === "true" ? false : { rejectUnauthorized: true };
const pool = new Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();

try {
  const result = await client.query(
    `SELECT
       u.id AS user_id,
       u.email,
       m.role,
       o.id AS organization_id,
       o.plan_code,
       l.id AS laboratory_id,
       ls.profile_code,
       bp.slug AS plan_slug
     FROM users u
     JOIN memberships m ON m.user_id = u.id AND m.status = 'ACTIVE'
     JOIN organizations o ON o.id = m.organization_id AND o.status = 'ACTIVE'
     JOIN laboratories l ON l.id = m.laboratory_id AND l.status = 'ACTIVE'
     LEFT JOIN laboratory_settings ls ON ls.laboratory_id = l.id
     LEFT JOIN billing_subscriptions bs
       ON bs.organization_id = o.id
      AND bs.status IN ('active', 'trialing', 'cancel_scheduled', 'payment_failed')
     LEFT JOIN billing_plans bp ON bp.id = bs.plan_id
     WHERE lower(u.email) = $1
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [targetEmail],
  );

  if (!result.rowCount) throw new Error("No existe una membresía activa para el correo indicado.");
  const account = result.rows[0];
  const counts = await client.query(
    `SELECT
       (SELECT count(*)::int FROM inventory_items WHERE laboratory_id = $1) AS inventory_items,
       (SELECT count(*)::int FROM equipment WHERE laboratory_id = $1) AS equipment,
       (SELECT count(*)::int FROM educational_practices WHERE laboratory_id = $1) AS practices,
       (SELECT count(*)::int FROM resource_reservations WHERE laboratory_id = $1) AS reservations,
       (SELECT count(*)::int FROM alerts WHERE laboratory_id = $1) AS alerts,
       (SELECT count(*)::int FROM incidents WHERE laboratory_id = $1) AS incidents`,
    [account.laboratory_id],
  );

  console.log(`[profile] cuenta=${account.email}`);
  console.log(`[profile] rol=${account.role} plan=${account.plan_slug ?? account.plan_code}`);
  console.log(`[profile] perfil_actual=${account.profile_code ?? "SIN_CONFIGURAR"}`);
  console.log(`[profile] datos_preservados=${JSON.stringify(counts.rows[0])}`);

  if (!applyChange) {
    console.log("[profile] inspección terminada; no se modificó ningún dato.");
  } else if (account.profile_code === "EDUCATIONAL_SMALL_LAB") {
    console.log("[profile] el laboratorio ya utiliza EDUCATIONAL_SMALL_LAB; no se modificó ningún dato.");
  } else {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO laboratory_settings (laboratory_id, profile_code)
         VALUES ($1, 'EDUCATIONAL_SMALL_LAB')
         ON CONFLICT (laboratory_id) DO UPDATE
         SET profile_code = EXCLUDED.profile_code, updated_at = now()`,
        [account.laboratory_id],
      );
      await client.query(
        `INSERT INTO audit_logs (
           organization_id, laboratory_id, actor_user_id, action, entity_type, entity_id,
           previous_value, new_value, reason, metadata
         ) VALUES (
           $1, $2, $3, 'LAB_PROFILE_CHANGED', 'laboratory_settings', $2,
           $4::jsonb, $5::jsonb,
           'Conversión explícita del laboratorio demo al perfil educativo',
           $6::jsonb
         )`,
        [
          account.organization_id,
          account.laboratory_id,
          account.user_id,
          JSON.stringify({ profileCode: account.profile_code }),
          JSON.stringify({ profileCode: "EDUCATIONAL_SMALL_LAB" }),
          JSON.stringify({ rolePreserved: account.role, planPreserved: account.plan_slug ?? account.plan_code, operationalDataPreserved: true }),
        ],
      );
      await client.query("COMMIT");
      console.log("[profile] perfil_nuevo=EDUCATIONAL_SMALL_LAB");
      console.log("[profile] rol, plan y datos operativos quedaron intactos.");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }
} catch (error) {
  console.error("[profile] FALLÓ:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
