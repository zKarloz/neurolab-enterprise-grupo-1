-- NeuroLab Enterprise · Fase 6: reparación de permisos para la Edge Function admin-users.
-- Ejecutar una sola vez DESPUÉS de 202611080006_global_account_audit.sql.
-- Estas concesiones solo afectan al rol privilegiado del servidor; no a anon/authenticated.
-- La Edge Function sigue validando el JWT y el estado/rol global vigente antes de operar.
BEGIN;

-- Lectura limitada a las columnas que utiliza la verificación de Admin y el listado.
GRANT SELECT (id, email, display_name, status, is_platform_admin, created_at)
  ON TABLE public.app_users TO service_role;

-- La administración solo modifica el estado y la fecha de actualización.
-- El trigger guard_last_responsible_status sigue protegiendo al último Responsable.
GRANT UPDATE (status, updated_at)
  ON TABLE public.app_users TO service_role;

-- Registrar altas, cambios de estado y recuperación de contraseñas.
-- No conceder SELECT, UPDATE ni DELETE sobre auditoría desde esta función.
GRANT INSERT (actor_id, project_id, action, resource_type, resource_id, metadata_json)
  ON TABLE public.audit_events TO service_role;

COMMIT;
