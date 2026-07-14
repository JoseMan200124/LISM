-- Migration: 0014_incidents.sql
-- Revisión 1 educativa: módulo de Incidencias / Hallazgos, separado de las
-- alertas automáticas (§3.5). Registros MANUALES: accidentes, daños, derrames,
-- hallazgos, desviaciones u observaciones, con estado, severidad, asignación,
-- relación opcional a equipo/artículo/práctica y resolución.
-- Aditivo y no destructivo. Idempotente: safe to run multiple times.

CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  incident_code VARCHAR(40) NOT NULL,
  -- ACCIDENT, EQUIPMENT_DAMAGE, SPILL, FINDING, DEVIATION, NONCOMPLIANCE, OTHER
  category VARCHAR(40) NOT NULL DEFAULT 'FINDING',
  title VARCHAR(200) NOT NULL,
  description TEXT,
  -- LOW, MEDIUM, HIGH, CRITICAL
  severity VARCHAR(20) NOT NULL DEFAULT 'MEDIUM',
  -- OPEN, IN_PROGRESS, RESOLVED, CLOSED, ARCHIVED
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  location VARCHAR(160),
  -- Relación opcional con la entidad de origen (EQUIPMENT, INVENTORY_ITEM,
  -- EDUCATIONAL_PRACTICE). No es FK porque el tipo es polimórfico; la
  -- aplicación resuelve la navegación por (related_type, related_id).
  related_type VARCHAR(40),
  related_id UUID,
  assigned_to UUID REFERENCES users(id),
  occurred_at TIMESTAMPTZ,
  actions_taken TEXT,
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, incident_code)
);

CREATE INDEX IF NOT EXISTS idx_incidents_lab_status ON incidents (laboratory_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_lab_created ON incidents (laboratory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_related ON incidents (related_type, related_id);
