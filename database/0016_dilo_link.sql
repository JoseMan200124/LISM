-- Migration: 0016_dilo_link.sql
-- Puente NexaLab ↔ Dilo (asistente de WhatsApp): vínculo teléfono↔usuario.
-- Un usuario vincula su WhatsApp generando un código de un solo uso en NexaLab
-- y enviándolo a Dilo («vincular CODIGO»). Solo un teléfono VINCULADO puede
-- consultar datos por el puente, y siempre con los permisos reales del usuario.
-- El código nunca se guarda en claro: solo su hash SHA-256.
-- Aditivo y no destructivo. Idempotente: safe to run multiple times.

CREATE TABLE IF NOT EXISTS dilo_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Un vínculo por usuario; el teléfono también es único (un número = una cuenta).
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  -- Solo dígitos (normalizado): "+502 4211-0769" y "50242110769" son el mismo número.
  phone_digits VARCHAR(20) UNIQUE,
  -- PENDING (código emitido, sin canjear), LINKED, REVOKED
  status VARCHAR(12) NOT NULL DEFAULT 'PENDING',
  link_code_hash CHAR(64),
  link_code_expires_at TIMESTAMPTZ,
  linked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dilo_links_code ON dilo_links (link_code_hash) WHERE link_code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dilo_links_phone ON dilo_links (phone_digits) WHERE phone_digits IS NOT NULL;
