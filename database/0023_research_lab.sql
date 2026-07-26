-- NexaLab — Laboratorio de investigación (julio 2026).
-- Migración aditiva e idempotente. No elimina ni reinterpreta datos existentes.
--
-- Un laboratorio de investigación trabaja de dos maneras a la vez: por proyecto
-- (meses de trabajo con objetivos, cronograma, equipo y protocolos) y por
-- muestra suelta que entra el día a día sin pertenecer a ningún proyecto. Todo
-- lo que sigue admite las dos formas: el proyecto siempre es opcional.
--
-- Los módulos que crean estas tablas permanecen ocultos hasta que el
-- laboratorio elige el perfil RESEARCH_LAB en Configuración.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Proyectos
-- ───────────────────────────────────────────────────────────────────────────

-- status: DRAFT | ACTIVE | ON_HOLD | COMPLETED | CANCELLED
CREATE TABLE IF NOT EXISTS research_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(40) NOT NULL,
  title VARCHAR(240) NOT NULL,
  summary TEXT,
  objectives TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  funding_source VARCHAR(200),
  starts_on DATE,
  ends_on DATE,
  principal_investigator_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_research_projects_lab
  ON research_projects (laboratory_id, status, created_at DESC);

-- Investigadores participantes. role_in_project: PI | CO_INVESTIGATOR |
-- RESEARCHER | TECHNICIAN | STUDENT | COLLABORATOR
CREATE TABLE IF NOT EXISTS research_project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_project VARCHAR(40) NOT NULL DEFAULT 'RESEARCHER',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- Cronograma: cada hito o etapa del proyecto.
-- status: PLANNED | IN_PROGRESS | DONE | DELAYED | CANCELLED
CREATE TABLE IF NOT EXISTS research_project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  title VARCHAR(240) NOT NULL,
  detail TEXT,
  starts_on DATE,
  due_on DATE,
  completed_on DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_milestones_project
  ON research_project_milestones (project_id, sort_order, due_on);

