-- NexaLab LIMS - configurable and compliance-ready core
-- Apply after 0001_init.sql and before 0005_seed_configurable_demo.sql.
-- This migration adds configuration, quality and evidence controls. It does not
-- replace the laboratory's formal validation, SOPs, training or accreditation process.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Expanded role templates requested for regulated and educational use cases.
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'HEAD_OF_LAB';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'ANALYST';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'ASSISTANT';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'AUDITOR';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'CONSULTATION';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'PROFESSOR';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'STUDENT';

-- Audit trail enrichment. Existing event rows remain valid.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS previous_value JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS new_value JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_id VARCHAR(160);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_hash VARCHAR(128);

-- Append-only protection for the audit trail. Superusers can still perform disaster
-- recovery, but normal application roles must never update or delete audit records.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: updates and deletes are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_no_update ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_update
BEFORE UPDATE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

DROP TRIGGER IF EXISTS trg_audit_logs_no_delete ON audit_logs;
CREATE TRIGGER trg_audit_logs_no_delete
BEFORE DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

-- Per-laboratory profile and configuration versions.
CREATE TABLE IF NOT EXISTS laboratory_settings (
  laboratory_id UUID PRIMARY KEY REFERENCES laboratories(id) ON DELETE CASCADE,
  profile_code VARCHAR(40) NOT NULL DEFAULT 'PHARMA_QC',
  strict_mode BOOLEAN NOT NULL DEFAULT TRUE,
  allow_custom_fields BOOLEAN NOT NULL DEFAULT TRUE,
  require_reason_for_corrections BOOLEAN NOT NULL DEFAULT TRUE,
  require_reauthentication_for_signatures BOOLEAN NOT NULL DEFAULT TRUE,
  active_configuration_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS configuration_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  summary TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, version_number)
);

CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  configuration_version_id UUID REFERENCES configuration_versions(id) ON DELETE SET NULL,
  module_key VARCHAR(80) NOT NULL,
  field_key VARCHAR(100) NOT NULL,
  label VARCHAR(180) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  required_mode VARCHAR(40) NOT NULL DEFAULT 'OPTIONAL',
  conditional_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  include_in_report BOOLEAN NOT NULL DEFAULT FALSE,
  include_in_qr BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, module_key, field_key, configuration_version_id)
);
CREATE INDEX IF NOT EXISTS idx_custom_fields_lab_module ON custom_field_definitions (laboratory_id, module_key, status);

-- Versioned workflows.
CREATE TABLE IF NOT EXISTS workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  workflow_key VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, workflow_key)
);

CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  effective_from TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version_number)
);

CREATE TABLE IF NOT EXISTS workflow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  state_key VARCHAR(80) NOT NULL,
  label VARCHAR(140) NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL,
  is_initial BOOLEAN NOT NULL DEFAULT FALSE,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (workflow_version_id, state_key)
);

CREATE TABLE IF NOT EXISTS workflow_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
  from_state_key VARCHAR(80) NOT NULL,
  to_state_key VARCHAR(80) NOT NULL,
  label VARCHAR(140) NOT NULL,
  allowed_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  required_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  requires_reason BOOLEAN NOT NULL DEFAULT FALSE,
  automation JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (workflow_version_id, from_state_key, to_state_key)
);

-- Custom roles and granular permissions. Legacy membership_role remains available
-- for simple deployments; custom roles provide a scalable permission matrix.
CREATE TABLE IF NOT EXISTS permission_definitions (
  permission_key VARCHAR(120) PRIMARY KEY,
  module_key VARCHAR(80) NOT NULL,
  action_key VARCHAR(80) NOT NULL,
  label VARCHAR(180) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS custom_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  role_key VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  scope_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, role_key)
);

CREATE TABLE IF NOT EXISTS custom_role_permissions (
  role_id UUID NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(120) NOT NULL REFERENCES permission_definitions(permission_key) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_key)
);

ALTER TABLE memberships ADD COLUMN IF NOT EXISTS custom_role_id UUID REFERENCES custom_roles(id) ON DELETE SET NULL;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS scope_rule JSONB NOT NULL DEFAULT '{}'::jsonb;

