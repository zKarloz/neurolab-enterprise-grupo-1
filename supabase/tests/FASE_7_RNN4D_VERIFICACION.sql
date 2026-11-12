-- RNN-4D: auditoría de SOLO LECTURA. Una sola tabla de resultados.
-- Filtra por arquitecturas.family; evita clasificar RNN como Feedforward.
-- Ejecución desde Supabase SQL Editor, después de un entrenamiento RNN confirmado.
with runs as (
  select r.id, r.project_id, r.status, r.problem_type, r.epochs_planned,
         r.completed_epochs, a.family,
         (select count(*) from public.training_metrics tm where tm.run_id = r.id) as metric_rows,
         (select count(distinct tm.epoch) from public.training_metrics tm where tm.run_id = r.id) as metric_epochs,
         (select count(*) from public.run_evaluations ev where ev.run_id = r.id) as evaluations,
         (select ev.sample_count from public.run_evaluations ev where ev.run_id = r.id limit 1) as test_evaluated,
         (r.preprocessing_json->'split'->>'testCount')::integer as test_reserved,
         (select ev.metrics_json->>'family' from public.run_evaluations ev where ev.run_id = r.id limit 1) as stored_family
  from public.training_runs r
  join public.architectures a on a.id = r.architecture_id and a.project_id = r.project_id
  where a.family = 'rnn'
)
select id as ejecucion, family as familia, problem_type as problema, status as estado,
  epochs_planned as epocas_planificadas, completed_epochs as epocas_completadas,
  metric_rows as metricas, metric_epochs as epocas_con_metricas, evaluations as evaluaciones,
  test_reserved as test_reservado, test_evaluated as test_evaluado,
  stored_family as familia_evaluacion,
  (status = 'completed' and completed_epochs = epochs_planned and
    metric_rows = epochs_planned * 4 and metric_epochs = epochs_planned and
    evaluations = 1 and test_reserved = test_evaluated and stored_family = 'rnn') as persistencia_consistente
from runs
order by id desc
limit 20;