-- Relación del proyecto con lo que usa: protocolos, muestras, equipos,
-- artículos de inventario, entradas de biobanco y cuadernos. Una sola tabla
-- polimórfica evita seis tablas puente casi idénticas.
-- entity_type: PROTOCOL | SAMPLE | EQUIPMENT | INVENTORY_ITEM | BIOBANK_ENTRY | NOTEBOOK | DOCUMENT
CREATE TABLE IF NOT EXISTS research_project_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES research_projects(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  entity_type VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_project_links_entity
  ON research_project_links (laboratory_id, entity_type, entity_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Protocolos y procedimientos normalizados (SOP)
-- ───────────────────────────────────────────────────────────────────────────

-- kind: SOP | RESEARCH_PROTOCOL | METHOD | SAFETY
-- status: DRAFT | IN_REVIEW | APPROVED | ARCHIVED (refleja la versión vigente)
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  title VARCHAR(240) NOT NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'SOP',
  area VARCHAR(120),
  summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  current_version_id UUID,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  review_interval_months INTEGER,
  next_review_on DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

-- Cada versión conserva su contenido completo: el historial de cambios es la
-- lista de versiones, y nunca se reescribe una versión ya aprobada.
-- status: DRAFT | IN_REVIEW | APPROVED | SUPERSEDED
CREATE TABLE IF NOT EXISTS protocol_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  content TEXT NOT NULL DEFAULT '',
  change_summary TEXT,
  effective_from DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (protocol_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_protocol_versions_protocol
  ON protocol_versions (protocol_id, version_number DESC);

-- Aprobaciones de una versión, respaldadas por la firma electrónica.
-- decision: APPROVED | REJECTED
CREATE TABLE IF NOT EXISTS protocol_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_version_id UUID NOT NULL REFERENCES protocol_versions(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  decision VARCHAR(20) NOT NULL,
  note TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_protocol_approvals_version
  ON protocol_approvals (protocol_version_id, decided_at DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Registro de muestras de investigación
-- ───────────────────────────────────────────────────────────────────────────

-- Es un registro propio, distinto de `specimens` (muestras clínicas con orden y
-- paciente): aquí la muestra puede ser ambiental, biotecnológica o de campo, y
-- puede no pertenecer a ningún proyecto.
--
-- sample_type: BIOLOGICAL | MICROBIOLOGICAL | ENVIRONMENTAL | BIOTECHNOLOGICAL | ZOOTECHNICAL_BOTANICAL
-- status: REGISTERED | PENDING_ANALYSIS | IN_ANALYSIS | ANALYZED | PENDING_REPORT | REPORTED | STORED | DISCARDED
CREATE TABLE IF NOT EXISTS research_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  alias VARCHAR(200),
  sample_type VARCHAR(40) NOT NULL,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'REGISTERED',
  -- Origen de la muestra. Casi todo es opcional a propósito: el formulario
  -- decide qué pedir según el tipo, pero la base no impone una forma única.
  source_institution VARCHAR(200),
  collected_by VARCHAR(200),
  collected_on DATE,
  collected_at_time TIME,
  collection_place VARCHAR(240),
  collection_method VARCHAR(200),
  gps_latitude NUMERIC(10,6),
  gps_longitude NUMERIC(10,6),
  country VARCHAR(120),
  department VARCHAR(120),
  municipality VARCHAR(120),
  specific_site VARCHAR(240),
  -- Datos del donante o la fuente: dependen del tipo de muestra y se guardan
  -- como JSON para no crear columnas que solo aplican a un tipo.
  source_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Campos propios del tipo de muestra (el formulario dinámico).
  type_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL,
  storage_note VARCHAR(240),
  notes TEXT,
  registered_by UUID REFERENCES users(id) ON DELETE SET NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_research_samples_lab
  ON research_samples (laboratory_id, status, registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_samples_project
  ON research_samples (project_id, registered_at DESC);

-- Historial de la muestra: qué usuario hizo qué y cuándo.
-- event_type: REGISTERED | STATUS_CHANGED | ANALYZED | REPORTED | MOVED |
--             LINKED_PROTOCOL | STORED | NOTE | DISCARDED
CREATE TABLE IF NOT EXISTS research_sample_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES research_samples(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
  previous_status VARCHAR(30),
  new_status VARCHAR(30),
  detail TEXT,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_by_name VARCHAR(200),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sample_events_sample
  ON research_sample_events (sample_id, performed_at DESC);

-- Protocolos aplicados a una muestra.
CREATE TABLE IF NOT EXISTS research_sample_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sample_id UUID NOT NULL REFERENCES research_samples(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sample_id, protocol_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Biobancos
-- ───────────────────────────────────────────────────────────────────────────

-- El biobanco no sustituye al registro de muestras: lo complementa. La muestra
-- se registra una sola vez y, si requiere conservación, entra aquí con su
-- ubicación, condiciones y control de calidad.
--
-- status: ACTIVE | LOANED | IN_USE | DEPLETED | DISCARDED
-- storage_kind: REFRIGERATED | FROZEN | ULTRAFREEZER | LIQUID_NITROGEN | ROOM_TEMPERATURE
CREATE TABLE IF NOT EXISTS biobank_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  sample_id UUID NOT NULL REFERENCES research_samples(id) ON DELETE CASCADE,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  material_type VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  -- Ubicación física completa: edificio → posición dentro de la caja.
  building VARCHAR(120),
  laboratory_room VARCHAR(120),
  room VARCHAR(120),
  equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL,
  shelf VARCHAR(60),
  rack VARCHAR(60),
  box VARCHAR(60),
  position VARCHAR(60),
  -- Condiciones de conservación.
  storage_kind VARCHAR(40),
  temperature_c NUMERIC(6,2),
  stored_on DATE,
  removed_on DATE,
  shelf_life_months INTEGER,
  expires_on DATE,
  aliquot_count INTEGER,
  volume_amount NUMERIC(12,3),
  volume_unit VARCHAR(40),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_biobank_entries_lab
  ON biobank_entries (laboratory_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_biobank_entries_sample
  ON biobank_entries (sample_id);

-- Historial de movimientos del material almacenado.
-- movement_type: STORED | RETRIEVED | ALIQUOT_TAKEN | LOANED | RETURNED | RELOCATED | DISCARDED
CREATE TABLE IF NOT EXISTS biobank_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biobank_entry_id UUID NOT NULL REFERENCES biobank_entries(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  movement_type VARCHAR(40) NOT NULL,
  detail TEXT,
  quantity NUMERIC(12,3),
  unit VARCHAR(40),
  destination VARCHAR(240),
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biobank_movements_entry
  ON biobank_movements (biobank_entry_id, performed_at DESC);

-- Control de calidad del material conservado.
-- result: PASS | FAIL | WARNING
CREATE TABLE IF NOT EXISTS biobank_quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  biobank_entry_id UUID NOT NULL REFERENCES biobank_entries(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  checked_on DATE NOT NULL DEFAULT current_date,
  integrity VARCHAR(120),
  concentration VARCHAR(120),
  purity VARCHAR(120),
  contamination VARCHAR(120),
  cell_viability VARCHAR(120),
  result VARCHAR(20) NOT NULL DEFAULT 'PASS',
  note TEXT,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biobank_qc_entry
  ON biobank_quality_checks (biobank_entry_id, checked_on DESC);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Cuaderno electrónico de laboratorio
-- ───────────────────────────────────────────────────────────────────────────

-- Un proyecto puede tener uno o varios cuadernos; un cuaderno puede existir sin
-- proyecto (trabajo por muestra suelta).
CREATE TABLE IF NOT EXISTS lab_notebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  code VARCHAR(60) NOT NULL,
  title VARCHAR(240) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

-- Entradas del cuaderno: cada experimento. El contenido vigente vive aquí y
-- cada modificación deja una versión en notebook_entry_versions.
-- status: DRAFT | COMPLETED | SIGNED | WITNESSED
CREATE TABLE IF NOT EXISTS notebook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id UUID NOT NULL REFERENCES lab_notebooks(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  sample_id UUID REFERENCES research_samples(id) ON DELETE SET NULL,
  protocol_id UUID REFERENCES protocols(id) ON DELETE SET NULL,
  entry_code VARCHAR(60) NOT NULL,
  title VARCHAR(240) NOT NULL,
  performed_on DATE NOT NULL DEFAULT current_date,
  objective TEXT,
  procedure_text TEXT,
  results TEXT,
  conclusions TEXT,
  observations TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  version_number INTEGER NOT NULL DEFAULT 1,
  signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL,
  signed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, entry_code)
);

CREATE INDEX IF NOT EXISTS idx_notebook_entries_notebook
  ON notebook_entries (notebook_id, performed_on DESC);
CREATE INDEX IF NOT EXISTS idx_notebook_entries_project
  ON notebook_entries (project_id, performed_on DESC);

-- Historial de modificaciones: se guarda el contenido anterior antes de cada
-- cambio, con quién lo hizo y por qué. Una entrada firmada no puede editarse
-- sin dejar constancia (se controla en código).
CREATE TABLE IF NOT EXISTS notebook_entry_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES notebook_entries(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  change_reason TEXT,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, version_number)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Gestión documental
-- ───────────────────────────────────────────────────────────────────────────

-- Repositorio central de todo lo que se sube en los demás módulos y de lo que
-- no tiene módulo propio (artículos, consentimientos, permisos, licencias).
-- category: ARTICLE | PROTOCOL | CONSENT | PERMIT | REPORT | EQUIPMENT_CERTIFICATE |
--           REAGENT_CERTIFICATE | SDS | LICENSE | OTHER
CREATE TABLE IF NOT EXISTS research_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  title VARCHAR(240) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'OTHER',
  description TEXT,
  project_id UUID REFERENCES research_projects(id) ON DELETE SET NULL,
  -- Vínculo opcional con el registro del que salió el documento.
  related_entity_type VARCHAR(40),
  related_entity_id UUID,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  current_version INTEGER NOT NULL DEFAULT 0,
  expires_on DATE,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (laboratory_id, code)
);

CREATE INDEX IF NOT EXISTS idx_research_documents_lab
  ON research_documents (laboratory_id, category, created_at DESC);

-- Versiones del documento. El archivo se guarda en `attachments` (blob storage)
-- y aquí queda la trazabilidad de qué versión es cuál.
CREATE TABLE IF NOT EXISTS research_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES research_documents(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  change_summary TEXT,
  attachment_id UUID,
  storage_key TEXT,
  original_filename VARCHAR(255),
  mime_type VARCHAR(120),
  size_bytes BIGINT,
  external_url TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Vínculo del protocolo con su versión vigente
-- ───────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'protocols_current_version_fkey'
  ) THEN
    ALTER TABLE protocols
      ADD CONSTRAINT protocols_current_version_fkey
      FOREIGN KEY (current_version_id) REFERENCES protocol_versions(id) ON DELETE SET NULL;
  END IF;
END $$;
