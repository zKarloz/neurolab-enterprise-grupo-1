-- Fase 7 / CNN-4C: inspección SOLO LECTURA después de publicar una CNN real.
-- Ejecutar en Supabase SQL Editor; NO modifica tablas, funciones ni políticas.

-- 1. Versiones CNN confirmadas: cruza run, evaluación y modelo.
select
  v.id as version_id,
  m.name as model_name,
  v.version,
  v.run_id,
  r.status as training_status,
  r.problem_type,
  r.completed_epochs,
  r.epochs_planned,
  (e.run_id is not null) as has_test_evaluation,
  (v.preprocessing_manifest ->> 'family') as model_family,
  (v.preprocessing_manifest ->> 'kind') as image_kind,
  (v.preprocessing_manifest ->> 'normalization') as normalization,
  (v.preprocessing_manifest -> 'classNames') as class_names,
  v.backend,
  v.tfjs_version,
  v.created_at
from public.model_versions v
join public.models m on m.id = v.model_id and m.project_id = v.project_id
join public.training_runs r on r.id = v.run_id and r.project_id = v.project_id
left join public.run_evaluations e on e.run_id = v.run_id
where r.problem_type = 'multiclass'
order by v.created_at desc
limit 20;

-- 2. Verifica que ambos objetos privados existen y que se registraron hashes.
select
  v.id as version_id,
  (json_object.id is not null) as manifest_exists,
  (weights_object.id is not null) as weights_exist,
  (v.manifest_sha256 ~ '^[0-9a-f]{64}$') as manifest_hash_recorded,
  (v.weights_sha256 ~ '^[0-9a-f]{64}$') as weights_hash_recorded,
  json_object.metadata ->> 'size' as model_json_bytes,
  weights_object.metadata ->> 'size' as weights_bytes
from public.model_versions v
join public.training_runs r on r.id = v.run_id
left join storage.objects json_object on json_object.bucket_id = 'model-artifacts'
  and json_object.name = v.manifest_path
left join storage.objects weights_object on weights_object.bucket_id = 'model-artifacts'
  and weights_object.name = v.weights_path
where r.problem_type = 'multiclass'
order by v.created_at desc
limit 20;

-- 3. Storage privado y RLS; no cambiar ninguna política por esta consulta.
select id, public, file_size_limit from storage.buckets where id = 'model-artifacts';
select tablename, rowsecurity from pg_tables where schemaname = 'public'
  and tablename in ('models','model_uploads','model_versions');
