-- NeuroLab Enterprise / CNN-5 / 10-11-2026.
-- SOLO LECTURA. Ejecutar como consultas separadas en Supabase SQL Editor.
-- SQL Editor verifica configuración administrativa, NO prueba RLS por identidad:
-- para eso ejecutar scripts/test-cnn5-live.mjs con cinco JWT reales.

-- 1. Las tablas técnicas clave deben mantener RLS habilitada.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'architectures', 'datasets', 'training_runs', 'training_metrics',
    'run_evaluations', 'models', 'model_versions', 'model_uploads'
  )
order by tablename;

-- 2. Las tres RPC de CNN deben ser SECURITY DEFINER, accesibles solo
-- para authenticated, con verificación de permisos interna por proyecto.
select p.proname as funcion, p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  p.proconfig as configuracion_segura
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_cnn_training_run', 'record_cnn_training_epoch',
    'record_cnn_test_evaluation'
  )
order by p.proname;

-- 3. El bucket de modelos se conserva privado y sin acceso anónimo.
select id, public, file_size_limit
from storage.buckets
where id = 'model-artifacts';

-- 4. Estado de las últimas 20 ejecuciones CNN: completadas =
-- todas las épocas guardadas (4 métricas por época) y evaluación disponible.
-- Los registros cancelados/fallidos pueden tener menos épocas; es esperado.
with recent as (
  select r.id, r.status, r.epochs_planned, r.completed_epochs
  from public.training_runs r
  where r.problem_type = 'multiclass'
  order by r.created_at desc
  limit 20
), recorded as (
  select r.id, count(m.metric_value) as total_metricas,
    count(distinct m.epoch) as epocas_con_metricas
  from recent r
  left join public.training_metrics m on m.run_id = r.id
  group by r.id
)
select left(r.id::text, 8) as run_ref,
  r.status, r.epochs_planned, r.completed_epochs,
  m.total_metricas, m.epocas_con_metricas,
  (e.run_id is not null) as evaluacion_registrada,
  case when r.status = 'completed'
    then r.epochs_planned = r.completed_epochs
      and m.total_metricas = r.epochs_planned * 4
      and e.run_id is not null
    else null end as completado_consistente
from recent r
join recorded m on m.id = r.id
left join public.run_evaluations e on e.run_id = r.id
order by run_ref;

-- 5. Seguridad de los agregados CNN y registros asociados a versiones reales.
-- NO muestra matrices, nombres de usuarios, contenidos de archivo ni hashes.
select count(*) as evaluaciones_cnn,
  count(*) filter (where e.sample_count >= 1) as con_muestras,
  count(*) filter (where jsonb_typeof(e.metrics_json->'matrix') = 'array') as matrices,
  count(*) filter (where e.metrics_json ?| array['examples','pixels','images','probabilities']) as con_contenido_prohibido
from public.run_evaluations e
where e.problem_type = 'multiclass';

-- 6. Versiones CNN efectivamente publicadas (no reservas huérfanas).
select count(*) as versiones_cnn_publicadas,
  count(*) filter (where length(v.manifest_sha256) = 64 and length(v.weights_sha256) = 64) as hashes_presentes
from public.model_versions v
where v.preprocessing_manifest->>'family' = 'cnn';
