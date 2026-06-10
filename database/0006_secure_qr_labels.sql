-- NexaLab 0006: QR labels with expiring one-time access codes.
-- Run after 0004_configurable_compliance_core.sql.

CREATE TABLE IF NOT EXISTS qr_access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  qr_identifier_id UUID NOT NULL REFERENCES qr_identifiers(id) ON DELETE CASCADE,
  code_hash VARCHAR(128) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_access_codes_active
  ON qr_access_codes (qr_identifier_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS qr_scan_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  qr_identifier_id UUID NOT NULL REFERENCES qr_identifiers(id) ON DELETE CASCADE,
  outcome VARCHAR(40) NOT NULL,
  user_agent TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_scan_events_label
  ON qr_scan_events (qr_identifier_id, scanned_at DESC);

-- Demo labels: the tokens are opaque identifiers only. They do not encode private data.
INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
SELECT i.laboratory_id, 'INVENTORY_ITEM', i.id,
  encode(gen_random_bytes(28), 'hex'), i.sku
FROM inventory_items i
WHERE i.status = 'ACTIVE'
ON CONFLICT (laboratory_id, entity_type, entity_id) DO NOTHING;

INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
SELECT e.laboratory_id, 'EQUIPMENT', e.id,
  encode(gen_random_bytes(28), 'hex'), e.code
FROM equipment e
ON CONFLICT (laboratory_id, entity_type, entity_id) DO NOTHING;
