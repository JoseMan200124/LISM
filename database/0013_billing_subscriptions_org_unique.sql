-- Migration: 0013_billing_subscriptions_org_unique.sql
-- Corrige lib/billing-checkout.ts: el INSERT ... ON CONFLICT (organization_id)
-- DO UPDATE sobre billing_subscriptions siempre fallaba con
-- "42P10: no unique or exclusion constraint matching the ON CONFLICT
-- specification" porque organization_id solo tenía un índice normal
-- (idx_billing_subscriptions_organization_id, migración 0009), nunca una
-- restricción UNIQUE real. Esto rompía todo intento de suscripción justo
-- después de crear el checkout en Recurrente.
-- Idempotente: safe to run multiple times.

-- Por si alguna fila quedó duplicada por organization_id (no debería, ya que
-- el INSERT afectado nunca llegó a completarse con éxito), nos quedamos con
-- la más reciente antes de poder crear la restricción UNIQUE.
DELETE FROM billing_subscriptions a
USING billing_subscriptions b
WHERE a.organization_id = b.organization_id
  AND a.id <> b.id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

DROP INDEX IF EXISTS idx_billing_subscriptions_organization_id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_subscriptions_organization_id_key'
  ) THEN
    ALTER TABLE billing_subscriptions
      ADD CONSTRAINT billing_subscriptions_organization_id_key UNIQUE (organization_id);
  END IF;
END $$;
