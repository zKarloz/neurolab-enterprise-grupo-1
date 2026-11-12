-- RNN-4C: diagnóstico de SOLO LECTURA. Ejecutar después de publicar una versión RNN.
-- Una única consulta para que SQL Editor muestre el resultado relevante.
select
  v.id as version_id,
  v.run_id as ejecucion,
  v.version as numero_version,
  m.name as modelo,
  a.family as familia,
  r.status as estado_entrenamiento,
  v.preprocessing_manifest->>'kind' as formato_temporal,
  (v.preprocessing_manifest->>'steps')::integer as pasos_ventana,
  jsonb_array_length(v.preprocessing_manifest->'features') as variables,
  v.preprocessing_manifest->>'problemType' as problema,
  (v.preprocessing_manifest->'split'->>'testCount')::integer as test_reservado,
  length(v.manifest_sha256) = 64 and length(v.weights_sha256) = 64 as hashes_registrados,
  v.manifest_path <> '' and v.weights_path <> '' as rutas_privadas_presentes,
  (select count(*) from public.run_evaluations e where e.run_id = v.run_id) as evaluaciones
from public.model_versions v
join public.models m on m.id = v.model_id and m.project_id = v.project_id
join public.training_runs r on r.id = v.run_id and r.project_id = v.project_id
join public.architectures a on a.id = r.architecture_id
where a.family = 'rnn' and v.preprocessing_manifest->>'family' = 'rnn'
order by v.created_at desc
limit 10;
