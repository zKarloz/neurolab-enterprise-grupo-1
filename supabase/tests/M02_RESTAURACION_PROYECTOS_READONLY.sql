-- Diagnóstico M02: una única fila, sin actualizar registros.
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname IN ('projects','project_members','audit_events')
      AND c.relrowsecurity) AS tablas_rls,
  to_regprocedure('public.restore_project(uuid)') IS NOT NULL AS rpc_presente,
  COALESCE((SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.restore_project(uuid)')), false) AS security_definer,
  NOT has_function_privilege('anon', 'public.restore_project(uuid)', 'EXECUTE') AS anon_denegado,
  has_function_privilege('authenticated','public.restore_project(uuid)','EXECUTE') AS authenticated_habilitado,
  NOT has_table_privilege('authenticated','public.projects','UPDATE') AS sin_update_directo,
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.audit_events'::regclass
      AND conname = 'audit_events_action_check'
      AND pg_get_constraintdef(oid) LIKE '%project_restored%') AS auditoria_permite_restaurar,
  EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'audit_events'
      AND policyname = 'Auditoria por rol y alcance'
      AND qual LIKE '%project_restored%') AS auditoria_global_ajustada,
  (SELECT count(*) FROM public.projects WHERE status = 'archived') AS proyectos_archivados;
