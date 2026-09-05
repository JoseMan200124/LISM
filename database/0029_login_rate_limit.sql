-- Bloqueo temporal de cuenta tras intentos fallidos de inicio de sesión.
-- Aplicar después de 0028_notifications_dismiss_equipment_dates.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Contexto (hallazgo #3 de la auditoría de seguridad, database/README.md no
-- necesita entrada aparte por ser un cambio de una sola tabla): antes de esto,
-- POST /api/auth/login no tenía ningún límite de intentos — un atacante podía
-- probar contraseñas de forma indefinida contra cualquier correo conocido.
-- `failed_login_count` se incrementa en cada intento fallido contra un correo
-- que sí existe en la base de datos y se reinicia en cada inicio de sesión
-- exitoso; al llegar a 5 intentos seguidos, `locked_until` fija un bloqueo
-- temporal de 15 minutos (ver app/api/auth/login/route.ts). No sustituye un
-- límite por IP a nivel de infraestructura (Vercel/Azure Front Door), pero
-- cierra la puerta que quedaba completamente abierta a nivel de aplicación.
