-- NexaLab - traducción del texto comercial de los planes.
--
-- No es una migración de esquema: la web pública es en español y las tarjetas
-- de precios mostraban la descripción y las características en inglés, además
-- de mencionar "LISM" (el nombre interno del repositorio) delante del cliente.
--
-- Solo se tocan `description` y `features`, que son texto de presentación. No
-- se cambia `slug`, `name`, `price_monthly_cents` ni los límites: el slug es la
-- clave que usa el checkout y el precio de una suscripción vigente se fija en
-- Recurrente al contratar, no se recalcula desde aquí.
--
-- El mismo texto está replicado en el fallback sin base de datos de
-- `lib/billing-plans-data.ts`; si se edita uno, hay que editar el otro.

UPDATE billing_plans
SET description = 'Para laboratorios académicos que empiezan a digitalizar su operación.',
    features = '["Hasta 5 usuarios","1 laboratorio","Inventario y equipos","Alertas y reportes básicos","Soporte por correo"]'::jsonb,
    updated_at = now()
WHERE slug = 'academic_starter';

UPDATE billing_plans
SET description = 'Para laboratorios en crecimiento que necesitan más usuarios y trazabilidad completa.',
    features = '["Hasta 12 usuarios","1 laboratorio","Muestras, resultados y calidad","Inventario, equipos y alertas","Historial de auditoría","Soporte prioritario"]'::jsonb,
    updated_at = now()
WHERE slug = 'professional';

UPDATE billing_plans
SET description = 'Para organizaciones que coordinan varios laboratorios o sedes.',
    features = '["Hasta 30 usuarios","Hasta 3 laboratorios","Coordinación entre sedes","Inventario, equipos y calidad","Historial de auditoría","Reportes consolidados","Soporte dedicado"]'::jsonb,
    updated_at = now()
WHERE slug = 'multi_site';
