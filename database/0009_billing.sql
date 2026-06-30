-- Migration: 0009_billing.sql
-- Billing system for LISM (Recurrente payment provider)
-- Idempotent: safe to run multiple times

-- ============================================================
-- ENUM TYPES (safe idempotent creation)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE billing_subscription_status AS ENUM (
    'inactive',
    'checkout_pending',
    'pending_activation',
    'active',
    'cancel_scheduled',
    'cancelled',
    'payment_failed',
    'expired',
    'trialing',
    'paused'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_checkout_purpose AS ENUM (
    'new_subscription',
    'plan_change',
    'payment_method_update',
    'resume_subscription'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_checkout_status AS ENUM (
    'pending',
    'completed',
    'expired',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_event_processing_status AS ENUM (
    'pending',
    'processing',
    'processed',
    'failed',
    'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE billing_payment_status AS ENUM (
    'pending',
    'succeeded',
    'failed',
    'refunded',
    'partially_refunded',
    'disputed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- billing_plans
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_plans (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                  VARCHAR(40)   NOT NULL UNIQUE,
  name                  VARCHAR(180)  NOT NULL,
  description           TEXT,
  price_monthly_cents   INTEGER       NOT NULL DEFAULT 0,
  currency              VARCHAR(10)   NOT NULL DEFAULT 'USD',
  max_users             INTEGER       NOT NULL DEFAULT 1,
  max_labs              INTEGER       NOT NULL DEFAULT 1,
  features              JSONB         NOT NULL DEFAULT '[]',
  limits                JSONB         NOT NULL DEFAULT '{}',
  is_active             BOOLEAN       NOT NULL DEFAULT true,
  is_recommended        BOOLEAN       NOT NULL DEFAULT false,
  sort_order            INTEGER       NOT NULL DEFAULT 0,
  provider_product_id   VARCHAR(180),
  provider_price_id     VARCHAR(180),
  billing_interval      VARCHAR(20)   NOT NULL DEFAULT 'month',
  metadata              JSONB         NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- billing_subscriptions
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_subscriptions (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id                     UUID          REFERENCES billing_plans(id),
  provider_customer_id        VARCHAR(180),
  provider_subscription_id    VARCHAR(180)  UNIQUE,
  provider_status             VARCHAR(40),
  status                      VARCHAR(40)   NOT NULL DEFAULT 'inactive',
  current_period_start        TIMESTAMPTZ,
  current_period_end          TIMESTAMPTZ,
  next_payment_attempt_at     TIMESTAMPTZ,
  cancel_at_period_end        BOOLEAN       NOT NULL DEFAULT false,
  canceled_at                 TIMESTAMPTZ,
  trial_ends_at               TIMESTAMPTZ,
  pending_plan_id             UUID          REFERENCES billing_plans(id),
  pending_change_type         VARCHAR(40),
  payment_method_masked       VARCHAR(30),
  payment_method_brand        VARCHAR(40),
  last_payment_at             TIMESTAMPTZ,
  last_payment_status         VARCHAR(40),
  metadata                    JSONB         NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- billing_checkouts
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_checkouts (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_checkout_id  VARCHAR(180)  UNIQUE,
  organization_id       UUID          NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  initiated_by          UUID          REFERENCES users(id),
  plan_id               UUID          REFERENCES billing_plans(id),
  purpose               VARCHAR(40)   NOT NULL,
  status                VARCHAR(40)   NOT NULL DEFAULT 'pending',
  success_url           TEXT,
  cancel_url            TEXT,
  checkout_url          TEXT,
  expires_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  metadata              JSONB         NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- billing_events
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_events (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id           VARCHAR(180)  UNIQUE,
  event_type                  VARCHAR(100)  NOT NULL,
  raw_payload                 JSONB         NOT NULL DEFAULT '{}',
  normalized_payload          JSONB         NOT NULL DEFAULT '{}',
  signature_verified          BOOLEAN       NOT NULL DEFAULT false,
  processing_status           VARCHAR(40)   NOT NULL DEFAULT 'pending',
  error_message               TEXT,
  attempts                    INTEGER       NOT NULL DEFAULT 0,
  processed_at                TIMESTAMPTZ,
  organization_id             UUID          REFERENCES organizations(id),
  provider_subscription_id    VARCHAR(180),
  provider_checkout_id        VARCHAR(180),
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- billing_payments
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_payments (
  id                          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_payment_intent_id  VARCHAR(180),
  provider_charge_id          VARCHAR(180),
  provider_subscription_id    VARCHAR(180),
  organization_id             UUID          REFERENCES organizations(id),
  amount_cents                INTEGER       NOT NULL,
  currency                    VARCHAR(10)   NOT NULL,
  status                      VARCHAR(40)   NOT NULL,
  failure_reason              TEXT,
  receipt_url                 TEXT,
  billed_period_start         TIMESTAMPTZ,
  billed_period_end           TIMESTAMPTZ,
  paid_at                     TIMESTAMPTZ,
  metadata                    JSONB         NOT NULL DEFAULT '{}',
  created_at                  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_organization_id
  ON billing_subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_provider_subscription_id
  ON billing_subscriptions (provider_subscription_id);

CREATE INDEX IF NOT EXISTS idx_billing_checkouts_organization_id
  ON billing_checkouts (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_checkouts_provider_checkout_id
  ON billing_checkouts (provider_checkout_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_provider_event_id
  ON billing_events (provider_event_id);

CREATE INDEX IF NOT EXISTS idx_billing_events_organization_id
  ON billing_events (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_payments_organization_id
  ON billing_payments (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_payments_provider_subscription_id
  ON billing_payments (provider_subscription_id);

-- ============================================================
-- UPDATED_AT TRIGGERS (uses existing set_updated_at() function)
-- ============================================================

DROP TRIGGER IF EXISTS trg_billing_plans_updated_at ON billing_plans;
CREATE TRIGGER trg_billing_plans_updated_at
  BEFORE UPDATE ON billing_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_billing_subscriptions_updated_at ON billing_subscriptions;
CREATE TRIGGER trg_billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_billing_checkouts_updated_at ON billing_checkouts;
CREATE TRIGGER trg_billing_checkouts_updated_at
  BEFORE UPDATE ON billing_checkouts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_billing_events_updated_at ON billing_events;
CREATE TRIGGER trg_billing_events_updated_at
  BEFORE UPDATE ON billing_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_billing_payments_updated_at ON billing_payments;
CREATE TRIGGER trg_billing_payments_updated_at
  BEFORE UPDATE ON billing_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- SEED: billing_plans (3 standard plans, idempotent via ON CONFLICT)
-- ============================================================

INSERT INTO billing_plans (
  slug,
  name,
  description,
  price_monthly_cents,
  currency,
  max_users,
  max_labs,
  features,
  limits,
  is_active,
  is_recommended,
  sort_order
) VALUES
(
  'academic_starter',
  'Academic Starter',
  'Para universidades, investigación y laboratorios educativos',
  5900,
  'USD',
  5,
  1,
  '["Muestras e inventario","Equipos","Control de calidad básico","Reportes","1 laboratorio"]',
  '{"max_users":5,"max_labs":1}',
  true,
  false,
  1
),
(
  'professional',
  'Professional',
  'Para laboratorios pequeños y medianos con operación completa',
  18900,
  'USD',
  12,
  1,
  '["Flujo completo de órdenes y muestras","Inventario avanzado","Equipos y calibración","Alertas","Auditoría","Reportes","Soporte estándar"]',
  '{"max_users":12,"max_labs":1}',
  true,
  true,
  2
),
(
  'multi_site',
  'Multi-site',
  'Para organizaciones con varias sedes y operación centralizada',
  54900,
  'USD',
  30,
  3,
  '["Todo lo de Professional","Hasta 3 laboratorios","Panel consolidado","Exportaciones programadas","Soporte prioritario"]',
  '{"max_users":30,"max_labs":3}',
  true,
  false,
  3
)
ON CONFLICT (slug) DO UPDATE SET
  name                  = EXCLUDED.name,
  description           = EXCLUDED.description,
  price_monthly_cents   = EXCLUDED.price_monthly_cents,
  currency              = EXCLUDED.currency,
  max_users             = EXCLUDED.max_users,
  max_labs              = EXCLUDED.max_labs,
  features              = EXCLUDED.features,
  limits                = EXCLUDED.limits,
  is_active             = EXCLUDED.is_active,
  is_recommended        = EXCLUDED.is_recommended,
  sort_order            = EXCLUDED.sort_order,
  updated_at            = now();
