-- NexaLab — Mensajería interna de la institución (julio 2026).
-- Migración aditiva e idempotente.
--
-- El encargado del laboratorio de química necesita escribirle al de biología
-- sin salir de NexaLab ni usar el correo personal. El alcance es la
-- institución (organizations), no el laboratorio: los participantes pueden
-- pertenecer a laboratorios distintos de la misma organización, y esa es
-- justamente la razón de ser de la función.
--
-- Los mensajes NO se borran: se pueden dejar de ver (participante archivado)
-- pero el hilo queda, igual que el resto de registros del sistema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hilo de conversación. Puede ser entre dos personas o un grupo.
-- kind: DIRECT (dos personas) | GROUP (tres o más)
CREATE TABLE IF NOT EXISTS message_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL DEFAULT 'DIRECT',
  subject VARCHAR(200),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview VARCHAR(300)
);

CREATE INDEX IF NOT EXISTS idx_message_threads_org
  ON message_threads (organization_id, last_message_at DESC);

-- Participantes. `last_read_at` es lo que da el contador de no leídos sin
-- escribir una fila por mensaje y por persona.
CREATE TABLE IF NOT EXISTS message_thread_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_message_participants_user
  ON message_thread_participants (user_id, thread_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sender_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  -- El laboratorio desde el que se escribió: útil cuando alguien pertenece a
  -- varios y el destinatario necesita saber a qué sede se refiere.
  laboratory_id UUID REFERENCES laboratories(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON messages (thread_id, created_at DESC);

-- Búsqueda del hilo directo existente entre dos personas: evita crear un hilo
-- nuevo cada vez que se escriben.
CREATE INDEX IF NOT EXISTS idx_message_threads_direct
  ON message_threads (organization_id, kind) WHERE kind = 'DIRECT';
