#!/usr/bin/env node
/**
 * Aprovisiona un tenant EDUCATIONAL_SMALL_LAB vacío y aislado.
 * No modifica tenants existentes y exige una contraseña solo mediante entorno.
 */
import process from "node:process";
import bcrypt from "bcryptjs";
import pg from "pg";

const { Pool } = pg;
const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const organizationName = option("--name");
const slug = option("--slug");
const laboratoryName = option("--laboratory") ?? `${organizationName ?? ""} · Laboratorio educativo`;
const adminName = option("--admin-name") ?? "Administrador del laboratorio";
const adminEmail = option("--admin-email")?.toLowerCase();
const planSlug = option("--plan");
const includeRules = argv.includes("--include-rules");
const password = process.env.CLEAN_TENANT_ADMIN_PASSWORD;
const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const planCodes = {
  academic_starter: "ACADEMIC_STARTER",
  professional: "PROFESSIONAL",
  multi_site: "MULTI_SITE",
};

if (!organizationName || !slug || !adminEmail || !password || !connectionString) {
  console.error("Uso: CLEAN_TENANT_ADMIN_PASSWORD='<valor seguro>' node scripts/create-clean-educational-tenant.mjs --name '<institución>' --slug '<slug-único>' --admin-email '<correo>' [--admin-name '<nombre>'] [--laboratory '<nombre>'] [--plan academic_starter|professional|multi_site] [--include-rules]");
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("El slug solo puede contener minúsculas, números y guiones.");
if (!/^\S+@\S+\.\S+$/.test(adminEmail)) throw new Error("El correo del administrador no es válido.");
if (password.length < 12) throw new Error("CLEAN_TENANT_ADMIN_PASSWORD debe tener al menos 12 caracteres.");
if (planSlug && !Object.hasOwn(planCodes, planSlug)) throw new Error("El plan debe ser academic_starter, professional o multi_site.");

const ssl = process.env.LISM_DB_SSL_DISABLE === "true" ? false : { rejectUnauthorized: true };
const pool = new Pool({ connectionString, ssl, max: 1, connectionTimeoutMillis: 10_000 });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const exists = await client.query("SELECT 1 FROM organizations WHERE slug = $1 UNION ALL SELECT 1 FROM users WHERE lower(email) = $2 LIMIT 1", [slug, adminEmail]);
  if (exists.rowCount) throw new Error("El slug o el correo ya existen. No se modificó ningún tenant.");

  let plan = null;
  if (planSlug) {
    const planResult = await client.query("SELECT id, slug, name FROM billing_plans WHERE slug = $1 AND is_active = TRUE LIMIT 1", [planSlug]);
    if (!planResult.rowCount) throw new Error(`El plan ${planSlug} no existe o no está activo.`);
    plan = planResult.rows[0];
  }

  const planCode = planSlug ? planCodes[planSlug] : "EDUCATIONAL";
  const organization = await client.query("INSERT INTO organizations (name, slug, plan_code, locale, timezone) VALUES ($1, $2, $3, 'es-GT', 'America/Guatemala') RETURNING id", [organizationName, slug, planCode]);
  const organizationId = organization.rows[0].id;
  const laboratory = await client.query("INSERT INTO laboratories (organization_id, name, code) VALUES ($1, $2, 'EDU-01') RETURNING id", [organizationId, laboratoryName]);
  const laboratoryId = laboratory.rows[0].id;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await client.query("INSERT INTO users (full_name, email, password_hash, preferences) VALUES ($1, $2, $3, $4::jsonb) RETURNING id", [adminName, adminEmail, passwordHash, JSON.stringify({ theme: "system" })]);
  const userId = user.rows[0].id;

  await client.query("INSERT INTO memberships (organization_id, laboratory_id, user_id, role) VALUES ($1, $2, $3, 'LAB_ADMIN')", [organizationId, laboratoryId, userId]);
  await client.query("INSERT INTO laboratory_settings (laboratory_id, profile_code, strict_mode, allow_custom_fields) VALUES ($1, 'EDUCATIONAL_SMALL_LAB', TRUE, TRUE)", [laboratoryId]);

  if (plan) {
    await client.query(
      `INSERT INTO billing_subscriptions (
        organization_id, plan_id, status, current_period_start, current_period_end, is_trial, metadata
      ) VALUES ($1, $2, 'active', now(), now() + interval '1 year', FALSE, $3::jsonb)`,
      [organizationId, plan.id, JSON.stringify({ provisioningSource: "clean-educational-tenant", testAccount: true })],
    );
  }
  const categories = [
    ["REACTIVOS", "Reactivos", "REA", "Sustancias utilizadas en prácticas."],
    ["MATERIALES", "Materiales", "MAT", "Material reutilizable o desechable."],
    ["INSUMOS", "Insumos", "INS", "Consumibles generales del laboratorio."],
    ["MEDIOS", "Medios de cultivo", "MED", "Medios preparados o comerciales."],
    ["OTROS", "Otros", "OTR", "Artículos que no pertenecen a otra categoría."],
  ];
  for (const [code, name, prefix, description] of categories) {
    await client.query("INSERT INTO inventory_categories (laboratory_id, code, name, prefix, description) VALUES ($1, $2, $3, $4, $5)", [laboratoryId, code, name, prefix, description]);
  }

  if (includeRules) {
    const rules = [
      ["EDU_LOW_STOCK", "Inventario bajo mínimo", "INVENTORY_ITEM", "THRESHOLD", "WARNING"],
      ["EDU_CALIBRATION_OVERDUE", "Calibración vencida", "EQUIPMENT_PLAN", "DATE_OVERDUE", "HIGH"],
      ["EDU_CRITICAL_INCIDENT", "Incidencia crítica sin atender", "INCIDENT", "AGE", "CRITICAL"],
    ];
    for (const [key, name, source, trigger, severity] of rules) {
      await client.query("INSERT INTO alert_rules (laboratory_id, rule_key, name, source_type, trigger_type, severity, recipient_config, channel_config, active, created_by) VALUES ($1, $2, $3, $4, $5, $6::alert_severity, $7::jsonb, $8::jsonb, TRUE, $9)", [laboratoryId, key, name, source, trigger, severity, JSON.stringify({ roles: ["LAB_ADMIN", "HEAD_OF_LAB"] }), JSON.stringify(["IN_APP"]), userId]);
    }
  }

  await client.query(
    `INSERT INTO audit_logs (
      organization_id, laboratory_id, actor_user_id, action, entity_type, entity_id,
      new_value, reason, metadata
    ) VALUES ($1, $2, $3, 'EDUCATIONAL_TENANT_PROVISIONED', 'organization', $1,
      $4::jsonb, 'Aprovisionamiento explícito de tenant educativo vacío', $5::jsonb)`,
    [
      organizationId,
      laboratoryId,
      userId,
      JSON.stringify({ organizationName, laboratoryId, adminEmail, planSlug: plan?.slug ?? null }),
      JSON.stringify({ includeRules, testAccount: Boolean(plan) }),
    ],
  );

  await client.query("COMMIT");
  console.log("Tenant educativo vacío creado correctamente.");
  console.log(`Organización: ${organizationName} (${slug})`);
  console.log(`Laboratorio: ${laboratoryName}`);
  console.log(`Administrador: ${adminEmail}`);
  if (plan) console.log(`Plan: ${plan.name} (${plan.slug})`);
  console.log("Sin artículos, equipos, prácticas, reservas, alertas ficticias ni logo institucional.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("No se creó el tenant:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
