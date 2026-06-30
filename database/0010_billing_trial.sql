-- Migration: 0010_billing_trial.sql
-- Adds free-trial support to the LISM billing system
-- Idempotent: safe to run multiple times

-- ============================================================
-- 1. Add trial columns to billing_subscriptions
-- ============================================================

ALTER TABLE billing_subscriptions
  ADD COLUMN IF NOT EXISTS trial_started_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_charge_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_payment_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS is_trial            BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. billing_trial_usage — one row per organization, enforces
--    the "only one free trial per org" policy at DB level.
-- ============================================================

CREATE TABLE IF NOT EXISTS billing_trial_usage (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          UUID          NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  first_plan_id            UUID          REFERENCES billing_plans(id),
  provider_customer_id     VARCHAR(180),
  provider_subscription_id VARCHAR(180),
  trial_started_at         TIMESTAMPTZ,
  trial_ends_at            TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  canceled_at              TIMESTAMPTZ,
  status                   VARCHAR(40)   NOT NULL DEFAULT 'active',
  created_at               TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_billing_trial_usage_organization_id
  ON billing_trial_usage (organization_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_is_trial
  ON billing_subscriptions (is_trial)
  WHERE is_trial = true;

-- ============================================================
-- 4. Updated-at trigger for billing_trial_usage
-- ============================================================

DROP TRIGGER IF EXISTS trg_billing_trial_usage_updated_at ON billing_trial_usage;
CREATE TRIGGER trg_billing_trial_usage_updated_at
  BEFORE UPDATE ON billing_trial_usage
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
