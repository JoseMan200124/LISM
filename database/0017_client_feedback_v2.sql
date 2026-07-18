-- NexaLab EDUCATIONAL_SMALL_LAB — retroalimentación del cliente (julio 2026).
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.

-- 1. Planes de equipo con frecuencia diaria/semanal por días de la semana.
--    week_days guarda números ISO (1 = lunes … 7 = domingo). NULL mantiene el
--    comportamiento anterior (próxima fecha manual).
ALTER TABLE equipment_plans ADD COLUMN IF NOT EXISTS week_days JSONB;

-- 2. Requisitos de campos del formulario de inventario por tipo de artículo.
--    Estructura: { "inventory": { "REAGENT": { "vendor": "REQUIRED", ... } } }
ALTER TABLE laboratory_settings ADD COLUMN IF NOT EXISTS field_requirements JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 3. Devoluciones al inventario: el tipo RETURN respalda la recuperación de
--    descartes aprobada por un administrador.
ALTER TYPE inventory_movement_type ADD VALUE IF NOT EXISTS 'RETURN';

-- 4. Solicitudes de recuperación de descartes con aprobación del administrador.
CREATE TABLE IF NOT EXISTS inventory_restore_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_note TEXT,
  reviewed_at TIMESTAMPTZ,
  restored_movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (movement_id)
);
CREATE INDEX IF NOT EXISTS idx_restore_requests_lab_status
  ON inventory_restore_requests (laboratory_id, status, created_at DESC);

-- 5. Permisos editables por laboratorio y rol. Cada fila anula el valor por
--    defecto de la matriz de permisos para ese rol dentro del laboratorio.
CREATE TABLE IF NOT EXISTS role_permission_overrides (
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  role VARCHAR(40) NOT NULL,
  permission VARCHAR(80) NOT NULL,
  allowed BOOLEAN NOT NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (laboratory_id, role, permission)
);
