-- NexaLab LIS - perfil de usuario (tutorial) y notificaciones por usuario
-- Aditivo, no destructivo. No modifica tablas existentes salvo un ALTER
-- TABLE ... ADD COLUMN IF NOT EXISTS. Reutiliza `attachments`
-- (0004_configurable_compliance_core.sql) para avatar de usuario
-- (entity_type='user_avatar') y logo institucional
-- (entity_type='organization_logo') — no se agregan columnas de archivo
-- nuevas en users/organizations.

-- Progreso del tutorial guiado por usuario. Formato:
-- { "<moduleKey>": { "completedAt": "...", "version": 1 } }
ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_state JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Estado de lectura por usuario de notificaciones agregadas desde fuentes
-- ya existentes (alerts, educational_notifications). notification_key es
-- una clave estable calculada en la aplicación (ej. "alert:<uuid>",
-- "edu:<uuid>"), no una FK — así no duplicamos ni alteramos esas tablas.
CREATE TABLE IF NOT EXISTS user_notification_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_key VARCHAR(160) NOT NULL,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, notification_key)
);
CREATE INDEX IF NOT EXISTS idx_user_notification_reads_user ON user_notification_reads (user_id);
