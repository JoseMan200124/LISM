-- NexaLab - descarte de notificaciones y fechas metrológicas del equipo.
--
-- Dos ajustes pedidos por el laboratorio, ambos aditivos y seguros de repetir:
--
-- 1. `user_notification_reads.dismissed_at`: hasta ahora una notificación de la
--    campana solo se podía marcar como leída, así que un vencimiento o una
--    autorización seguía apareciendo indefinidamente. Con esta marca el usuario
--    puede quitarla de su campana sin que se borre el hecho de origen (la
--    alerta, el vencimiento o la solicitud siguen en su módulo).
--
-- 2. Fechas de calibración, calificación y mantenimiento en `equipment`. Las
--    próximas fechas siguen saliendo de `equipment_plans` cuando hay un plan
--    activo; estas columnas cubren el caso de un equipo que todavía no tiene
--    plan y del que sí se conoce la última intervención hecha y la siguiente
--    programada. La consulta las combina con COALESCE: el plan manda.

ALTER TABLE user_notification_reads
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_calibration_at DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_qualification_at DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS next_qualification_at DATE;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS last_maintenance_at DATE;
