-- NexaLab LIS - initial Neon/PostgreSQL schema
-- Apply with: psql "$DIRECT_URL" -f database/0001_init.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE organization_status AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('OWNER', 'LAB_ADMIN', 'SCIENTIST', 'TECHNICIAN', 'REVIEWER', 'VIEWER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE record_status AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE specimen_priority AS ENUM ('ROUTINE', 'PRIORITY', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE specimen_status AS ENUM ('RECEIVED', 'PREPARING', 'ANALYZING', 'PENDING_VALIDATION', 'RELEASED', 'REJECTED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('DRAFT', 'RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE result_status AS ENUM ('DRAFT', 'PENDING_VALIDATION', 'VALIDATED', 'RELEASED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE qc_status AS ENUM ('PASS', 'REVIEW', 'FAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE inventory_movement_type AS ENUM ('RECEIPT', 'CONSUMPTION', 'ADJUSTMENT', 'TRANSFER', 'DISPOSAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE equipment_status AS ENUM ('OPERATIONAL', 'MAINTENANCE_DUE', 'OUT_OF_SERVICE', 'RETIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE alert_severity AS ENUM ('INFO', 'WARNING', 'HIGH', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE alert_status AS ENUM ('OPEN', 'ASSIGNED', 'IN_REVIEW', 'RESOLVED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(180) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  status organization_status NOT NULL DEFAULT 'ACTIVE',
  plan_code VARCHAR(40) NOT NULL DEFAULT 'STARTER',
  locale VARCHAR(10) NOT NULL DEFAULT 'es-GT',
  timezone VARCHAR(80) NOT NULL DEFAULT 'America/Guatemala',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS laboratories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(40) NOT NULL,
  status organization_status NOT NULL DEFAULT 'ACTIVE',
  address TEXT,
  phone VARCHAR(40),
  email VARCHAR(180),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(180) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, user_id)
);

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  patient_number VARCHAR(60) NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  document_type VARCHAR(40),
  document_number VARCHAR(100),
  date_of_birth DATE,
  sex VARCHAR(30),
  phone VARCHAR(50),
  email VARCHAR(180),
  address TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, patient_number)
);
CREATE INDEX IF NOT EXISTS idx_patients_lab_name ON patients (laboratory_id, lower(full_name));
CREATE INDEX IF NOT EXISTS idx_patients_lab_document ON patients (laboratory_id, document_number);

CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  provider_number VARCHAR(60) NOT NULL,
  full_name VARCHAR(180) NOT NULL,
  provider_type VARCHAR(60) NOT NULL DEFAULT 'PHYSICIAN',
  institution_name VARCHAR(180),
  email VARCHAR(180),
  phone VARCHAR(50),
  preferred_delivery_channel VARCHAR(60) NOT NULL DEFAULT 'SECURE_PORTAL',
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, provider_number)
);

CREATE TABLE IF NOT EXISTS specimen_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS test_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  code VARCHAR(50) NOT NULL,
  name VARCHAR(180) NOT NULL,
  loinc_code VARCHAR(50),
  specimen_type_id UUID REFERENCES specimen_types(id),
  turnaround_minutes INTEGER NOT NULL DEFAULT 240 CHECK (turnaround_minutes > 0),
  reference_range_text TEXT,
  unit VARCHAR(60),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);
CREATE INDEX IF NOT EXISTS idx_test_catalog_lab_name ON test_catalog (laboratory_id, lower(name));

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  order_number VARCHAR(60) NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id),
  provider_id UUID REFERENCES providers(id),
  priority specimen_priority NOT NULL DEFAULT 'ROUTINE',
  status order_status NOT NULL DEFAULT 'RECEIVED',
  clinical_notes TEXT,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, order_number)
);
CREATE INDEX IF NOT EXISTS idx_orders_lab_status ON orders (laboratory_id, status, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_lab_patient ON orders (laboratory_id, patient_id, ordered_at DESC);

CREATE TABLE IF NOT EXISTS specimens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  accession_number VARCHAR(70) NOT NULL,
  order_id UUID REFERENCES orders(id),
  patient_id UUID NOT NULL REFERENCES patients(id),
  specimen_type_id UUID NOT NULL REFERENCES specimen_types(id),
  barcode VARCHAR(120) NOT NULL,
  priority specimen_priority NOT NULL DEFAULT 'ROUTINE',
  status specimen_status NOT NULL DEFAULT 'RECEIVED',
  collection_datetime TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rejection_reason TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, accession_number),
  UNIQUE (laboratory_id, barcode)
);
CREATE INDEX IF NOT EXISTS idx_specimens_lab_status ON specimens (laboratory_id, status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_specimens_lab_patient ON specimens (laboratory_id, patient_id, received_at DESC);

CREATE TABLE IF NOT EXISTS order_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  specimen_id UUID REFERENCES specimens(id),
  test_catalog_id UUID NOT NULL REFERENCES test_catalog(id),
  status result_status NOT NULL DEFAULT 'DRAFT',
  assigned_to UUID REFERENCES users(id),
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_id, test_catalog_id)
);
CREATE INDEX IF NOT EXISTS idx_order_tests_lab_status ON order_tests (laboratory_id, status, due_at);

