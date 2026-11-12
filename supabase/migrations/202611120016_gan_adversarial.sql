-- NeuroLab Enterprise / Fase 7 / GAN-4A / migración 016.
-- Aplicar UNA vez después de 015. Preparación de persistencia, sin activar escrituras en la UI.
-- GAN es GENERATIVA, no clasificación binaria: el discriminador usa etiquetas
-- internas, pero el CSV no tiene un objetivo supervisado.
-- La RPC recibe metadatos y resúmenes, NUNCA CSV, píxeles, ruido, ni PNG.
begin;

-- Las RPC de las otras familias mantienen su validación y privilegios intactos.
-- Las restricciones generales se amplían para representar GAN con semántica propia.
alter table public.architectures drop constraint architectures_family_check;
alter table public.architectures add constraint architectures_family_check
  check (family in ('feedforward','cnn','rnn','gan'));

alter table public.datasets drop constraint datasets_problem_type_check;
alter table public.datasets add constraint datasets_problem_type_check
  check (problem_type in ('binary','regression','multiclass','generative'));

alter table public.training_runs drop constraint training_runs_problem_type_check;
alter table public.training_runs add constraint training_runs_problem_type_check
  check (problem_type in ('binary','regression','multiclass','generative'));

alter table public.run_evaluations drop constraint run_evaluations_problem_type_check;
alter table public.run_evaluations add constraint run_evaluations_problem_type_check
  check (problem_type in ('binary','regression','multiclass','generative'));

-- GAN-3 admite hasta 100 épocas; las demás RPC conservan sus topes específicos.
-- Sin esto, GAN-4B fallaría al registrar épocas 51..100.
alter table public.training_runs drop constraint training_runs_epochs_planned_check;
alter table public.training_runs add constraint training_runs_epochs_planned_check
  check (epochs_planned between 1 and 100);
alter table public.training_metrics drop constraint training_metrics_epoch_check;
alter table public.training_metrics add constraint training_metrics_epoch_check
  check (epoch between 1 and 100);

-- Cuatro indicadores adversariales propios. No son loss/accuracy supervisados.
alter table public.training_metrics drop constraint training_metrics_metric_name_check;
alter table public.training_metrics add constraint training_metrics_metric_name_check
  check (metric_name in ('loss','accuracy','mae',
    'generator_loss','discriminator_loss','d_real','d_fake'));

