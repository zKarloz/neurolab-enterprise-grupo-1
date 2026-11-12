-- GAN-4D · SOLO LECTURA · una consulta y una tabla de resultados.
-- SQL Editor suele tener privilegios de administrador: para probar RLS por rol usar GAN-5.
-- No se consultan ni se guardan CSV, píxeles, imágenes ni pesos.
SELECT
  r.id AS ejecucion,
  r.status AS estado,
  a.family AS familia,
  r.problem_type AS problema,
  (r.preprocessing_json->>'dimension')::integer AS dimension,
  r.epochs_planned AS epocas_planificadas,
  r.completed_epochs AS epocas_completadas,
  (SELECT count(*) FROM public.training_metrics m WHERE m.run_id = r.id) AS metricas_guardadas,
  (SELECT count(DISTINCT m.epoch) FROM public.training_metrics m WHERE m.run_id = r.id) AS epocas_con_metricas,
  (SELECT count(*) FROM public.run_evaluations e WHERE e.run_id = r.id) AS resumenes_generacion,
  (SELECT e.sample_count FROM public.run_evaluations e WHERE e.run_id = r.id LIMIT 1) AS imagenes_resumidas,
  (SELECT e.metrics_json->>'kind' FROM public.run_evaluations e WHERE e.run_id = r.id LIMIT 1) AS tipo_resumen,
  (SELECT (e.metrics_json->>'meanIntensity')::numeric FROM public.run_evaluations e WHERE e.run_id = r.id LIMIT 1) AS brillo_medio,
  (SELECT (e.metrics_json->>'meanPairwiseDistance')::numeric FROM public.run_evaluations e WHERE e.run_id = r.id LIMIT 1) AS diferencia_media,
  (SELECT bool_and(
    e.metrics_json->>'family' = 'gan'
    AND e.metrics_json->>'kind' = 'descriptive_only'
    AND (e.metrics_json - ARRAY['family','kind','sampleCount','dimension',
      'meanIntensity','meanPairwiseDistance','minimumPixel','maximumPixel']::text[]) = '{}'::jsonb
  ) FROM public.run_evaluations e WHERE e.run_id = r.id) AS resumen_solo_agregados,
  (
    r.status = 'completed'
    AND r.completed_epochs = r.epochs_planned
    AND (SELECT count(*) FROM public.training_metrics m WHERE m.run_id = r.id) = 4 * r.epochs_planned
    AND (SELECT count(DISTINCT m.epoch) FROM public.training_metrics m WHERE m.run_id = r.id) = r.epochs_planned
  ) AS entrenamiento_consistente
FROM public.training_runs r
JOIN public.architectures a ON a.id = r.architecture_id AND a.family = 'gan'
WHERE r.problem_type = 'generative'
ORDER BY r.created_at DESC
LIMIT 5;
