-- GAN-4B. SOLO LECTURA. UNA consulta / UNA tabla; mostrar las últimas 5 GAN del proyecto.
-- SQL Editor opera con privilegios de administración: no reemplaza un test RLS por usuario.
select
  r.id as ejecucion,
  r.status as estado,
  a.family as familia,
  r.epochs_planned as epocas_planificadas,
  r.completed_epochs as epocas_completadas,
  (select count(*) from public.training_metrics m where m.run_id = r.id) as metricas_guardadas,
  (select count(distinct m.epoch) from public.training_metrics m where m.run_id = r.id) as epocas_con_metricas,
  (select count(*) from public.run_evaluations e where e.run_id = r.id) as resumenes_generacion,
  (select e.sample_count from public.run_evaluations e where e.run_id = r.id limit 1) as imagenes_resumidas,
  (select bool_and(e.metrics_json->>'kind' = 'descriptive_only'
                   and (e.metrics_json - array['family','kind','sampleCount','dimension',
                     'meanIntensity','meanPairwiseDistance','minimumPixel','maximumPixel']::text[]) = '{}'::jsonb)
   from public.run_evaluations e where e.run_id = r.id) as resumen_solo_agregados,
  (r.status = 'completed' and r.completed_epochs = r.epochs_planned
    and (select count(*) from public.training_metrics m where m.run_id = r.id) = 4 * r.epochs_planned
    and (select count(distinct m.epoch) from public.training_metrics m where m.run_id = r.id) = r.epochs_planned)
    as entrenamiento_consistente
from public.training_runs r
join public.architectures a on a.id = r.architecture_id and a.family = 'gan'
where r.problem_type = 'generative'
order by r.created_at desc
limit 5;
