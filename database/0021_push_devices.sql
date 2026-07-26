-- NexaLab — Dispositivos móviles para notificaciones push (julio 2026).
-- Migración aditiva e idempotente. No modifica ninguna tabla existente.
--
-- La app móvil replica exactamente los mismos módulos, roles y permisos que la
-- web; lo único propio del móvil son las notificaciones push. Cada instalación
-- de la app registra aquí su token de Expo al iniciar sesión y lo da de baja al
-- cerrarla. El envío reutiliza los mismos eventos que ya alimentan el centro de
-- notificaciones (lib/notifications.ts): avisos educativos, alertas,
-- autorizaciones de reactivos controlados, incidencias, reservas y compras.
--
-- Un mismo usuario puede tener varios dispositivos; un mismo dispositivo solo
-- puede pertenecer a un usuario a la vez (el token es único), de modo que al
-- iniciar sesión otra persona en el teléfono el registro se reasigna en lugar
-- de duplicarse y enviar notificaciones al usuario anterior.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  laboratory_id UUID NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  -- Token de Expo Push (ExponentPushToken[...]). Único: identifica la
  -- instalación de la app en un dispositivo concreto.
  push_token TEXT NOT NULL UNIQUE,
  platform VARCHAR(20) NOT NULL DEFAULT 'unknown',
  device_name VARCHAR(160),
  app_version VARCHAR(40),
  -- INACTIVE cuando Expo responde DeviceNotRegistered (app desinstalada o
  -- permisos revocados). Se conserva la fila para no perder la trazabilidad.
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_devices_user_idx
  ON push_devices (user_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS push_devices_laboratory_idx
  ON push_devices (laboratory_id) WHERE status = 'ACTIVE';