-- General attachment metadata. Large files live in object storage, never in PostgreSQL.
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename VARCHAR(260) NOT NULL,
  mime_type VARCHAR(120),
  size_bytes BIGINT,
  sha256 VARCHAR(128),
  version_number INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments (laboratory_id, entity_type, entity_id, uploaded_at DESC);

-- QR identifiers contain opaque tokens only. Permissions are evaluated after login.
CREATE TABLE IF NOT EXISTS qr_identifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  opaque_token VARCHAR(180) NOT NULL UNIQUE,
  label_code VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, entity_type, entity_id)
);

-- Existing operational records gain safe custom-value containers.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS requires_usage_log BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS opened_at DATE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS received_at DATE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS internal_formula VARCHAR(220);

ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reference_type VARCHAR(80);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reference_id UUID;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS reason_code VARCHAR(80);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS previous_quantity NUMERIC(14,3);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS resulting_quantity NUMERIC(14,3);
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();

-- Calculate stock from movement events. Applications should create movements instead
-- of writing quantity directly.
CREATE OR REPLACE FUNCTION apply_inventory_movement()
RETURNS TRIGGER AS $$
DECLARE
  current_quantity NUMERIC(14,3);
  next_quantity NUMERIC(14,3);
BEGIN
  SELECT quantity INTO current_quantity
  FROM inventory_items
  WHERE id = NEW.inventory_item_id AND laboratory_id = NEW.laboratory_id
  FOR UPDATE;

  IF current_quantity IS NULL THEN
    RAISE EXCEPTION 'inventory item not found for movement';
  END IF;

  next_quantity := current_quantity + NEW.quantity_delta;
  IF next_quantity < 0 THEN
    RAISE EXCEPTION 'inventory movement would create a negative stock balance';
  END IF;

  NEW.previous_quantity := current_quantity;
  NEW.resulting_quantity := next_quantity;
  UPDATE inventory_items SET quantity = next_quantity WHERE id = NEW.inventory_item_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_apply_inventory_movement ON inventory_movements;
CREATE TRIGGER trg_apply_inventory_movement
BEFORE INSERT ON inventory_movements
FOR EACH ROW EXECUTE FUNCTION apply_inventory_movement();

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS criticality VARCHAR(30) NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS equipment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  plan_type VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  frequency_value INTEGER,
  frequency_unit VARCHAR(30),
  next_due_at TIMESTAMPTZ,
  reminder_days JSONB NOT NULL DEFAULT '[90,60,30,0]'::jsonb,
  blocks_use_when_overdue BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_equipment_plans_due ON equipment_plans (laboratory_id, next_due_at, status);

CREATE TABLE IF NOT EXISTS equipment_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  certificate_type VARCHAR(80) NOT NULL,
  certificate_number VARCHAR(120),
  provider_name VARCHAR(180),
  issued_at DATE,
  expires_at DATE,
  uncertainty_text TEXT,
  scope_text TEXT,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE specimens ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS current_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS condition_on_receipt TEXT;
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS workflow_version_id UUID REFERENCES workflow_versions(id) ON DELETE SET NULL;
ALTER TABLE specimens ADD COLUMN IF NOT EXISTS workflow_state_key VARCHAR(80) NOT NULL DEFAULT 'RECEIVED';

CREATE TABLE IF NOT EXISTS specimen_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  specimen_id UUID NOT NULL REFERENCES specimens(id) ON DELETE CASCADE,
  from_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  to_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  transferred_by UUID REFERENCES users(id),
  received_by UUID REFERENCES users(id),
  condition_text TEXT,
  note TEXT,
  transferred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_specimen_transfers_specimen ON specimen_transfers (specimen_id, transferred_at DESC);

-- Versioned methods and specifications.
CREATE TABLE IF NOT EXISTS method_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id) ON DELETE CASCADE,
  version_code VARCHAR(60) NOT NULL,
  method_reference VARCHAR(220),
  effective_from DATE,
  effective_until DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  structured_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_catalog_id, version_code)
);

CREATE TABLE IF NOT EXISTS specification_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id) ON DELETE CASCADE,
  version_code VARCHAR(60) NOT NULL,
  result_type VARCHAR(40) NOT NULL DEFAULT 'NUMERIC',
  lower_limit NUMERIC(18,6),
  upper_limit NUMERIC(18,6),
  allowed_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  unit VARCHAR(60),
  effective_from DATE,
  effective_until DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_catalog_id, version_code)
);

