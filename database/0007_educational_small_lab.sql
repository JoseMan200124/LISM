-- NexaLab Educativo - MVP Laboratorio pequeño
-- Ejecutar después de 0006_secure_qr_labels.sql
-- Agrega tablas educativas y columnas faltantes para el perfil EDUCATIONAL_SMALL_LAB

-- Garantizar que los roles educativos existen en el enum
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'PROFESSOR';
ALTER TYPE membership_role ADD VALUE IF NOT EXISTS 'STUDENT';

-- Agregar columna prefix a inventory_categories para generación de código interno
ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS prefix VARCHAR(8);
ALTER TABLE inventory_categories ADD COLUMN IF NOT EXISTS description TEXT;

-- Actualizar prefijos de categorías existentes según el código
UPDATE inventory_categories SET prefix = code WHERE prefix IS NULL;

-- Índice para búsqueda por prefijo
CREATE INDEX IF NOT EXISTS idx_inventory_categories_prefix ON inventory_categories (laboratory_id, prefix);

-- Categorías default del perfil educativo
-- Se insertan usando ON CONFLICT para no duplicar si ya existen
-- (Solo para laboratorio de demo; el seed real las crea con laboratory_id)

-- Grupos educativos (cursos o secciones)
CREATE TABLE IF NOT EXISTS educational_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(180) NOT NULL,
  academic_period VARCHAR(80),
  teacher_user_id UUID REFERENCES users(id),
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);
CREATE INDEX IF NOT EXISTS idx_educational_groups_lab ON educational_groups (laboratory_id, status);

-- Miembros de grupo educativo
CREATE TABLE IF NOT EXISTS educational_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES educational_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_group VARCHAR(40) NOT NULL DEFAULT 'STUDENT',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON educational_group_members (group_id, status);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON educational_group_members (user_id, laboratory_id);

-- Avisos y notificaciones educativas
CREATE TABLE IF NOT EXISTS educational_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  practice_id UUID REFERENCES educational_practices(id) ON DELETE CASCADE,
  group_id UUID REFERENCES educational_groups(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  audience VARCHAR(40) NOT NULL DEFAULT 'STUDENTS',
  publish_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_educational_notifications_lab ON educational_notifications (laboratory_id, publish_at DESC);
CREATE INDEX IF NOT EXISTS idx_educational_notifications_practice ON educational_notifications (practice_id, publish_at DESC);

-- Perfil de laboratorio en laboratory_settings
-- Actualizar el profile_code a EDUCATIONAL_SMALL_LAB para laboratorios educativos
-- (A ejecutar manualmente sobre el laboratorio correspondiente)
-- UPDATE laboratory_settings SET profile_code = 'EDUCATIONAL_SMALL_LAB' WHERE laboratory_id = '<ID>';

-- Trigger de updated_at para nuevas tablas mutables
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['educational_groups','educational_group_members']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', tbl, tbl);
  END LOOP;
END $$;
