-- GAN-4A: DIAGNÓSTICO DE SOLO LECTURA, UNA SOLA FILA.
-- El SQL Editor confirma RLS habilitado y permisos configurados; no valida
-- el aislamiento entre usuarios reales. Para eso se usará un script con JWT en GAN-5.
with rls as (
  select count(*)::integer as tablas, coalesce(bool_and(rowsecurity), false) as activo
  from pg_tables where schemaname='public' and tablename in
    ('architectures','datasets','training_runs','training_metrics','run_evaluations',
     'models','model_versions','model_uploads')
), rpc as (
  select count(*)::integer as funciones,
    coalesce(bool_and(p.prosecdef
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and coalesce(array_to_string(p.proconfig,','),'') like '%search_path=%'), false) as seguras
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in
    ('create_gan_training_run','record_gan_training_epoch','record_gan_generation_summary')
), checks as (
  select
    count(*) filter (where t.relname='architectures' and c.conname='architectures_family_check'
      and pg_get_constraintdef(c.oid) like '%gan%') as familia_gan,
    count(*) filter (where t.relname='training_runs' and c.conname='training_runs_problem_type_check'
      and pg_get_constraintdef(c.oid) like '%generative%') as problema_gan,
    count(*) filter (where t.relname='datasets' and c.conname='datasets_problem_type_check'
      and pg_get_constraintdef(c.oid) like '%generative%') as dataset_generativo,
    count(*) filter (where t.relname='run_evaluations' and c.conname='run_evaluations_problem_type_check'
      and pg_get_constraintdef(c.oid) like '%generative%') as resumen_generativo,
    count(*) filter (where t.relname='training_runs' and c.conname='training_runs_epochs_planned_check'
      and pg_get_constraintdef(c.oid) like '%100%') as epocas_hasta_100,
    count(*) filter (where t.relname='training_metrics' and c.conname='training_metrics_epoch_check'
      and pg_get_constraintdef(c.oid) like '%100%') as metricas_hasta_100,
    count(*) filter (where t.relname='training_metrics' and c.conname='training_metrics_metric_name_check'
      and pg_get_constraintdef(c.oid) like '%generator_loss%'
      and pg_get_constraintdef(c.oid) like '%discriminator_loss%'
      and pg_get_constraintdef(c.oid) like '%d_real%'
      and pg_get_constraintdef(c.oid) like '%d_fake%') as indicadores_gan
  from pg_constraint c join pg_class t on t.oid=c.conrelid
  join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public'
), direct_grants as (
  -- Se verifican las mismas tablas de entrenamiento que deben seguir sin escritura directa.
  select count(*) filter (where has_table_privilege('authenticated',
    format('public.%I',x.table_name),'INSERT')
    or has_table_privilege('authenticated',format('public.%I',x.table_name),'UPDATE')
    or has_table_privilege('authenticated',format('public.%I',x.table_name),'DELETE')) as escrituras_directas
  from (values ('architectures'),('datasets'),('training_runs'),('training_metrics'),('run_evaluations')) x(table_name)
)
select rls.tablas as tablas_rls, (rls.tablas=8 and rls.activo) as rls_correcto,
  rpc.funciones as funciones_gan, (rpc.funciones=3 and rpc.seguras) as rpc_correctas,
  (checks.familia_gan=1 and checks.problema_gan=1 and checks.dataset_generativo=1
    and checks.resumen_generativo=1) as tipo_generativo_correcto,
  (checks.epocas_hasta_100=1 and checks.metricas_hasta_100=1) as epocas_100_correctas,
  (checks.indicadores_gan=1) as cuatro_metricas_gan,
  direct_grants.escrituras_directas as escrituras_directas_auth,
  (direct_grants.escrituras_directas=0) as sin_escritura_directa
from rls cross join rpc cross join checks cross join direct_grants;