ALTER TABLE result_records ADD COLUMN IF NOT EXISTS method_version_id UUID REFERENCES method_versions(id) ON DELETE SET NULL;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS specification_version_id UUID REFERENCES specification_versions(id) ON DELETE SET NULL;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS raw_data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS revision_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE result_records ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS result_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  result_record_id UUID NOT NULL REFERENCES result_records(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  correction_reason TEXT NOT NULL,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (result_record_id, revision_number)
);

-- Electronic signatures remain separate and immutable through application policies.
CREATE TABLE IF NOT EXISTS electronic_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES users(id),
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID NOT NULL,
  meaning VARCHAR(120) NOT NULL,
  content_hash VARCHAR(128) NOT NULL,
  authentication_method VARCHAR(80) NOT NULL DEFAULT 'PASSWORD_REAUTH',
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  correlation_id UUID NOT NULL DEFAULT gen_random_uuid()
);
CREATE INDEX IF NOT EXISTS idx_signatures_entity ON electronic_signatures (laboratory_id, entity_type, entity_id, signed_at DESC);

CREATE OR REPLACE FUNCTION prevent_signature_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'electronic_signatures is append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_signatures_no_update ON electronic_signatures;
CREATE TRIGGER trg_signatures_no_update BEFORE UPDATE ON electronic_signatures FOR EACH ROW EXECUTE FUNCTION prevent_signature_mutation();
DROP TRIGGER IF EXISTS trg_signatures_no_delete ON electronic_signatures;
CREATE TRIGGER trg_signatures_no_delete BEFORE DELETE ON electronic_signatures FOR EACH ROW EXECUTE FUNCTION prevent_signature_mutation();

-- OOS, OOT and CAPA.
CREATE TABLE IF NOT EXISTS oos_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  investigation_number VARCHAR(80) NOT NULL,
  result_record_id UUID REFERENCES result_records(id) ON DELETE SET NULL,
  source_type VARCHAR(80) NOT NULL,
  source_id UUID,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  phase VARCHAR(80) NOT NULL DEFAULT 'DETECTED',
  description TEXT NOT NULL,
  impact_assessment TEXT,
  root_cause TEXT,
  owner_user_id UUID REFERENCES users(id),
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, investigation_number)
);

CREATE TABLE IF NOT EXISTS oot_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  investigation_number VARCHAR(80) NOT NULL,
  source_type VARCHAR(80) NOT NULL,
  source_id UUID,
  trend_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  owner_user_id UUID REFERENCES users(id),
  opened_by UUID REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, investigation_number)
);

CREATE TABLE IF NOT EXISTS capa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  capa_number VARCHAR(80) NOT NULL,
  source_type VARCHAR(80) NOT NULL,
  source_id UUID,
  description TEXT NOT NULL,
  containment_action TEXT,
  root_cause TEXT,
  corrective_action TEXT,
  preventive_action TEXT,
  effectiveness_check TEXT,
  owner_user_id UUID REFERENCES users(id),
  due_at TIMESTAMPTZ,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  approved_by UUID REFERENCES users(id),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, capa_number)
);

-- Controlled documents and training evidence.
CREATE TABLE IF NOT EXISTS controlled_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  document_code VARCHAR(80) NOT NULL,
  document_type VARCHAR(80) NOT NULL,
  title VARCHAR(220) NOT NULL,
  owner_user_id UUID REFERENCES users(id),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, document_code)
);

CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES controlled_documents(id) ON DELETE CASCADE,
  version_code VARCHAR(60) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'DRAFT',
  effective_from DATE,
  review_due_at DATE,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_code)
);

CREATE TABLE IF NOT EXISTS user_qualifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  qualification_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  title VARCHAR(200) NOT NULL,
  valid_from DATE,
  valid_until DATE,
  evidence_attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id),
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qualifications_user ON user_qualifications (laboratory_id, user_id, status, valid_until);

-- Environmental monitoring and configurable electronic logbooks.
CREATE TABLE IF NOT EXISTS environmental_monitoring_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  point_code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  area_name VARCHAR(180) NOT NULL,
  sample_type VARCHAR(80) NOT NULL,
  unit VARCHAR(60),
  alert_limit NUMERIC(18,6),
  action_limit NUMERIC(18,6),
  frequency_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, point_code)
);

