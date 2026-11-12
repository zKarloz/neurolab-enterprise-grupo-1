-- NeuroLab Enterprise · GAN-5 · Auditoría de SOLO LECTURA.
-- UNA FILA de resultados. SQL Editor verifica políticas declaradas y consistencia;
-- el aislamiento JWT real se verifica con scripts/test-gan5-live.mjs (cinco cuentas).
-- No se recuperan ni se almacenan píxeles, CSV, imágenes, pesos o contraseñas.
WITH rls AS (
  SELECT count(*)::integer AS tablas, coalesce(bool_and(rowsecurity), false) AS habilitada
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN
    ('architectures','datasets','training_runs','training_metrics',
     'run_evaluations','models','model_versions','model_uploads')
), rpc AS (
  SELECT count(*)::integer AS funciones,
    coalesce(bool_and(p.prosecdef
      AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND coalesce(array_to_string(p.proconfig, ','), '') LIKE '%search_path=%'), false) AS seguras
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN
    ('create_gan_training_run','record_gan_training_epoch','record_gan_generation_summary')
), bucket AS (
  SELECT count(*)::integer AS encontrados, coalesce(bool_and(NOT public), false) AS privado
  FROM storage.buckets WHERE id = 'model-artifacts'
), direct_writes AS (
  SELECT count(*)::integer AS permitidas
  FROM (VALUES ('architectures'), ('datasets'), ('training_runs'), ('training_metrics'),
    ('run_evaluations'), ('models'), ('model_versions'), ('model_uploads')) AS names(tablename)
  WHERE has_table_privilege('authenticated', 'public.' || names.tablename, 'INSERT')
     OR has_table_privilege('authenticated', 'public.' || names.tablename, 'UPDATE')
     OR has_table_privilege('authenticated', 'public.' || names.tablename, 'DELETE')
), gan_runs AS (
  SELECT r.id, r.project_id, r.status, r.problem_type, r.epochs_planned, r.completed_epochs,
    r.preprocessing_json
  FROM public.training_runs r
  JOIN public.architectures a
    ON a.id = r.architecture_id AND a.project_id = r.project_id AND a.family = 'gan'
), metric_groups AS (
  SELECT m.run_id, m.epoch, count(*)::integer AS filas,
    count(DISTINCT m.metric_name)::integer AS nombres,
    coalesce(bool_and(m.split = 'train' AND m.metric_name IN
      ('generator_loss','discriminator_loss','d_real','d_fake')
      AND m.metric_value >= 0 AND
      (m.metric_name NOT IN ('d_real','d_fake') OR m.metric_value <= 1)), false) AS validas
  FROM public.training_metrics m JOIN gan_runs r ON r.id = m.run_id
  GROUP BY m.run_id, m.epoch
), metric_totals AS (
  SELECT run_id, count(*)::integer AS epocas,
    coalesce(sum(filas), 0)::integer AS filas,
    coalesce(bool_and(filas = 4 AND nombres = 4 AND validas), false) AS completas,
    min(epoch) AS primera, max(epoch) AS ultima
  FROM metric_groups GROUP BY run_id
), evaluation_totals AS (
  SELECT e.run_id, count(*)::integer AS resumenes,
    coalesce(bool_and(e.problem_type = 'generative'
      AND e.sample_count IN (4,8,16)
      AND e.metrics_json->>'family' = 'gan'
      AND e.metrics_json->>'kind' = 'descriptive_only'
      AND (e.metrics_json->>'sampleCount')::integer = e.sample_count
      AND (e.metrics_json->>'dimension')::integer =
        (r.preprocessing_json->>'dimension')::integer
      AND jsonb_typeof(e.metrics_json->'meanIntensity') = 'number'
      AND jsonb_typeof(e.metrics_json->'meanPairwiseDistance') = 'number'
      AND jsonb_typeof(e.metrics_json->'minimumPixel') = 'number'
      AND jsonb_typeof(e.metrics_json->'maximumPixel') = 'number'
      AND (e.metrics_json - ARRAY['family','kind','sampleCount','dimension',
        'meanIntensity','meanPairwiseDistance','minimumPixel','maximumPixel']::text[]) = '{}'::jsonb), false)
      AS resumenes_validos
  FROM public.run_evaluations e JOIN gan_runs r ON r.id = e.run_id
  GROUP BY e.run_id
), completed AS (
  SELECT count(*)::integer AS total,
    count(*) FILTER (WHERE r.problem_type = 'generative' AND r.epochs_planned BETWEEN 1 AND 100
      AND r.completed_epochs = r.epochs_planned
      AND coalesce(mt.epocas, 0) = r.epochs_planned
      AND coalesce(mt.filas, 0) = r.epochs_planned * 4
      AND coalesce(mt.completas, false)
      AND mt.primera = 1 AND mt.ultima = r.epochs_planned
      -- El resumen es opcional al completar; se crea al generar por primera vez.
      AND coalesce(ev.resumenes, 0) <= 1
      AND (coalesce(ev.resumenes, 0) = 0 OR coalesce(ev.resumenes_validos, false)))::integer
    AS consistentes
  FROM gan_runs r
  LEFT JOIN metric_totals mt ON mt.run_id = r.id
  LEFT JOIN evaluation_totals ev ON ev.run_id = r.id
  WHERE r.status = 'completed'
), summaries AS (
  SELECT count(*)::integer AS total,
    count(*) FILTER (WHERE e.metrics_json ?| ARRAY[
      'pixels','pixelValues','images','examples','rows','targets','predictions',
      'xTrain','yTrain','csv','data','samples'])::integer AS con_datos_individuales,
    count(*) FILTER (WHERE e.problem_type = 'generative'
      AND e.metrics_json->>'family' = 'gan'
      AND e.metrics_json->>'kind' = 'descriptive_only'
      AND e.sample_count IN (4,8,16)
      AND (e.metrics_json - ARRAY['family','kind','sampleCount','dimension',
        'meanIntensity','meanPairwiseDistance','minimumPixel','maximumPixel']::text[]) = '{}'::jsonb
      AND (e.metrics_json->>'sampleCount')::integer = e.sample_count)::integer AS consistentes
  FROM public.run_evaluations e JOIN gan_runs r ON r.id = e.run_id
), versions AS (
  SELECT count(*)::integer AS publicadas,
    count(*) FILTER (WHERE v.preprocessing_manifest->>'kind' = 'gan_grayscale_csv_v1'
      AND v.preprocessing_manifest->>'family' = 'gan'
      AND v.preprocessing_manifest->>'normalization' = 'tanh_minus1_plus1'
      AND v.preprocessing_manifest->>'unconditional' = 'true'
      AND v.manifest_sha256 ~ '^[0-9a-f]{64}$'
      AND v.weights_sha256 ~ '^[0-9a-f]{64}$'
      AND v.manifest_path LIKE '%/model.json' AND v.weights_path LIKE '%/weights.bin'
      AND v.manifest_path <> v.weights_path
      AND r.status = 'completed' AND r.problem_type = 'generative'
      AND a.family = 'gan' AND v.preprocessing_manifest = r.preprocessing_json
      -- Publicar pesos sí exige que el primer resumen GAN esté confirmado.
      AND (SELECT count(*) FROM public.run_evaluations e2 WHERE e2.run_id = r.id) = 1)::integer
    AS con_integridad
  FROM public.model_versions v
  JOIN public.training_runs r ON r.id = v.run_id AND r.project_id = v.project_id
  JOIN public.architectures a ON a.id = r.architecture_id AND a.project_id = v.project_id
  WHERE v.preprocessing_manifest->>'family' = 'gan' OR a.family = 'gan'
)
SELECT
  rls.tablas AS tablas_rls,
  (rls.tablas = 8 AND rls.habilitada) AS rls_correcto,
  rpc.funciones AS funciones_gan,
  (rpc.funciones = 3 AND rpc.seguras) AS rpc_correctas,
  (bucket.encontrados = 1 AND bucket.privado) AS bucket_privado,
  direct_writes.permitidas AS escrituras_directas_auth,
  (direct_writes.permitidas = 0) AS sin_escritura_directa,
  completed.total AS ejecuciones_completadas,
  completed.consistentes AS completadas_consistentes,
  (completed.total = completed.consistentes) AS persistencia_correcta,
  summaries.total AS resumenes_gan,
  summaries.con_datos_individuales AS resumenes_con_datos_individuales,
  (summaries.total = summaries.consistentes AND summaries.con_datos_individuales = 0)
    AS resumenes_consistentes,
  versions.publicadas AS versiones_gan_publicadas,
  versions.con_integridad AS versiones_con_hashes_y_rutas,
  (versions.publicadas = versions.con_integridad) AS versiones_consistentes
FROM rls CROSS JOIN rpc CROSS JOIN bucket CROSS JOIN direct_writes
CROSS JOIN completed CROSS JOIN summaries CROSS JOIN versions;
