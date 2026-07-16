-- NexaLab EDUCATIONAL_SMALL_LAB — revisión funcional v1.
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.

-- Preferencias persistentes por usuario (tema y futuras preferencias de UI).
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{"theme":"system"}'::jsonb;

-- Inventario educativo: el tipo es independiente de la categoría configurable.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(30) NOT NULL DEFAULT 'OTHER';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS subcategory VARCHAR(120);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS brand VARCHAR(120);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS model VARCHAR(160);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS presentation VARCHAR(160);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS concentration VARCHAR(120);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS manufacturing_material VARCHAR(160);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_reusable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS storage_conditions TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS culture_media_type VARCHAR(120);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS preparation_type VARCHAR(30);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS track_stock BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS alert_low_stock BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS alert_expiry BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS allow_direct_discard BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_inventory_lab_type_status ON inventory_items (laboratory_id, item_type, status);
CREATE INDEX IF NOT EXISTS idx_inventory_consumption_control ON inventory_items (laboratory_id, requires_usage_log, status) WHERE requires_usage_log = TRUE;

-- Todo movimiento conserva responsable, motivo y transferencia explícita.
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS from_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS to_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS transferred_quantity NUMERIC(14,3);

-- Prácticas, participantes, documentación y seguimiento.
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES educational_groups(id) ON DELETE SET NULL;
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS location VARCHAR(180);
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE educational_practices ADD COLUMN IF NOT EXISTS custom_values JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_practices_lab_status_start ON educational_practices (laboratory_id, status, starts_at);

CREATE TABLE IF NOT EXISTS educational_practice_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES educational_practices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_role VARCHAR(30) NOT NULL DEFAULT 'STUDENT',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (practice_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_participants_lab_user ON educational_practice_participants (laboratory_id, user_id, status);

CREATE TABLE IF NOT EXISTS educational_practice_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  practice_id UUID NOT NULL REFERENCES educational_practices(id) ON DELETE CASCADE,
  document_type VARCHAR(30) NOT NULL DEFAULT 'EXTERNAL_LINK',
  title VARCHAR(180) NOT NULL,
  external_url TEXT,
  description TEXT,
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_practice_documents_lab_practice ON educational_practice_documents (laboratory_id, practice_id, status);

ALTER TABLE resource_reservations ADD COLUMN IF NOT EXISTS approved_quantity NUMERIC(14,3);
ALTER TABLE resource_reservations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE resource_reservations ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE resource_reservations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_reservations_lab_status_needed ON resource_reservations (laboratory_id, status, needed_at);

ALTER TABLE educational_notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(30) NOT NULL DEFAULT 'GENERAL';
ALTER TABLE educational_notifications ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE educational_notifications ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE educational_notifications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_education_notices_lab_status_publish ON educational_notifications (laboratory_id, status, publish_at DESC);

-- Incidencias: comentarios/evidencias/historial se vinculan siempre al tenant.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  comment_type VARCHAR(30) NOT NULL DEFAULT 'FOLLOW_UP',
  attachment_id UUID REFERENCES attachments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_incident_comments_lab_incident ON incident_comments (laboratory_id, incident_id, created_at);

-- Equipos y documentos conservan archivo/retiro sin borrado físico.
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS area VARCHAR(160);
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS retired_at TIMESTAMPTZ;
ALTER TABLE equipment_plans ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;
ALTER TABLE equipment_plans ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE equipment_plans ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE equipment_certificates ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE equipment_certificates ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE equipment_certificates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_equipment_certificates_lab_status ON equipment_certificates (laboratory_id, status, expires_at);

-- Estados y reglas de alerta educativas.
ALTER TYPE alert_status ADD VALUE IF NOT EXISTS 'ACKNOWLEDGED';
ALTER TYPE alert_status ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS resolution_details JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE alert_rules ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS alert_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  alert_rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  wait_minutes INTEGER NOT NULL CHECK (wait_minutes > 0),
  recipient_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  channel_config JSONB NOT NULL DEFAULT '["IN_APP"]'::jsonb,
  target_severity alert_severity,
  repeat_minutes INTEGER,
  subsequent_action VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alert_escalations_lab_status ON alert_escalations (laboratory_id, status, alert_rule_id);

-- Permisos explícitos para alertas (no reutilizar quality.manage).
INSERT INTO permission_definitions (permission_key, module_key, action_key, label, description)
VALUES
  ('alerts.view', 'alerts', 'view', 'Ver alertas', 'Consultar alertas operativas autorizadas.'),
  ('alerts.manage', 'alerts', 'manage', 'Gestionar alertas', 'Reconocer, asignar, resolver y administrar reglas/escalamientos.')
ON CONFLICT (permission_key) DO NOTHING;

-- Disparadores updated_at para nuevas tablas mutables.
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['educational_notifications','alert_escalations','equipment_certificates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl);
  END LOOP;
END $$;
