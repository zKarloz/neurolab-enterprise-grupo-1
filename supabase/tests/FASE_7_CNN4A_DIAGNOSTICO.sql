-- CNN-4A / Consultas de diagnóstico SOLO LECTURA para SQL Editor de Supabase.
-- Ejecutar DESPUÉS de la migración 012, en el proyecto esperado.
-- NO confunde la existencia de una función con pruebas RLS/autorización en vivo.

-- (1) La migración ha ampliado las cuatro restricciones objetivo.
select conrelid::regclass as tabla, conname as restriccion,
       pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid in ('public.architectures'::regclass,
                   'public.datasets'::regclass,
                   'public.training_runs'::regclass,
                   'public.run_evaluations'::regclass)
  and conname in ('architectures_family_check', 'datasets_problem_type_check',
                  'datasets_byte_size_check', 'training_runs_problem_type_check',
                  'run_evaluations_problem_type_check', 'run_evaluations_metrics_json_check')
order by conrelid::regclass::text, conname;

-- (2) Permisos: solamente authenticated puede ejecutar las RPC; no hay escritura directa.
select n.nspname as esquema, p.proname as funcion,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in
  ('create_cnn_training_run','record_cnn_training_epoch','record_cnn_test_evaluation')
order by funcion;

select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public' and table_name in
  ('architectures','datasets','training_runs','training_metrics','run_evaluations','model_versions')
  and grantee in ('anon','authenticated')
order by table_name, grantee, privilege_type;

-- (3) RLS sigue activo en las tablas técnicas.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in
  ('architectures','datasets','training_runs','training_metrics','run_evaluations',
   'model_uploads','model_versions')
order by tablename;
