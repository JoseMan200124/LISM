-- NexaLab — Firma electrónica de usuario, seguridad de reactivos y accesos de
-- invitado (julio 2026). Migración aditiva e idempotente. No elimina ni
-- reinterpreta datos existentes.
--
-- Cubre tres necesidades transversales a todo tipo de laboratorio:
--   1. Cada usuario tiene una firma electrónica propia (rúbrica + credenciales)
--      que se estampa al solicitar o autorizar una compra y al solicitar o
--      autorizar el uso de un reactivo controlado. El acto de firmar sigue
--      pasando por electronic_signatures (append-only, migración 0004): aquí
--      solo se guarda la representación visual y el vínculo al registro firmado.
--   2. Cada reactivo puede declarar sus pictogramas de peligrosidad SGA/GHS y
--      sus procedimientos de seguridad, que se consultan junto con la ficha de
--      datos de seguridad (SDS) ya adjuntable desde la migración 0004.
--   3. Un profesor, coordinador o director puede emitir códigos temporales para
--      que estudiantes sin cuenta entren como invitados a un laboratorio con un
--      alcance limitado y una vigencia definida (por ejemplo, un semestre).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Firma electrónica del usuario
-- ───────────────────────────────────────────────────────────────────────────

-- Rúbrica y datos con los que firma cada persona. Es un dato de identidad, no
-- una credencial: la autenticidad del acto la sigue dando la reautenticación
-- con contraseña que registra electronic_signatures.
--   signature_image: data URL PNG del trazo capturado en pantalla (o NULL si la
--   persona prefiere la firma tipográfica generada a partir de su nombre).
CREATE TABLE IF NOT EXISTS user_signature_profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  display_name VARCHAR(200) NOT NULL,
  credentials VARCHAR(200),
  signature_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_signature_profiles_lab
  ON user_signature_profiles (laboratory_id);

-- Vínculo de cada registro con la firma que lo respalda. Se conserva el id de
-- electronic_signatures para poder mostrar quién firmó, cuándo y con qué
-- significado sin duplicar el acto de firma.
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS request_signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL;
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS approval_signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL;

ALTER TABLE controlled_usage_requests
  ADD COLUMN IF NOT EXISTS request_signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL;
ALTER TABLE controlled_usage_requests
  ADD COLUMN IF NOT EXISTS review_signature_id UUID REFERENCES electronic_signatures(id) ON DELETE SET NULL;

-- Política de firma del laboratorio:
--   { "purchaseRequest": bool, "purchaseApproval": bool,
--     "controlledRequest": bool, "controlledApproval": bool }
-- Los valores por defecto se resuelven en lib/signatures.ts (todo exigido).
ALTER TABLE laboratory_settings
  ADD COLUMN IF NOT EXISTS signature_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Seguridad del reactivo: pictogramas SGA/GHS y procedimientos
-- ───────────────────────────────────────────────────────────────────────────

-- Pictogramas declarados al dar de alta o editar el reactivo. Se guardan como
-- arreglo de códigos SGA (GHS01…GHS09) para poder dibujarlos en la aplicación
-- sin depender de archivos externos.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS hazard_pictograms JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Indicaciones de peligro y consejos de prudencia en texto libre (frases H y P
-- tal como vienen en la etiqueta del proveedor).
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS hazard_statements TEXT;

-- Procedimientos de seguridad propios del laboratorio para este reactivo:
--   { "firstAid", "spill", "fire", "ppe", "storage", "disposal", "emergencyContact" }
-- Cuando un campo queda vacío la ficha muestra el procedimiento general
-- derivado de los pictogramas (lib/ghs.ts), de modo que nunca quede en blanco.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS safety_procedures JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_inventory_items_pictograms
  ON inventory_items USING gin (hazard_pictograms);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Accesos de invitado con código temporal
-- ───────────────────────────────────────────────────────────────────────────

-- Permiso temporal emitido por un profesor, coordinador o director para que
-- estudiantes sin cuenta entren como invitados.
--   code:    código corto que se comparte con el grupo (NXL-XXXX-XXXX).
--            Se guarda legible a propósito: quien lo emite debe poder volver a
--            consultarlo y compartirlo durante todo el semestre. No da acceso a
--            datos personales ni permite administrar nada.
--   scopes:  alcance concedido, por ejemplo ["inventory.view","equipment.view",
--            "inventory.consume"]. Se valida contra lib/guest-access.ts.
--   status:  ACTIVE | REVOKED (la caducidad se evalúa por expires_at).
CREATE TABLE IF NOT EXISTS guest_access_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL UNIQUE,
  label VARCHAR(160) NOT NULL,
  note TEXT,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  max_uses INTEGER,
  uses_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_grants_lab_status
  ON guest_access_grants (laboratory_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_grants_creator
  ON guest_access_grants (created_by, created_at DESC);

-- Cada canje del código. Da trazabilidad de quién entró como invitado: el
-- estudiante escribe su nombre al canjear y ese nombre acompaña cualquier
-- consumo que registre, de modo que el movimiento de inventario nunca queda
-- anónimo.
CREATE TABLE IF NOT EXISTS guest_access_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES guest_access_grants(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  display_name VARCHAR(160) NOT NULL,
  identifier VARCHAR(120),
  user_agent VARCHAR(400),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guest_sessions_grant
  ON guest_access_sessions (grant_id, started_at DESC);

-- Movimiento registrado por un invitado: se conserva el nombre declarado y la
-- sesión de invitado para poder auditar el consumo igual que el de un usuario.
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS guest_session_id UUID REFERENCES guest_access_sessions(id) ON DELETE SET NULL;
