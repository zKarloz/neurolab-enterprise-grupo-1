-- NeuroLab Enterprise / Fase 7 / RNN-5 / 12-11-2026
-- AUDITORÍA DE SOLO LECTURA: produce UNA FILA, no modifica datos ni privilegios.
-- Ejecutar en Supabase SQL Editor. El SQL Editor NO acredita aislamiento RLS por JWT;
-- usar también scripts/test-rnn5-live.mjs con cinco identidades reales.
-- Se preserva la familia real por JOIN a architectures (no por problem_type).
with rls as (
  select count(*)::integer as tablas,
    coalesce(bool_and(rowsecurity), false) as habilitada
  from pg_tables
  where schemaname = 'public' and tablename in
    ('architectures', 'datasets', 'training_runs', 'training_metrics',
     'run_evaluations', 'models', 'model_versions', 'model_uploads')
), rpc as (
  select count(*)::integer as funciones,
    coalesce(bool_and(p.prosecdef
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and coalesce(array_to_string(p.proconfig, ','), '') like '%search_path=%'), false) as seguras
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in
    ('create_rnn_training_run', 'record_rnn_training_epoch', 'record_rnn_test_evaluation')
), bucket as (
  select count(*)::integer as encontrados,
    coalesce(bool_and(not public), false) as privado
  from storage.buckets where id = 'model-artifacts'
), runs as (
  select r.id, r.problem_type, r.status, r.epochs_planned, r.completed_epochs,
    (r.preprocessing_json->'split'->>'testCount')::integer as test_reservado,
    (select count(*) from public.training_metrics m where m.run_id = r.id) as metricas,
    (select count(distinct m.epoch) from public.training_metrics m where m.run_id = r.id) as epocas_metricas,
    (select count(*) from public.run_evaluations e where e.run_id = r.id) as evaluaciones,
    (select e.sample_count from public.run_evaluations e where e.run_id = r.id limit 1) as test_evaluado,
    (select e.metrics_json->>'family' from public.run_evaluations e where e.run_id = r.id limit 1) as familia_evaluacion
  from public.training_runs r
  join public.architectures a on a.id = r.architecture_id and a.project_id = r.project_id
  where a.family = 'rnn'
), complete_runs as (
  select count(*)::integer as completadas,
    count(*) filter (where epochs_planned = completed_epochs and epochs_planned > 0
      and metricas = epochs_planned * 4 and epocas_metricas = epochs_planned
      and evaluaciones = 1 and test_reservado = test_evaluado
      and familia_evaluacion = 'rnn')::integer as consistentes
  from runs where status = 'completed'
), evaluations as (
  select count(*)::integer as total,
    count(*) filter (where e.metrics_json ?| array[
      'examples', 'rows', 'seriesId', 'targets', 'predictions', 'samples',
      'windows', 'xTrain', 'yTrain'])::integer as con_datos_individuales,
    count(*) filter (where e.metrics_json->>'family' = 'rnn'
      and (e.metrics_json->>'sampleCount')::integer = e.sample_count)::integer as con_familia_y_muestras
  from public.run_evaluations e
  join public.training_runs r on r.id = e.run_id
  join public.architectures a on a.id = r.architecture_id and a.family = 'rnn'
), versions as (
  select count(*)::integer as publicadas,
    count(*) filter (where length(v.manifest_sha256) = 64 and length(v.weights_sha256) = 64
      and nullif(v.manifest_path, '') is not null and nullif(v.weights_path, '') is not null
      and v.preprocessing_manifest->>'kind' = 'rnn_temporal_csv_v1')::integer as con_integridad
  from public.model_versions v
  where v.preprocessing_manifest->>'family' = 'rnn'
)
select rls.tablas as tablas_rls,
  (rls.tablas = 8 and rls.habilitada) as rls_correcto,
  rpc.funciones as funciones_rnn,
  (rpc.funciones = 3 and rpc.seguras) as rpc_correctas,
  (bucket.encontrados = 1 and bucket.privado) as bucket_privado,
  complete_runs.completadas as ejecuciones_completadas,
  complete_runs.consistentes as completadas_consistentes,
  (complete_runs.completadas = complete_runs.consistentes) as persistencia_correcta,
  evaluations.total as evaluaciones_rnn,
  evaluations.con_datos_individuales as evaluaciones_con_datos_individuales,
  (evaluations.total = evaluations.con_familia_y_muestras) as evaluaciones_consistentes,
  versions.publicadas as versiones_rnn_publicadas,
  versions.con_integridad as versiones_con_hashes_y_rutas,
  (versions.publicadas = versions.con_integridad) as versiones_consistentes
from rls cross join rpc cross join bucket cross join complete_runs
cross join evaluations cross join versions;
