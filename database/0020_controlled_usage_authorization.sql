-- NexaLab — Autorización digital de uso de reactivos controlados (julio 2026).
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.
--
-- Reemplaza la hoja de papel que hoy se llena, se lleva físicamente al
-- responsable y se regresa firmada antes de poder usar un reactivo de doble uso
-- o precursor. Ahora la solicitud, la autorización y el consumo ocurren en el
-- sistema, con folio, sello de tiempo y trazabilidad completa.
--
-- Flujo: solicitud (PENDING) -> autorización del responsable (APPROVED con
-- vigencia) -> consumo en un clic que crea el movimiento y cierra la
-- autorización (CONSUMED). El descuento sigue pasando por inventory_movements,
-- así que el trigger apply_inventory_movement continúa calculando el saldo
-- antes/después. Esta migración no cambia ninguna regla de existencias.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Solicitudes de uso de reactivos controlados.
--    status: PENDING | APPROVED | REJECTED | CONSUMED | CANCELLED
--    La vigencia (expires_at) evita que una autorización aprobada quede abierta
--    indefinidamente: al vencer ya no habilita el consumo (se evalúa en código
--    para no requerir un job programado).
CREATE TABLE IF NOT EXISTS controlled_usage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  request_code VARCHAR(40) NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  -- Lo que se pide: cantidad en la unidad mostrada al solicitante.
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(40) NOT NULL DEFAULT 'unidades',
  -- Trazabilidad exigida por la regla de reactivos controlados: qué, cuánto,
  -- quién lo usará, en qué área o proyecto y para qué.
  used_by_person VARCHAR(200) NOT NULL,
  usage_area VARCHAR(200) NOT NULL,
  usage_purpose TEXT NOT NULL,
  planned_for TIMESTAMPTZ,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Autorización del responsable. approved_quantity permite autorizar menos de
  -- lo solicitado sin perder el dato original de la solicitud.
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT,
  approved_quantity NUMERIC(14,3),
  expires_at TIMESTAMPTZ,
  -- Cierre: el movimiento que consumió esta autorización.
  consumed_movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  consumed_quantity NUMERIC(14,3),
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, request_code)
);

-- Bandeja "por autorizar" y "mis solicitudes".
CREATE INDEX IF NOT EXISTS idx_controlled_requests_lab_status
  ON controlled_usage_requests (laboratory_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_controlled_requests_requester
  ON controlled_usage_requests (laboratory_id, requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_controlled_requests_item
  ON controlled_usage_requests (inventory_item_id, created_at DESC);

-- 2. Vínculo del movimiento con la autorización que lo amparó. Queda en el
--    historial del reactivo: cada consumo controlado puede mostrar su folio.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS usage_request_id UUID REFERENCES controlled_usage_requests(id) ON DELETE SET NULL;

-- 3. Política del laboratorio para reactivos controlados.
--    { "requirePreapproval": boolean, "validityHours": number }
--    Se resuelven valores por defecto en código (lib/controlled-reagents.ts):
--    autorización previa obligatoria y 72 horas de vigencia. Quien puede
--    autorizar (inventory.manage) nunca queda bloqueado: su consumo se registra
--    como autorizado en el acto por él mismo.
ALTER TABLE laboratory_settings
  ADD COLUMN IF NOT EXISTS controlled_usage_policy JSONB NOT NULL DEFAULT '{}'::jsonb;
