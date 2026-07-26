-- NexaLab — Cumplimiento regulatorio de reactivos controlados y de doble uso
-- (julio 2026). Migración aditiva e idempotente.
--
-- Objetivo: sostener una inspección. Ministerio de Gobernación, Ministerio de
-- Salud y las demás autoridades aplicables piden poder seguir un frasco desde
-- la factura que lo trajo hasta el acta que documenta su destrucción, sabiendo
-- en todo momento quién lo tuvo, cuánto usó y con qué permiso. Las normas de
-- trazabilidad (ISO 9001, 17025, 15189, BPL/BPM y ALCOA+) piden lo mismo con
-- otras palabras: atribuible, legible, contemporáneo, original y exacto.
--
-- Lo que ya existía y NO se duplica:
--   - inventory_items: el lote/frasco, con existencia calculada por movimientos.
--   - inventory_movements: el kardex de hecho (entradas, salidas, ajustes,
--     descartes) con saldo antes/después calculado por trigger.
--   - controlled_usage_requests (0020): la autorización previa de uso.
--   - qr_identifiers: la etiqueta única de cada frasco.
--   - attachments: los archivos (SDS, facturas, licencias, actas).
--   - electronic_signatures (0004) y audit_logs: firma y bitácora inalterable.
--
-- Lo que añade esta migración: el catálogo maestro, los permisos regulatorios,
-- la recepción documentada, el inventario físico y la disposición final.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Catálogo maestro de reactivos
-- ───────────────────────────────────────────────────────────────────────────

-- Un reactivo del catálogo es la sustancia; un inventory_item es el frasco que
-- está en la repisa. Separarlos permite que todos los frascos del mismo
-- reactivo compartan CAS, clasificación y requisitos, y que la clasificación se
-- corrija una sola vez cuando cambia la norma.
--
-- category: CONTROLLED | DUAL_USE | PRECURSOR | UNCONTROLLED
CREATE TABLE IF NOT EXISTS reagent_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(200) NOT NULL,
  synonyms VARCHAR(400),
  -- Número CAS: es el identificador con el que las autoridades reconocen la
  -- sustancia. Se guarda tal cual se registra (con guiones).
  cas_number VARCHAR(40),
  un_number VARCHAR(20),
  formula VARCHAR(180),
  concentration VARCHAR(120),
  presentation VARCHAR(160),
  default_vendor VARCHAR(200),
  category VARCHAR(20) NOT NULL DEFAULT 'UNCONTROLLED',
  -- Pictogramas SGA y frases H/P heredados por cada frasco al darlo de alta.
  hazard_pictograms JSONB NOT NULL DEFAULT '[]'::jsonb,
  hazard_statements TEXT,
  -- Qué exige la autoridad para tenerlo, comprarlo o usarlo, en texto llano,
  -- y qué autoridades lo regulan (MINGOB, MSPAS, otras).
  regulatory_requirements TEXT,
  regulators JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_permit BOOLEAN NOT NULL DEFAULT FALSE,
  requires_preapproval BOOLEAN NOT NULL DEFAULT FALSE,
  storage_conditions TEXT,
  sds_url TEXT,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_reagent_catalog_lab
  ON reagent_catalog (laboratory_id, category, name);
CREATE INDEX IF NOT EXISTS idx_reagent_catalog_cas
  ON reagent_catalog (laboratory_id, cas_number);

-- El frasco apunta a su ficha de catálogo. Es opcional: el inventario que ya
-- existe sigue funcionando sin catálogo, y se puede ir enlazando poco a poco.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES reagent_catalog(id) ON DELETE SET NULL;
-- CAS del frasco: puede diferir del catálogo en mezclas o diluciones propias.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS cas_number VARCHAR(40);
-- Cantidad con la que entró el envase: la existencia actual la calculan los
-- movimientos, pero la inicial es dato de la recepción y no debe perderse.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS initial_quantity NUMERIC(14,3);

CREATE INDEX IF NOT EXISTS idx_inventory_items_catalog
  ON inventory_items (catalog_id) WHERE catalog_id IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Licencias, permisos y autorizaciones
-- ───────────────────────────────────────────────────────────────────────────

-- permit_type: LICENSE | PERMIT | AUTHORIZATION | REGISTRATION | IMPORT_PERMIT | OTHER
-- status:      ACTIVE | EXPIRED | SUSPENDED | REVOKED  (EXPIRED se deriva de la
--              fecha en las consultas; el campo permite suspender a mano)
CREATE TABLE IF NOT EXISTS regulatory_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  permit_type VARCHAR(30) NOT NULL DEFAULT 'LICENSE',
  authority VARCHAR(200) NOT NULL,
  permit_number VARCHAR(120) NOT NULL,
  holder VARCHAR(200),
  scope TEXT,
  issued_on DATE,
  expires_on DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  external_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, permit_type, permit_number)
);

CREATE INDEX IF NOT EXISTS idx_regulatory_permits_lab
  ON regulatory_permits (laboratory_id, status, expires_on);

