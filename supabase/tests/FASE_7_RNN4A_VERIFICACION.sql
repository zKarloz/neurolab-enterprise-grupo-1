-- RNN-4A: diagnóstico SOLO LECTURA después de ejecutar la migración 014.
-- Debe mostrar family rnn, 3 RPC permitidas para authenticated y negadas a anon.
select conrelid::regclass as tabla, conname as restriccion,
       pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.architectures'::regclass and conname = 'architectures_family_check';

select proname as funcion, prosecdef as security_definer,
       has_function_privilege('anon',oid,'EXECUTE') as anon_puede_ejecutar,
       has_function_privilege('authenticated',oid,'EXECUTE') as autenticado_puede_ejecutar
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('create_rnn_training_run','record_rnn_training_epoch','record_rnn_test_evaluation')
order by proname;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in
  ('architectures','datasets','training_runs','training_metrics','run_evaluations','models','model_versions')
order by tablename;

-- Solo lectura: no crear ejecuciones; verificar que cada RPC es SECURITY DEFINER.
select count(*) as funciones_rnn_definidas from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('create_rnn_training_run','record_rnn_training_epoch','record_rnn_test_evaluation')
  and prosecdef;
