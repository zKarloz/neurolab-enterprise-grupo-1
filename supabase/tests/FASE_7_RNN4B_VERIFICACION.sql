-- RNN-4B: diagnóstico de solo lectura. Ejecutar DESPUÉS de entrenar desde el navegador.
-- No contiene INSERT/UPDATE, no cambia roles ni datos.
-- Requiere 014 aplicada; no ejecutar nuevamente las migraciones.

-- Las 3 RPC propias de RNN y las 2 funciones compartidas deben conservar sus permisos.
select p.proname as funcion, p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('create_rnn_training_run', 'record_rnn_training_epoch',
                   'record_rnn_test_evaluation', 'set_training_runtime', 'finish_training_run')
order by p.proname;

-- Últimas ejecuciones RNN: una fila por ejecución; cuatro métricas por época.
-- La familia se verifica mediante FK, nunca por problem_type.
select r.id, r.status, a.family, r.problem_type, r.backend,
       r.execution_context, r.epochs_planned, r.completed_epochs,
       count(tm.metric_name) as metric_rows,
       count(distinct tm.epoch) as metric_epochs,
       (select count(*) from public.run_evaluations e where e.run_id = r.id) as evaluations,
       (r.preprocessing_json->'split'->>'testCount')::integer as test_reservado,
       (select e.sample_count from public.run_evaluations e where e.run_id = r.id limit 1) as test_evaluado
from public.training_runs r
join public.architectures a on a.id = r.architecture_id
left join public.training_metrics tm on tm.run_id = r.id
where a.family = 'rnn'
  and r.id in (
    select r2.id from public.training_runs r2
    join public.architectures a2 on a2.id = r2.architecture_id
    where a2.family = 'rnn' order by r2.created_at desc limit 10
  )
group by r.id, a.family
order by max(r.created_at) desc;

-- Para completadas: métrica_rows=4*epochs_planned y evaluations=1,
-- test_reservado=test_evaluado. El CSV y las predicciones individuales NO se almacenan.
select r.id, r.status, e.problem_type, e.sample_count,
       (e.metrics_json ? 'examples') as guarda_ejemplos,
       (e.metrics_json ? 'seriesId') as guarda_ids_de_serie,
       jsonb_object_keys(e.metrics_json) as clave_metrica
from public.training_runs r
join public.architectures a on a.id = r.architecture_id and a.family = 'rnn'
join public.run_evaluations e on e.run_id = r.id
order by r.created_at desc limit 60;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in
 ('architectures', 'datasets', 'training_runs', 'training_metrics',
  'run_evaluations', 'models', 'model_versions')
order by tablename;
