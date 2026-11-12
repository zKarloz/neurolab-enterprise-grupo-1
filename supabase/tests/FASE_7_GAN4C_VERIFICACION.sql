-- GAN-4C: una sola tabla de lectura; no requiere migraciones.
-- Comprueba vínculos con el run GAN, topología G registrada, hashes y rutas privadas.
select
  v.id as version_id,
  v.run_id as ejecucion,
  v.version as numero_version,
  m.name as modelo,
  a.family as familia,
  r.status as estado_entrenamiento,
  r.completed_epochs as epocas_completadas,
  r.epochs_planned as epocas_planificadas,
  v.preprocessing_manifest->>'kind' as formato,
  (v.preprocessing_manifest->>'dimension')::integer as dimension,
  (v.preprocessing_manifest->>'latentSize')::integer as ruido_latente,
  v.preprocessing_manifest->>'normalization' as normalizacion,
  (select count(*) from public.run_evaluations e where e.run_id = v.run_id) as resumenes,
  (select count(*) from public.training_metrics tm where tm.run_id = v.run_id) as metricas,
  (v.manifest_sha256 ~ '^[0-9a-f]{64}$' and v.weights_sha256 ~ '^[0-9a-f]{64}$') as hashes_registrados,
  (v.manifest_path like '%/model.json' and v.weights_path like '%/weights.bin' and
   v.manifest_path <> v.weights_path) as rutas_privadas_presentes,
  (a.family = 'gan' and r.problem_type = 'generative' and r.status = 'completed'
    and r.completed_epochs = r.epochs_planned
    and v.preprocessing_manifest->>'family' = 'gan'
    and v.preprocessing_manifest->>'kind' = 'gan_grayscale_csv_v1'
    and (v.preprocessing_manifest->>'dimension')::integer in (8, 28)
    and (v.preprocessing_manifest->>'latentSize')::integer in (16, 32, 64)
    and v.preprocessing_manifest->>'normalization' = 'tanh_minus1_plus1'
    and v.preprocessing_manifest->>'unconditional' = 'true'
    and (select count(*) from public.run_evaluations e where e.run_id = v.run_id) = 1
    and (select count(*) from public.training_metrics tm where tm.run_id = v.run_id) = 4 * r.epochs_planned
  ) as version_consistente
from public.model_versions v
join public.models m on m.id = v.model_id and m.project_id = v.project_id
join public.training_runs r on r.id = v.run_id and r.project_id = v.project_id
join public.architectures a on a.id = r.architecture_id and a.project_id = v.project_id
where a.family = 'gan'
order by v.created_at desc
limit 10;
