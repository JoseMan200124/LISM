-- NexaLab LIS - actualización de precios de planes (estrategia de penetración
-- de mercado, ver docs/SAAS_PRICING.md). No es una migración de esquema:
-- solo actualiza el precio mensual de los 3 planes ya existentes. No borra
-- ni recrea filas, no afecta suscripciones ya activas (el precio de una
-- suscripción vigente se fija en Recurrente al momento del checkout, no
-- cambia retroactivamente para clientes ya cobrados).

UPDATE billing_plans SET price_monthly_cents = 4900,  updated_at = now() WHERE slug = 'academic_starter';
UPDATE billing_plans SET price_monthly_cents = 14900, updated_at = now() WHERE slug = 'professional';
UPDATE billing_plans SET price_monthly_cents = 29900, updated_at = now() WHERE slug = 'multi_site';
