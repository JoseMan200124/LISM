-- NexaLab — Módulo de compras (planificación de próximas compras). Julio 2026.
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.
--
-- Registra solicitudes de compra con líneas de detalle. Cada línea puede
-- referirse opcionalmente a un artículo de inventario existente (reposición).
-- El módulo NO toca inventory_items ni inventory_movements: es un registro de la
-- intención de compra. Cuando el material se recibe, el equipo lo convierte
-- manualmente en una entrada de inventario (movimiento RECEIPT), conservando la
-- separación entre "lo que se planea comprar" y "las existencias reales".

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Cabecera de la solicitud/orden de compra.
--    status:   DRAFT | PENDING | APPROVED | ORDERED | RECEIVED | CANCELLED
--    priority: LOW | NORMAL | HIGH | URGENT
CREATE TABLE IF NOT EXISTS purchase_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL,
  request_code VARCHAR(80) NOT NULL,
  title VARCHAR(200) NOT NULL,
  supplier VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
  currency VARCHAR(10) NOT NULL DEFAULT 'GTQ',
  needed_by DATE,
  notes TEXT,
  requested_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, request_code)
);

-- 2. Líneas de la solicitud. inventory_item_id es opcional: permite ligar la
--    línea a la reposición de un artículo concreto sin obligar a que exista.
CREATE TABLE IF NOT EXISTS purchase_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL,
  purchase_request_id UUID NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  inventory_item_id UUID,
  description VARCHAR(300) NOT NULL,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 1,
  unit VARCHAR(40) NOT NULL DEFAULT 'unidades',
  estimated_unit_price NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_requests_lab_status ON purchase_requests (laboratory_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request ON purchase_request_items (purchase_request_id);