CREATE TABLE IF NOT EXISTS result_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  order_test_id UUID NOT NULL REFERENCES order_tests(id) ON DELETE CASCADE,
  numeric_value NUMERIC(18,6),
  text_value TEXT,
  unit VARCHAR(60),
  reference_range_text TEXT,
  flag VARCHAR(40),
  status result_status NOT NULL DEFAULT 'DRAFT',
  instrument_id UUID,
  entered_by UUID REFERENCES users(id),
  validated_by UUID REFERENCES users(id),
  validated_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (order_test_id)
);
CREATE INDEX IF NOT EXISTS idx_results_lab_status ON result_records (laboratory_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS quality_control_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  test_catalog_id UUID REFERENCES test_catalog(id),
  run_number VARCHAR(80) NOT NULL,
  control_name VARCHAR(160) NOT NULL,
  result_text TEXT NOT NULL,
  status qc_status NOT NULL,
  corrective_action TEXT,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, run_number)
);

CREATE TABLE IF NOT EXISTS storage_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES storage_locations(id),
  code VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  location_type VARCHAR(60) NOT NULL DEFAULT 'STORAGE',
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(120) NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES inventory_categories(id),
  storage_location_id UUID REFERENCES storage_locations(id),
  sku VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  vendor VARCHAR(180),
  lot_number VARCHAR(100),
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  unit VARCHAR(40) NOT NULL,
  expires_at DATE,
  safety_sheet_url TEXT,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, sku, lot_number)
);
CREATE INDEX IF NOT EXISTS idx_inventory_lab_status ON inventory_items (laboratory_id, status, name);
CREATE INDEX IF NOT EXISTS idx_inventory_lab_expiry ON inventory_items (laboratory_id, expires_at);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  quantity_delta NUMERIC(14,3) NOT NULL,
  note TEXT,
  performed_by UUID REFERENCES users(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_item ON inventory_movements (inventory_item_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS equipment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id),
  code VARCHAR(60) NOT NULL,
  name VARCHAR(180) NOT NULL,
  manufacturer VARCHAR(120),
  model VARCHAR(120),
  serial_number VARCHAR(120),
  status equipment_status NOT NULL DEFAULT 'OPERATIONAL',
  last_calibration_at DATE,
  next_maintenance_at DATE,
  interface_standard VARCHAR(80),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

DO $$ BEGIN
  ALTER TABLE result_records
    ADD CONSTRAINT fk_result_instrument
    FOREIGN KEY (instrument_id) REFERENCES equipment(id)
    DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS equipment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  details TEXT,
  performed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  severity alert_severity NOT NULL DEFAULT 'INFO',
  status alert_status NOT NULL DEFAULT 'OPEN',
  source_type VARCHAR(80) NOT NULL,
  source_id UUID,
  title VARCHAR(220) NOT NULL,
  details TEXT,
  assigned_to UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_lab_status ON alerts (laboratory_id, status, severity, created_at DESC);

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  integration_type VARCHAR(80) NOT NULL,
  standard_name VARCHAR(80),
  direction VARCHAR(30) NOT NULL DEFAULT 'BIDIRECTIONAL',
  status record_status NOT NULL DEFAULT 'ACTIVE',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integration_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  external_reference VARCHAR(180),
  status VARCHAR(50) NOT NULL,
  payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integration_events_integration ON integration_events (integration_id, created_at DESC);

CREATE TABLE IF NOT EXISTS report_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  report_type VARCHAR(80) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  schedule_expression VARCHAR(120),
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID REFERENCES laboratories(id) ON DELETE SET NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_lab_created ON audit_logs (laboratory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs (entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_type VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  details TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'organizations','laboratories','users','memberships','departments','patients','providers',
    'specimen_types','test_catalog','orders','specimens','order_tests','result_records',
    'quality_control_records','storage_locations','inventory_categories','inventory_items',
    'equipment','alerts','integrations','report_definitions','change_requests'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END $$;
