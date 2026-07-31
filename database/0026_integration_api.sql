-- NexaLab — Capa de integración con sistemas externos (ERP, SAP, Power Apps).
-- Migración aditiva e idempotente.
--
-- Varias instituciones necesitan que su ERP hable con NexaLab: descargar el
-- inventario, empujar una solicitud de compra aprobada, recibir un aviso
-- cuando un reactivo llega al punto de reorden. Hasta ahora la única puerta
-- servicio-a-servicio era el puente de Dilo, atado a WhatsApp y a un teléfono
-- vinculado. Estas tablas abren esa puerta de forma general.
--
-- Dos direcciones, ambas necesarias para una integración real:
--   1) De fuera hacia dentro: `api_clients` son las credenciales que el ERP
--      presenta al gateway REST /api/v1.
--   2) De dentro hacia fuera: `webhook_endpoints` / `webhook_deliveries` son
--      los avisos que NexaLab envía al ERP cuando algo ocurre.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Credencial de una integración. Vive en un laboratorio concreto porque toda
-- la aplicación consulta por laboratory_id; una institución con tres
-- laboratorios emite tres credenciales, y así el alcance nunca es ambiguo.
--
-- `actor_user_id` es la persona responsable de la integración. No es un
-- detalle administrativo: los permisos efectivos de la credencial son la
-- INTERSECCIÓN de lo que esa persona puede hacer con los scopes concedidos,
-- de modo que una integración jamás puede hacer más que un humano
-- identificable, y la bitácora siempre tiene a quién atribuir el movimiento.
CREATE TABLE IF NOT EXISTS api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(500),
  -- Sistema que se conecta. Solo informativo: no cambia el comportamiento,
  -- pero permite que el panel muestre la guía correcta y que la bitácora
  -- diga "lo hizo el SAP", no "lo hizo una API".
  system_kind VARCHAR(40) NOT NULL DEFAULT 'GENERIC',
  -- Identificador público. Es el client_id de OAuth2 y viaja en claro.
  client_id VARCHAR(64) NOT NULL,
  -- Los primeros caracteres del secreto, para que el panel pueda mostrar
  -- "nxk_live_A1B2…" y la persona reconozca cuál credencial es cuál.
  key_prefix VARCHAR(24) NOT NULL,
  -- SHA-256 del secreto completo. El secreto en claro se muestra UNA vez, al
  -- crearlo, y no se guarda nunca: si se pierde, se rota.
  key_hash CHAR(64) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
  -- ACTIVE | REVOKED
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_clients_client_id ON api_clients (client_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_clients_key_hash ON api_clients (key_hash);
CREATE INDEX IF NOT EXISTS idx_api_clients_laboratory ON api_clients (laboratory_id, status);

-- Destino al que NexaLab avisa cuando ocurre un evento suscrito.
--
-- `signing_secret` se guarda en claro a propósito: hace falta el secreto
-- original para calcular el HMAC de CADA envío, así que no puede ser un hash
-- (a diferencia de api_clients.key_hash, que solo se compara). Es el mismo
-- compromiso que hacen Stripe y GitHub con los suyos.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  target_url TEXT NOT NULL,
  signing_secret VARCHAR(120) NOT NULL,
  event_types JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Cabeceras adicionales que exige el receptor (una API key del ERP, un
  -- identificador de tenant de SAP). Nunca incluye las de firma de NexaLab.
  custom_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- ACTIVE | PAUSED
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_laboratory
  ON webhook_endpoints (laboratory_id, status);

-- Una fila por intento de aviso. Es la caja negra de la integración: cuando
-- el ERP dice "no me llegó", aquí está la respuesta exacta que devolvió.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  event_type VARCHAR(80) NOT NULL,
  -- Identificador del evento de negocio, estable entre reintentos: permite
  -- que el receptor descarte duplicados sin lógica adicional.
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  payload JSONB NOT NULL,
  -- PENDING | DELIVERED | FAILED
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  response_status INTEGER,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint
  ON webhook_deliveries (endpoint_id, created_at DESC);
-- Índice del reintentador: busca justo lo pendiente y vencido.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON webhook_deliveries (status, next_attempt_at)
  WHERE status = 'PENDING';

-- Telemetría de llamadas al gateway. NO sustituye a audit_logs: la bitácora
-- registra el CAMBIO de negocio (quién movió qué reactivo y por qué) y es
-- inmutable; esto registra el TRÁFICO (qué llamó el ERP, cuánto tardó, qué
-- código devolvió) y sirve para diagnosticar la integración.
CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  laboratory_id UUID REFERENCES laboratories(id) ON DELETE CASCADE,
  api_client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  operation_id VARCHAR(120),
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms INTEGER,
  ip_address VARCHAR(64),
  user_agent TEXT,
  error_code VARCHAR(60),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_client
  ON api_request_logs (api_client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_laboratory
  ON api_request_logs (laboratory_id, created_at DESC);