-- La función de F5 para publicar versiones requiere una fila en run_evaluations.
-- GAN usa ESA fila solo para diagnósticos descriptivos de un lote generado,
-- y nunca dice que se ha calculado FID/IS ni que se ha evaluado un test supervisado.
create function public.create_gan_training_run(
  p_project_id uuid,
  p_dataset_name text,
  p_schema_json jsonb,
  p_row_count integer,
  p_byte_size integer,
  p_file_hash text,
  p_preprocessing_json jsonb,
  p_architecture_config jsonb,
  p_hyperparameters_json jsonb,
  p_seed integer,
  p_app_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_name text := btrim(coalesce(p_dataset_name, ''));
  v_dim integer;
  v_pixels integer;
  v_latent integer;
  v_gen integer;
  v_disc integer;
  v_d2 integer;
  v_params integer;
  v_epochs integer;
  v_batch integer;
  v_lr numeric;
  v_arch uuid;
  v_dataset uuid;
  v_run uuid;
  v_arch_version integer;
  v_dataset_version integer;
begin
  if not private.can_train_in_project(p_project_id) then
    raise exception 'GAN: solo Ingeniero de proyecto activo' using errcode = '42501';
  end if;

  if char_length(v_name) not between 1 and 180
    or lower(right(v_name, 4)) <> '.csv'
    or p_row_count is null or p_row_count not between 100 and 2000
    or p_byte_size is null or p_byte_size not between 1 and 200000000
    or coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$'
    or p_seed is distinct from 0 -- GAN-2/3 usa ruido no determinista, NO inventar semilla 42.
    or char_length(coalesce(p_app_version, '')) not between 1 and 40
    or jsonb_typeof(p_schema_json) is distinct from 'object'
    or jsonb_typeof(p_preprocessing_json) is distinct from 'object'
    or jsonb_typeof(p_architecture_config) is distinct from 'object'
    or jsonb_typeof(p_hyperparameters_json) is distinct from 'object'
    or octet_length(p_schema_json::text) > 32768
    or octet_length(p_preprocessing_json::text) > 131072
    or octet_length(p_architecture_config::text) > 8192
    or octet_length(p_hyperparameters_json::text) > 8192 then
    raise exception 'GAN: metadatos generales fuera de límites' using errcode = '22023';
  end if;

  -- Whitelists cerradas: nada de arrays de píxeles, ejemplos ni nombres de sujetos.
  if (p_schema_json - array['kind','dimension','pixelCount','imageCount','originalScale','hadLabels','truncated']::text[]) <> '{}'::jsonb
    or (p_preprocessing_json - array['family','kind','dimension','channels','pixelRange','normalization','latentSize','unconditional','trainedImages','seedMode']::text[]) <> '{}'::jsonb
    or (p_architecture_config - array['family','kind','dimension','latentSize','generatorUnits','discriminatorUnits']::text[]) <> '{}'::jsonb
    or (p_hyperparameters_json - array['optimizer','epochs','batchSize','learningRate','noiseDistribution']::text[]) <> '{}'::jsonb
    or p_schema_json->>'kind' is distinct from 'gan_grayscale_csv_v1'
    or p_preprocessing_json->>'family' is distinct from 'gan'
    or p_preprocessing_json->>'kind' is distinct from 'gan_grayscale_csv_v1'
    or p_architecture_config->>'family' is distinct from 'gan'
    or p_architecture_config->>'kind' is distinct from 'dense_unconditional_v1'
    or p_hyperparameters_json->>'optimizer' is distinct from 'adam'
    or p_hyperparameters_json->>'noiseDistribution' is distinct from 'normal_unseeded'
    or p_preprocessing_json->>'pixelRange' is distinct from 'zero_to_255'
    or p_preprocessing_json->>'normalization' is distinct from 'tanh_minus1_plus1'
    or p_preprocessing_json->>'seedMode' is distinct from 'unseeded'
    or jsonb_typeof(p_schema_json->'hadLabels') is distinct from 'boolean'
    or jsonb_typeof(p_schema_json->'truncated') is distinct from 'boolean'
    or p_preprocessing_json->'unconditional' is distinct from 'true'::jsonb then
    raise exception 'GAN: contrato o lista blanca de JSON inválido' using errcode = '22023';
  end if;

  -- CASTS solo después de verificar que todos los campos son números reales.
  if jsonb_typeof(p_schema_json->'dimension') is distinct from 'number'
    or jsonb_typeof(p_schema_json->'pixelCount') is distinct from 'number'
    or jsonb_typeof(p_schema_json->'imageCount') is distinct from 'number'
    or jsonb_typeof(p_schema_json->'originalScale') is distinct from 'number'
    or jsonb_typeof(p_preprocessing_json->'dimension') is distinct from 'number'
    or jsonb_typeof(p_preprocessing_json->'channels') is distinct from 'number'
    or jsonb_typeof(p_preprocessing_json->'latentSize') is distinct from 'number'
    or jsonb_typeof(p_preprocessing_json->'trainedImages') is distinct from 'number'
    or jsonb_typeof(p_architecture_config->'dimension') is distinct from 'number'
    or jsonb_typeof(p_architecture_config->'latentSize') is distinct from 'number'
    or jsonb_typeof(p_architecture_config->'generatorUnits') is distinct from 'number'
    or jsonb_typeof(p_architecture_config->'discriminatorUnits') is distinct from 'number'
    or jsonb_typeof(p_hyperparameters_json->'epochs') is distinct from 'number'
    or jsonb_typeof(p_hyperparameters_json->'batchSize') is distinct from 'number'
    or jsonb_typeof(p_hyperparameters_json->'learningRate') is distinct from 'number' then
    raise exception 'GAN: dimensiones o hiperparámetros no numéricos' using errcode = '22023';
  end if;

  v_dim := (p_schema_json->>'dimension')::integer;
  v_pixels := (p_schema_json->>'pixelCount')::integer;
  v_latent := (p_architecture_config->>'latentSize')::integer;
  v_gen := (p_architecture_config->>'generatorUnits')::integer;
  v_disc := (p_architecture_config->>'discriminatorUnits')::integer;
  v_epochs := (p_hyperparameters_json->>'epochs')::integer;
  v_batch := (p_hyperparameters_json->>'batchSize')::integer;
  v_lr := (p_hyperparameters_json->>'learningRate')::numeric;

  if v_dim not in (8,28)
    or v_pixels <> v_dim * v_dim
    or (p_schema_json->>'dimension')::numeric <> v_dim
    or (p_schema_json->>'pixelCount')::numeric <> v_pixels
    or (p_schema_json->>'imageCount')::numeric <> p_row_count
    or (p_schema_json->>'originalScale')::integer not in (16,255)
    or (p_preprocessing_json->>'dimension')::numeric <> v_dim
    or (p_preprocessing_json->>'channels')::numeric <> 1
    or (p_preprocessing_json->>'latentSize')::numeric <> v_latent
    or (p_preprocessing_json->>'trainedImages')::numeric <> p_row_count
    or (p_architecture_config->>'dimension')::numeric <> v_dim
    or v_latent not in (16,32,64)
    or v_gen not in (32,64,128)
    or v_disc not in (32,64,128)
    or (p_architecture_config->>'latentSize')::numeric <> v_latent
    or (p_architecture_config->>'generatorUnits')::numeric <> v_gen
    or (p_architecture_config->>'discriminatorUnits')::numeric <> v_disc
    or v_epochs not in (2,5,10,20,30,50,100)
    or (p_hyperparameters_json->>'epochs')::numeric <> v_epochs
    or v_batch not in (16,32,64)
    or (p_hyperparameters_json->>'batchSize')::numeric <> v_batch
    or v_lr not in (0.0001, 0.0002) then
    raise exception 'GAN: configuración incompatible con GAN-3' using errcode = '22023';
  end if;

  -- Fórmula idéntica a describeGan() de GAN-1; límite 500 000 parámetros.
  v_d2 := greatest(16, v_disc / 2);
  v_params := (v_latent + 1) * v_gen + (v_gen + 1) * v_gen
            + (v_gen + 1) * v_pixels + (v_pixels + 1) * v_disc
            + (v_disc + 1) * v_d2 + (v_d2 + 1);
  if v_params > 500000 then
    raise exception 'GAN: red supera 500 000 parámetros' using errcode = '22023';
  end if;

  -- El bloqueo del proyecto serializa versiones de dataset/arquitectura concurrentes.
  perform 1 from public.projects where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'GAN: proyecto inactivo o inexistente' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into v_arch_version from public.architectures
    where project_id = p_project_id and name = 'GAN densa';
  select coalesce(max(version), 0) + 1 into v_dataset_version from public.datasets
    where project_id = p_project_id and name = v_name;
  insert into public.architectures(project_id,name,version,family,config_json,created_by)
    values(p_project_id,'GAN densa',v_arch_version,'gan',p_architecture_config,v_actor)
    returning id into v_arch;
  -- target_column es NOT NULL en la tabla heredada; este marcador NO es etiqueta supervisada.
  insert into public.datasets(project_id,name,version,schema_json,target_column,problem_type,
                              row_count,byte_size,file_hash,created_by)
    values(p_project_id,v_name,v_dataset_version,p_schema_json,
           '__unsupervised__','generative',p_row_count,p_byte_size,p_file_hash,v_actor)
    returning id into v_dataset;
  insert into public.training_runs(project_id,architecture_id,dataset_id,created_by,
                                   problem_type,hyperparameters_json,preprocessing_json,
                                   seed,dataset_hash,epochs_planned,app_version)
    values(p_project_id,v_arch,v_dataset,v_actor,'generative',p_hyperparameters_json,
           p_preprocessing_json,0,p_file_hash,v_epochs,p_app_version)
    returning id into v_run;
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values(v_actor,p_project_id,'training_started','training_run',v_run);
  return v_run;
end;
$$;

-- Igual que CNN/RNN, set_training_runtime() debe confirmar estado running antes de épocas.
create function public.record_gan_training_epoch(
  p_run_id uuid, p_epoch integer, p_generator_loss double precision,
  p_discriminator_loss double precision, p_real_score double precision,
  p_fake_score double precision
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_run public.training_runs%rowtype;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id)
    or v_run.problem_type <> 'generative'
    or not exists (select 1 from public.architectures a
      where a.id = v_run.architecture_id and a.project_id = v_run.project_id and a.family = 'gan') then
    raise exception 'GAN: época no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'running'
    or p_epoch is null or p_epoch <> v_run.completed_epochs + 1
    or p_epoch > v_run.epochs_planned
    or p_generator_loss is null or p_discriminator_loss is null
    or p_real_score is null or p_fake_score is null
    or p_generator_loss::text in ('NaN','Infinity','-Infinity')
    or p_discriminator_loss::text in ('NaN','Infinity','-Infinity')
    or p_real_score::text in ('NaN','Infinity','-Infinity')
    or p_fake_score::text in ('NaN','Infinity','-Infinity')
    or p_generator_loss not between 0 and 1000000000000
    or p_discriminator_loss not between 0 and 1000000000000
    or p_real_score not between 0 and 1 or p_fake_score not between 0 and 1 then
    raise exception 'GAN: orden, estado o métricas inválidos' using errcode = '22023';
  end if;
  insert into public.training_metrics(project_id,run_id,epoch,split,metric_name,metric_value)
    values(v_run.project_id,p_run_id,p_epoch,'train','generator_loss',p_generator_loss),
          (v_run.project_id,p_run_id,p_epoch,'train','discriminator_loss',p_discriminator_loss),
          (v_run.project_id,p_run_id,p_epoch,'train','d_real',p_real_score),
          (v_run.project_id,p_run_id,p_epoch,'train','d_fake',p_fake_score);
  update public.training_runs set completed_epochs = p_epoch, updated_at = now() where id = p_run_id;
end;
$$;

-- Después de completar la ejecución, se permite guardar UN resumen de un lote
-- generado (4/8/16). No es un test, FID, IS ni comprobación de realismo.
create function public.record_gan_generation_summary(
  p_run_id uuid, p_sample_count integer, p_metrics jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_run public.training_runs%rowtype;
  v_mean numeric;
  v_distance numeric;
  v_min integer;
  v_max integer;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id)
    or v_run.problem_type <> 'generative'
    or not exists (select 1 from public.architectures a
      where a.id = v_run.architecture_id and a.project_id = v_run.project_id and a.family = 'gan') then
    raise exception 'GAN: resumen no autorizado' using errcode = '42501';
  end if;
  if v_run.status <> 'completed'
    or v_run.completed_epochs <> v_run.epochs_planned
    or p_sample_count is null or p_sample_count not in (4,8,16)
    or jsonb_typeof(p_metrics) is distinct from 'object'
    or octet_length(p_metrics::text) > 8192
    or (p_metrics - array['family','kind','sampleCount','dimension','meanIntensity','meanPairwiseDistance','minimumPixel','maximumPixel']::text[]) <> '{}'::jsonb
    or p_metrics->>'family' is distinct from 'gan'
    or p_metrics->>'kind' is distinct from 'descriptive_only'
    or jsonb_typeof(p_metrics->'sampleCount') is distinct from 'number'
    or jsonb_typeof(p_metrics->'dimension') is distinct from 'number'
    or jsonb_typeof(p_metrics->'meanIntensity') is distinct from 'number'
    or jsonb_typeof(p_metrics->'meanPairwiseDistance') is distinct from 'number'
    or jsonb_typeof(p_metrics->'minimumPixel') is distinct from 'number'
    or jsonb_typeof(p_metrics->'maximumPixel') is distinct from 'number' then
    raise exception 'GAN: resumen descriptivo inválido' using errcode = '22023';
  end if;
  v_mean := (p_metrics->>'meanIntensity')::numeric;
  v_distance := (p_metrics->>'meanPairwiseDistance')::numeric;
  v_min := (p_metrics->>'minimumPixel')::integer;
  v_max := (p_metrics->>'maximumPixel')::integer;
  if (p_metrics->>'sampleCount')::numeric <> p_sample_count
    or (p_metrics->>'dimension')::numeric <> (v_run.preprocessing_json->>'dimension')::numeric
    or v_mean not between 0 and 255
    or v_distance not between 0 and 255
    or v_min not between 0 and 255 or v_max not between 0 and 255
    or (p_metrics->>'minimumPixel')::numeric <> v_min
    or (p_metrics->>'maximumPixel')::numeric <> v_max
    or v_min > v_max or v_mean < v_min or v_mean > v_max
    or exists (select 1 from public.run_evaluations e where e.run_id = p_run_id) then
    raise exception 'GAN: dimensiones, rangos o duplicado del resumen' using errcode = '22023';
  end if;
  -- Tabla heredada de F4: solo se guarda el resumen numérico, no muestras de imagen.
  insert into public.run_evaluations(run_id,project_id,problem_type,sample_count,metrics_json)
    values(p_run_id,v_run.project_id,'generative',p_sample_count,p_metrics);
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values((select auth.uid()),v_run.project_id,'training_evaluated','training_run',p_run_id);
end;
$$;

-- RPC accesibles únicamente al rol authenticated; permisos revisados dentro de cada función.
-- No se añaden grants de INSERT/UPDATE/DELETE sobre tablas y no se relajan políticas RLS.
revoke all on function public.create_gan_training_run(uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
revoke all on function public.record_gan_training_epoch(uuid,integer,double precision,double precision,double precision,double precision)
  from public, anon, authenticated;
revoke all on function public.record_gan_generation_summary(uuid,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_gan_training_run(uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  to authenticated;
grant execute on function public.record_gan_training_epoch(uuid,integer,double precision,double precision,double precision,double precision)
  to authenticated;
grant execute on function public.record_gan_generation_summary(uuid,integer,jsonb)
  to authenticated;

comment on function public.create_gan_training_run(uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  is 'GAN-4A: registra solo metadatos de imágenes y configuración sin píxeles. Semilla 0 = no fijada.';
comment on function public.record_gan_generation_summary(uuid,integer,jsonb)
  is 'GAN-4A: un resumen descriptivo agregado de 4/8/16 imágenes; no mide realismo ni guarda imágenes.';
commit;
