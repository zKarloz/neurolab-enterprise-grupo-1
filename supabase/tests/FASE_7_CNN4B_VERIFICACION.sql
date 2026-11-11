-- CNN-4B. Diagnóstico únicamente de lectura para Supabase SQL Editor.
-- Ejecutar DESPUÉS de entrenar en la app. SQL Editor suele usar un rol privilegiado:
-- estas consultas NO sustituyen una prueba de RLS con las cuentas reales.

-- 1. Últimas ejecuciones CNN: arquitectura y dataset vinculados al mismo proyecto.
select r.id as run_id, r.created_at, r.status, r.completed_epochs, r.epochs_planned,
       r.backend, r.execution_context, r.tfjs_version,
       a.family, d.problem_type, d.name as dataset_name, d.row_count,
       d.byte_size, r.seed
  from public.training_runs r
  join public.architectures a on a.id = r.architecture_id and a.project_id = r.project_id
  join public.datasets d on d.id = r.dataset_id and d.project_id = r.project_id
 where a.family = 'cnn'
 order by r.created_at desc
 limit 10;

-- 2. Confirmación de pérdidas y accuracy (cuatro métricas por época registrada).
select m.run_id, m.epoch,
       count(*) as metric_rows,
       count(*) filter (where m.split = 'train') as train_rows,
       count(*) filter (where m.split = 'validation') as validation_rows,
       array_agg(m.metric_name || '/' || m.split order by m.metric_name,m.split) as metrics
  from public.training_metrics m
  join public.training_runs r on r.id = m.run_id
  join public.architectures a on a.id = r.architecture_id and a.project_id = r.project_id
 where a.family = 'cnn'
 group by m.run_id, m.epoch
 order by m.run_id, m.epoch;

-- 3. Evaluación agregada real; no deben guardarse ejemplos ni imágenes individuales.
select e.run_id, e.problem_type, e.sample_count,
       e.metrics_json->>'accuracy' as accuracy,
       e.metrics_json->>'macroF1' as macro_f1,
       jsonb_array_length(e.metrics_json->'matrix') as matrix_rows,
       e.metrics_json ? 'examples' as contains_examples,
       e.metrics_json ? 'pixels' as contains_pixels
  from public.run_evaluations e
  join public.training_runs r on r.id = e.run_id
  join public.architectures a on a.id = r.architecture_id and a.project_id = r.project_id
 where a.family = 'cnn'
 order by e.evaluated_at desc
 limit 10;