CREATE TABLE IF NOT EXISTS environmental_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  point_id UUID NOT NULL REFERENCES environmental_monitoring_points(id) ON DELETE CASCADE,
  numeric_value NUMERIC(18,6),
  text_value TEXT,
  status VARCHAR(40) NOT NULL,
  sample_reference VARCHAR(120),
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logbook_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  template_key VARCHAR(80) NOT NULL,
  title VARCHAR(180) NOT NULL,
  entity_type VARCHAR(80),
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  frequency_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  alert_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_signature BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, template_key)
);

CREATE TABLE IF NOT EXISTS logbook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES logbook_templates(id) ON DELETE CASCADE,
  entity_id UUID,
  values JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(40) NOT NULL DEFAULT 'COMPLETED',
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configurable rules, notification delivery and escalation.
CREATE TABLE IF NOT EXISTS alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  rule_key VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  source_type VARCHAR(80) NOT NULL,
  trigger_type VARCHAR(60) NOT NULL,
  condition_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  severity alert_severity NOT NULL DEFAULT 'WARNING',
  recipient_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  channel_config JSONB NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  escalation_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  repeat_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_acknowledgement BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, rule_key)
);

ALTER TABLE alerts ADD COLUMN IF NOT EXISTS alert_rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS correlation_id UUID DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  alert_id UUID REFERENCES alerts(id) ON DELETE SET NULL,
  channel VARCHAR(40) NOT NULL,
  recipient VARCHAR(220) NOT NULL,
  delivery_status VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(220),
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Educational scheduling and reservations.
CREATE TABLE IF NOT EXISTS educational_practices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  practice_code VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  course_name VARCHAR(180),
  teacher_user_id UUID REFERENCES users(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  instructions TEXT,
  status VARCHAR(40) NOT NULL DEFAULT 'PLANNED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, practice_code)
);

CREATE TABLE IF NOT EXISTS resource_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  reservation_code VARCHAR(80) NOT NULL,
  practice_id UUID REFERENCES educational_practices(id) ON DELETE SET NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id UUID,
  quantity NUMERIC(14,3),
  unit VARCHAR(40),
  needed_at TIMESTAMPTZ,
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, reservation_code)
);

-- Regulatory packages link requirements, evidence and responsible owners.
CREATE TABLE IF NOT EXISTS regulatory_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  package_key VARCHAR(100) NOT NULL,
  name VARCHAR(180) NOT NULL,
  version_label VARCHAR(100),
  jurisdiction VARCHAR(120),
  effective_from DATE,
  status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, package_key)
);

CREATE TABLE IF NOT EXISTS regulatory_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES regulatory_packages(id) ON DELETE CASCADE,
  control_key VARCHAR(120) NOT NULL,
  area VARCHAR(180) NOT NULL,
  requirement TEXT NOT NULL,
  implementation_note TEXT,
  evidence_expected TEXT,
  owner_role VARCHAR(120),
  control_state VARCHAR(40) NOT NULL DEFAULT 'CONFIGURE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (package_id, control_key)
);

CREATE TABLE IF NOT EXISTS regulatory_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  control_id UUID NOT NULL REFERENCES regulatory_controls(id) ON DELETE CASCADE,
  evidence_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  note TEXT,
  recorded_by UUID REFERENCES users(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Operational evidence that backups are not only created but periodically restored.
CREATE TABLE IF NOT EXISTS backup_verification_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  backup_type VARCHAR(80) NOT NULL,
  backup_reference VARCHAR(220),
  verified_restore BOOLEAN NOT NULL DEFAULT FALSE,
  verification_environment VARCHAR(120),
  result_note TEXT,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Updated-at triggers for new mutable tables.
DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'laboratory_settings','configuration_versions','custom_field_definitions','workflow_definitions',
    'workflow_versions','custom_roles','equipment_plans','method_versions','specification_versions',
    'oos_investigations','oot_investigations','capa_records','controlled_documents','user_qualifications',
    'environmental_monitoring_points','logbook_templates','alert_rules','educational_practices',
    'resource_reservations','regulatory_packages','regulatory_controls'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END $$;
