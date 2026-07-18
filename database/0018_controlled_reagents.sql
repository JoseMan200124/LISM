-- NexaLab — Control de reactivos de doble uso o precursores (julio 2026).
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.
--
-- Un reactivo marcado como controlado no puede descontarse del inventario sin
-- un registro de consumo con trazabilidad completa. El descuento sigue pasando
-- por inventory_movements (el trigger apply_inventory_movement calcula el saldo
-- antes/después); aquí solo se agregan la marca de control y los campos de
-- trazabilidad ampliada del consumo.

-- 1. Marca de reactivo controlado (doble uso / precursor) en el artículo.
--    control_kind: DUAL_USE | PRECURSOR | BOTH. NULL cuando is_controlled = FALSE.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS is_controlled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS control_kind VARCHAR(20);

-- 2. Trazabilidad ampliada del consumo de reactivos controlados en cada
--    movimiento. El resto de datos requeridos ya existen en inventory_movements:
--    inventory_item_id (reactivo), quantity_delta (cantidad), performed_at
--    (fecha y hora), performed_by (quién registró), reason_code + note
--    (observaciones) y previous_quantity/resulting_quantity (saldo antes/después).
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS usage_area VARCHAR(200);        -- área, laboratorio o proyecto
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS usage_purpose TEXT;             -- motivo o finalidad de uso
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS used_by_person VARCHAR(200);    -- usuario/persona que lo utilizó
ALTER TABLE inventory_movements ADD COLUMN IF NOT EXISTS authorized_by VARCHAR(200);     -- responsable que autoriza/valida (texto libre: puede ser externo al sistema)

-- 3. Índice parcial para la vista "Registro de reactivos controlados".
CREATE INDEX IF NOT EXISTS idx_inventory_items_controlled
  ON inventory_items (laboratory_id, name) WHERE is_controlled = TRUE;