-- Qué reactivos ampara cada permiso. Sin filas, el permiso es general.
CREATE TABLE IF NOT EXISTS regulatory_permit_reagents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id UUID NOT NULL REFERENCES regulatory_permits(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  catalog_id UUID REFERENCES reagent_catalog(id) ON DELETE CASCADE,
  authorized_quantity NUMERIC(14,3),
  unit VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (permit_id, catalog_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Recepción de entradas
-- ───────────────────────────────────────────────────────────────────────────

-- La entrada documentada: de quién vino, con qué factura, contra qué orden de
-- compra y al amparo de qué permiso. El movimiento de existencia lo sigue
-- haciendo inventory_movements; aquí vive el papeleo que pide la autoridad.
CREATE TABLE IF NOT EXISTS inventory_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  receipt_code VARCHAR(40) NOT NULL,
  inventory_item_id UUID REFERENCES inventory_items(id) ON DELETE SET NULL,
  catalog_id UUID REFERENCES reagent_catalog(id) ON DELETE SET NULL,
  purchase_request_id UUID REFERENCES purchase_requests(id) ON DELETE SET NULL,
  movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  vendor VARCHAR(200),
  invoice_number VARCHAR(120),
  purchase_order_number VARCHAR(120),
  license_number VARCHAR(120),
  permit_number VARCHAR(120),
  permit_id UUID REFERENCES regulatory_permits(id) ON DELETE SET NULL,
  lot_number VARCHAR(100),
  received_quantity NUMERIC(14,3) NOT NULL CHECK (received_quantity > 0),
  unit VARCHAR(40) NOT NULL DEFAULT 'unidades',
  unit_price NUMERIC(14,2),
  currency VARCHAR(10),
  received_on DATE NOT NULL DEFAULT current_date,
  expires_on DATE,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  received_by_name VARCHAR(200),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, receipt_code)
);

CREATE INDEX IF NOT EXISTS idx_inventory_receipts_lab
  ON inventory_receipts (laboratory_id, received_on DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_receipts_item
  ON inventory_receipts (inventory_item_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Inventario físico
-- ───────────────────────────────────────────────────────────────────────────

-- status: DRAFT | IN_PROGRESS | CLOSED | APPROVED | CANCELLED
CREATE TABLE IF NOT EXISTS physical_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  scope VARCHAR(30) NOT NULL DEFAULT 'CONTROLLED',
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS',
  notes TEXT,
  started_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  approval_signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_physical_counts_lab
  ON physical_counts (laboratory_id, status, started_at DESC);

-- Una línea por frasco contado. `system_quantity` congela lo que decía el
-- sistema al momento de contar: sin ese dato la diferencia no es demostrable.
CREATE TABLE IF NOT EXISTS physical_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES physical_counts(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  system_quantity NUMERIC(14,3) NOT NULL,
  counted_quantity NUMERIC(14,3),
  unit VARCHAR(40) NOT NULL DEFAULT 'unidades',
  difference NUMERIC(14,3),
  justification TEXT,
  adjustment_movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  counted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  counted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (count_id, inventory_item_id)
);

CREATE INDEX IF NOT EXISTS idx_physical_count_items_count
  ON physical_count_items (count_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Disposición final y destrucción
-- ───────────────────────────────────────────────────────────────────────────

-- method: INCINERATION | NEUTRALIZATION | AUTHORIZED_MANAGER | VENDOR_RETURN | OTHER
-- reason: EXPIRED | CONTAMINATED | DAMAGED | SURPLUS | REGULATORY_ORDER | OTHER
CREATE TABLE IF NOT EXISTS reagent_disposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit VARCHAR(40) NOT NULL DEFAULT 'unidades',
  method VARCHAR(30) NOT NULL DEFAULT 'AUTHORIZED_MANAGER',
  reason VARCHAR(30) NOT NULL DEFAULT 'EXPIRED',
  detail TEXT,
  disposal_provider VARCHAR(200),
  manifest_number VARCHAR(120),
  disposed_on DATE NOT NULL DEFAULT current_date,
  authorized_by UUID REFERENCES users(id) ON DELETE SET NULL,
  witnessed_by VARCHAR(200),
  movement_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_reagent_disposals_lab
  ON reagent_disposals (laboratory_id, disposed_on DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Datos regulatorios de la compra
-- ───────────────────────────────────────────────────────────────────────────

-- La solicitud de compra de un reactivo controlado arrastra el papeleo desde el
-- principio: con qué licencia y permiso se compra, contra qué orden y factura,
-- y quién recibió el material.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(120);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS purchase_order_number VARCHAR(120);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS license_number VARCHAR(120);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS permit_number VARCHAR(120);
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS permit_id UUID REFERENCES regulatory_permits(id) ON DELETE SET NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS received_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS received_note TEXT;
-- Marca de que la solicitud incluye material controlado: la fija el servidor a
-- partir de los artículos ligados, para no depender de que el usuario lo diga.
ALTER TABLE purchase_requests ADD COLUMN IF NOT EXISTS has_controlled_items BOOLEAN NOT NULL DEFAULT FALSE;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. El kardex no se borra
-- ───────────────────────────────────────────────────────────────────────────

-- Requisito explícito de la norma y de la autoridad: un movimiento puede
-- corregirse con otro movimiento, nunca eliminándolo. Se bloquea el DELETE, no
-- el UPDATE: el propio sistema completa campos de enlace (la autorización que
-- amparó un consumo) inmediatamente después de insertar, y esos cambios quedan
-- registrados en audit_logs.
-- Se deja pasar el borrado en cascada (cuando el artículo o el laboratorio
-- entero ya desaparecieron, sus movimientos van detrás): para entonces el
-- padre ya no existe. Lo que se bloquea es borrar un movimiento suelto, que es
-- lo que la norma prohíbe y lo único que un usuario podría intentar.
CREATE OR REPLACE FUNCTION prevent_inventory_movement_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM inventory_items WHERE id = OLD.inventory_item_id) THEN
    RAISE EXCEPTION 'inventory_movements is append-only: corrige con un movimiento de ajuste, no borrando el registro';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_movements_no_delete ON inventory_movements;
CREATE TRIGGER trg_inventory_movements_no_delete
  BEFORE DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_inventory_movement_delete();
