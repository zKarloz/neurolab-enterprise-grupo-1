-- NeuroLab Enterprise / Fase 7, CNN-4A: soporte persistente CNN multiclase.
-- Aplicar UNA sola vez después de 202611090011_private_user_avatars.sql.
-- NO reemplaza RPC Feedforward, no modifica RLS ni concede escrituras directas.
-- El CSV y las imágenes permanecen en el navegador; la BD recibe metadatos agregados.
begin;

-- La familia anterior sigue siendo la predeterminada y conserva sus datos.
-- 200 MB es SOLO la capacidad de metadatos CNN; la RPC Feedforward mantiene 10 MiB.
alter table public.architectures drop constraint architectures_family_check;
alter table public.architectures add constraint architectures_family_check
  check (family in ('feedforward', 'cnn'));

alter table public.datasets drop constraint datasets_problem_type_check;
alter table public.datasets add constraint datasets_problem_type_check
  check (problem_type in ('binary', 'regression', 'multiclass'));
alter table public.datasets drop constraint datasets_byte_size_check;
alter table public.datasets add constraint datasets_byte_size_check
  check (byte_size between 1 and 200000000);

alter table public.training_runs drop constraint training_runs_problem_type_check;
alter table public.training_runs add constraint training_runs_problem_type_check
  check (problem_type in ('binary', 'regression', 'multiclass'));

alter table public.run_evaluations drop constraint run_evaluations_problem_type_check;
alter table public.run_evaluations add constraint run_evaluations_problem_type_check
  check (problem_type in ('binary', 'regression', 'multiclass'));
alter table public.run_evaluations drop constraint run_evaluations_metrics_json_check;
alter table public.run_evaluations add constraint run_evaluations_metrics_json_check
  check (jsonb_typeof(metrics_json) = 'object' and octet_length(metrics_json::text) <= 8192);

-- Contrato CNN independiente: nunca hace que create_training_run admita arquitecturas
-- arbitrarias. El esquema describe la muestra leída y p_byte_size el archivo fuente.
-- p_file_hash debe ser SHA-256 DEL ARCHIVO COMPLETO, no de los 2 000 ejemplos.
create function public.create_cnn_training_run(
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
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_dataset_name text := btrim(coalesce(p_dataset_name, ''));
  v_class_names jsonb;
  v_class_count integer;
  v_width integer;
  v_height integer;
  v_channels integer;
  v_input jsonb;
  v_blocks jsonb;
  v_block jsonb;
  v_filters integer;
  v_kernel integer;
  v_pool boolean;
  v_parameters bigint := 0;
  v_dense integer;
  v_samples integer;
  v_train integer;
  v_validation integer;
  v_test integer;
  v_arch_id uuid;
  v_dataset_id uuid;
  v_run_id uuid;
  v_arch_version integer;
  v_dataset_version integer;
begin
  if not private.can_train_in_project(p_project_id) then
    raise exception 'Se requiere Ingeniero activo en el mismo proyecto' using errcode = '42501';
  end if;
  if char_length(v_dataset_name) not between 1 and 180
    or lower(right(v_dataset_name, 4)) <> '.csv'
    or p_row_count is null or p_row_count not between 100 and 2000
    or p_byte_size is null or p_byte_size not between 1 and 200000000
    or coalesce(p_file_hash, '') !~ '^[0-9a-f]{64}$'
    or p_seed is distinct from 42
    or char_length(coalesce(p_app_version, '')) not between 1 and 40
    or jsonb_typeof(p_schema_json) is distinct from 'object'
    or jsonb_typeof(p_preprocessing_json) is distinct from 'object'
    or jsonb_typeof(p_architecture_config) is distinct from 'object'
    or jsonb_typeof(p_hyperparameters_json) is distinct from 'object'
    or octet_length(p_schema_json::text) > 32768
    or octet_length(p_preprocessing_json::text) > 131072
    or octet_length(p_architecture_config::text) > 8192
    or octet_length(p_hyperparameters_json::text) > 8192 then
    raise exception 'Metadatos CNN fuera de los límites admitidos' using errcode = '22023';
  end if;

  -- Rechazar claves extra en documentos que solo pueden contener agregados.
  -- Se impide almacenar accidentalmente arrays de pixels, labels, test o ejemplos.
  if p_schema_json - array['kind','width','height','channels','classNames',
                          'sampleCount','truncated','originalScale']::text[] <> '{}'::jsonb
    or p_preprocessing_json - array['family','kind','width','height','channels',
                          'classNames','normalization','seed','sampleCount','split']::text[] <> '{}'::jsonb
    or p_architecture_config - array['family','blocks','denseUnits','input',
                          'outputActivation']::text[] <> '{}'::jsonb
    or p_hyperparameters_json - array['optimizer','epochs','batchSize',
                          'learningRate','samples','seed']::text[] <> '{}'::jsonb
    or (p_schema_json->>'kind') is distinct from 'cnn_image_csv_v1'
    or (p_preprocessing_json->>'family') is distinct from 'cnn'
    or (p_preprocessing_json->>'kind') is distinct from 'cnn_image_csv_v1'
    or (p_preprocessing_json->>'normalization') is distinct from 'divide_by_255'
    or (p_architecture_config->>'family') is distinct from 'cnn'
    or (p_architecture_config->>'outputActivation') is distinct from 'softmax'
    or (p_hyperparameters_json->>'optimizer') is distinct from 'adam' then
    raise exception 'Contrato de documentos CNN inválido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_schema_json->'classNames') is distinct from 'array'
    or jsonb_typeof(p_schema_json->'truncated') is distinct from 'boolean'
    or jsonb_typeof(p_preprocessing_json->'classNames') is distinct from 'array'
    or jsonb_typeof(p_preprocessing_json->'split') is distinct from 'object'
    or jsonb_typeof(p_architecture_config->'input') is distinct from 'object'
    or jsonb_typeof(p_architecture_config->'blocks') is distinct from 'array' then
    raise exception 'Faltan listas o dimensiones CNN' using errcode = '22023';
  end if;
  v_class_names := p_schema_json->'classNames';
  v_class_count := jsonb_array_length(v_class_names);
  if v_class_count not between 2 and 10
    or v_class_names <> p_preprocessing_json->'classNames'
    or exists (select 1 from jsonb_array_elements(v_class_names) as x(value)
      where jsonb_typeof(x.value) <> 'string'
        or char_length(x.value #>> '{}') not between 1 and 64)
    or (select count(distinct x.value) from jsonb_array_elements(v_class_names) as x(value)) <> v_class_count then
    raise exception 'Clases CNN inválidas o duplicadas' using errcode = '22023';
  end if;

  v_width := (p_schema_json->>'width')::integer;
  v_height := (p_schema_json->>'height')::integer;
  v_channels := (p_schema_json->>'channels')::integer;
  v_input := p_architecture_config->'input';
  v_samples := (p_hyperparameters_json->>'samples')::integer;
  v_train := (p_preprocessing_json->'split'->>'trainCount')::integer;
  v_validation := (p_preprocessing_json->'split'->>'validationCount')::integer;
  v_test := (p_preprocessing_json->'split'->>'testCount')::integer;
  if v_width is null or v_height is null or v_channels is null
    or v_width not in (8,28) or v_height <> v_width or v_channels <> 1
    or (p_schema_json->>'sampleCount')::integer is distinct from p_row_count
    or (p_schema_json->>'originalScale')::integer is null
    or (p_schema_json->>'originalScale')::integer not in (16,255)
    or (p_preprocessing_json->>'width')::integer is distinct from v_width
    or (p_preprocessing_json->>'height')::integer is distinct from v_height
    or (p_preprocessing_json->>'channels')::integer is distinct from 1
    or (p_preprocessing_json->>'sampleCount')::integer is distinct from v_samples
    or (p_preprocessing_json->>'seed')::integer is distinct from p_seed
    or (p_preprocessing_json->'split'->>'strategy') is distinct from 'stratified_70_15_15_v1'
    or p_preprocessing_json->'split' - array['strategy','trainCount','validationCount','testCount']::text[] <> '{}'::jsonb
    or v_samples is null or v_samples not between 100 and 2000 or v_samples > p_row_count
    or v_train is null or v_validation is null or v_test is null
    or v_train < 1 or v_validation < 1 or v_test < 1
    or v_train + v_validation + v_test <> v_samples
    or (v_input->>'width')::integer is distinct from v_width
    or (v_input->>'height')::integer is distinct from v_height
    or (v_input->>'channels')::integer is distinct from 1
    or (v_input->>'classes')::integer is distinct from v_class_count
    or v_input - array['width','height','channels','classes']::text[] <> '{}'::jsonb
    or (p_hyperparameters_json->>'seed')::integer is distinct from p_seed
    or (p_hyperparameters_json->>'epochs')::integer is null
    or (p_hyperparameters_json->>'epochs')::integer not in (2,5,10)
    or (p_hyperparameters_json->>'batchSize')::integer is null
    or (p_hyperparameters_json->>'batchSize')::integer not in (16,32,64)
    or (p_hyperparameters_json->>'learningRate')::numeric is null
    or (p_hyperparameters_json->>'learningRate')::numeric not in (0.001,0.0005) then
    raise exception 'Dimensiones, partición o hiperparámetros CNN inválidos' using errcode = '22023';
  end if;

  -- Validación de shapes y parámetros congruente con describeCnn de TensorFlow.js.
  v_blocks := p_architecture_config->'blocks';
  v_dense := (p_architecture_config->>'denseUnits')::integer;
  if jsonb_array_length(v_blocks) not between 1 and 3
    or v_dense is null or v_dense not in (32,64,128) then
    raise exception 'Cantidad de bloques CNN o Dense inválida' using errcode = '22023';
  end if;
  for v_block in select x.value from jsonb_array_elements(v_blocks) as x(value) loop
    if jsonb_typeof(v_block) is distinct from 'object'
      or v_block - array['id','filters','kernel','padding','pool']::text[] <> '{}'::jsonb
      or char_length(coalesce(v_block->>'id','')) not between 1 and 40
      or jsonb_typeof(v_block->'pool') is distinct from 'boolean' then
      raise exception 'Bloque CNN inválido' using errcode = '22023';
    end if;
    v_filters := (v_block->>'filters')::integer;
    v_kernel := (v_block->>'kernel')::integer;
    v_pool := (v_block->>'pool')::boolean;
    if v_filters is null or v_kernel is null
      or v_filters not in (8,16,32,64) or v_kernel not in (3,5)
      or (v_block->>'padding') is null
      or (v_block->>'padding') not in ('same','valid') then
      raise exception 'Filtros, kernel o padding inválidos' using errcode = '22023';
    end if;
    if v_block->>'padding' = 'valid' then
      v_width := v_width - v_kernel + 1;
      v_height := v_height - v_kernel + 1;
    end if;
    if v_width < 1 or v_height < 1 then
      raise exception 'Conv2D no cabe en las dimensiones de entrada' using errcode = '22023';
    end if;
    v_parameters := v_parameters + (v_kernel * v_kernel * v_channels + 1) * v_filters;
    v_channels := v_filters;
    if v_pool then
      v_width := v_width / 2;
      v_height := v_height / 2;
      if v_width < 1 or v_height < 1 then
        raise exception 'MaxPool 2x2 no cabe en el mapa convolucional' using errcode = '22023';
      end if;
    end if;
  end loop;
  v_parameters := v_parameters + (v_width * v_height * v_channels + 1) * v_dense
                              + (v_dense + 1) * v_class_count;
  if v_parameters > 2000000 then
    raise exception 'CNN supera el límite de 2 millones de parámetros' using errcode = '22023';
  end if;

  -- Mismo bloqueo de F3: número de versión bajo bloqueo de la fila del proyecto.
  perform 1 from public.projects where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'Proyecto archivado o no encontrado' using errcode = '42501';
  end if;
  select coalesce(max(version),0) + 1 into v_arch_version
    from public.architectures where project_id = p_project_id and name = 'CNN Conv2D';
  select coalesce(max(version),0) + 1 into v_dataset_version
    from public.datasets where project_id = p_project_id and name = v_dataset_name;
  insert into public.architectures(project_id,name,version,family,config_json,created_by)
    values (p_project_id,'CNN Conv2D',v_arch_version,'cnn',p_architecture_config,v_actor)
    returning id into v_arch_id;
  insert into public.datasets(project_id,name,version,schema_json,target_column,
                              problem_type,row_count,byte_size,file_hash,created_by)
    values (p_project_id,v_dataset_name,v_dataset_version,p_schema_json,'label',
            'multiclass',p_row_count,p_byte_size,p_file_hash,v_actor)
    returning id into v_dataset_id;
  insert into public.training_runs(project_id,architecture_id,dataset_id,created_by,
                                   problem_type,hyperparameters_json,preprocessing_json,
                                   seed,dataset_hash,epochs_planned,app_version)
    values (p_project_id,v_arch_id,v_dataset_id,v_actor,'multiclass',
            p_hyperparameters_json,p_preprocessing_json,p_seed,p_file_hash,
            (p_hyperparameters_json->>'epochs')::integer,p_app_version)
    returning id into v_run_id;
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values(v_actor,p_project_id,'training_started','training_run',v_run_id);
  return v_run_id;
end;
$$;

-- Mantiene record_training_epoch original intacta y usa un contrato dedicado a CNN.
create function public.record_cnn_training_epoch(
  p_run_id uuid, p_epoch integer, p_loss double precision,
  p_validation_loss double precision, p_accuracy double precision,
  p_validation_accuracy double precision
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_run public.training_runs%rowtype;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.problem_type <> 'multiclass'
    or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Ejecución CNN no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'running' or p_epoch is null
    or p_epoch <> v_run.completed_epochs + 1 or p_epoch > v_run.epochs_planned
    or p_loss is null or p_validation_loss is null
    or p_accuracy is null or p_validation_accuracy is null
    or p_loss::text in ('NaN','Infinity','-Infinity')
    or p_validation_loss::text in ('NaN','Infinity','-Infinity')
    or p_accuracy::text in ('NaN','Infinity','-Infinity')
    or p_validation_accuracy::text in ('NaN','Infinity','-Infinity')
    or p_loss < 0 or p_validation_loss < 0
    or p_accuracy not between 0 and 1 or p_validation_accuracy not between 0 and 1 then
    raise exception 'Métricas CNN, época o estado inválido' using errcode = '22023';
  end if;
  insert into public.training_metrics(project_id,run_id,epoch,split,metric_name,metric_value)
    values (v_run.project_id,p_run_id,p_epoch,'train','loss',p_loss),
           (v_run.project_id,p_run_id,p_epoch,'validation','loss',p_validation_loss),
           (v_run.project_id,p_run_id,p_epoch,'train','accuracy',p_accuracy),
           (v_run.project_id,p_run_id,p_epoch,'validation','accuracy',p_validation_accuracy);
  update public.training_runs set completed_epochs = p_epoch, updated_at = now()
    where id = p_run_id;
end;
$$;

-- Evaluación agregada, sin examples, pixeles, etiquetas por fila ni probabilidades.
-- El total de la matriz debe coincidir con testCount y el tamaño entregado.
create function public.record_cnn_test_evaluation(
  p_run_id uuid, p_sample_count integer, p_metrics jsonb
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.training_runs%rowtype;
  v_classes jsonb;
  v_class_count integer;
  v_matrix jsonb;
  v_row jsonb;
  v_cell jsonb;
  v_total bigint := 0;
  v_correct bigint := 0;
  v_row_index integer := 0;
  v_col_index integer;
  v_count numeric;
  v_name text;
  v_metric numeric;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.problem_type <> 'multiclass'
    or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Evaluación CNN no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'running' or v_run.completed_epochs <> v_run.epochs_planned
    or p_sample_count not between 1 and 2000
    or p_sample_count is distinct from (v_run.preprocessing_json->'split'->>'testCount')::integer
    or jsonb_typeof(p_metrics) is distinct from 'object'
    or octet_length(p_metrics::text) > 8192
    or p_metrics - array['problemType','classNames','sampleCount','loss','accuracy',
      'macroPrecision','macroRecall','macroF1','matrix']::text[] <> '{}'::jsonb
    or (p_metrics->>'problemType') is distinct from 'multiclass'
    or (p_metrics->>'sampleCount')::integer is distinct from p_sample_count then
    raise exception 'Estado o estructura de evaluación CNN inválidos' using errcode = '22023';
  end if;
  v_classes := v_run.preprocessing_json->'classNames';
  v_class_count := jsonb_array_length(v_classes);
  v_matrix := p_metrics->'matrix';
  if p_metrics->'classNames' is distinct from v_classes
    or jsonb_typeof(v_matrix) is distinct from 'array' then
    raise exception 'Matriz de confusión CNN incompatible con las clases' using errcode = '22023';
  end if;
  if jsonb_array_length(v_matrix) <> v_class_count then
    raise exception 'Matriz de confusión CNN debe tener una fila por clase' using errcode = '22023';
  end if;
  foreach v_name in array array['loss','accuracy','macroPrecision','macroRecall','macroF1'] loop
    if jsonb_typeof(p_metrics->v_name) is distinct from 'number' then
      raise exception 'Falta métrica CNN: %',v_name using errcode = '22023';
    end if;
    v_metric := (p_metrics->>v_name)::numeric;
    if v_metric < 0 or v_metric > 1000000000000
      or (v_name <> 'loss' and v_metric > 1) then
      raise exception 'Métrica CNN fuera de rango' using errcode = '22023';
    end if;
  end loop;
  for v_row in select x.value from jsonb_array_elements(v_matrix) as x(value) loop
    if jsonb_typeof(v_row) is distinct from 'array' or jsonb_array_length(v_row) <> v_class_count then
      raise exception 'Filas de confusión CNN mal dimensionadas' using errcode = '22023';
    end if;
    v_col_index := 0;
    for v_cell in select x.value from jsonb_array_elements(v_row) as x(value) loop
      if jsonb_typeof(v_cell) is distinct from 'number' then
        raise exception 'Confusión CNN contiene contadores no numéricos' using errcode = '22023';
      end if;
      v_count := (v_cell #>> '{}')::numeric;
      if v_count < 0 or v_count > p_sample_count or v_count <> trunc(v_count) then
        raise exception 'Confusión CNN contiene contadores inválidos' using errcode = '22023';
      end if;
      v_total := v_total + v_count::bigint;
      if v_row_index = v_col_index then v_correct := v_correct + v_count::bigint; end if;
      v_col_index := v_col_index + 1;
    end loop;
    v_row_index := v_row_index + 1;
  end loop;
  if v_total <> p_sample_count
    or abs((p_metrics->>'accuracy')::numeric - v_correct::numeric / p_sample_count) > 0.000001 then
    raise exception 'Confusión CNN no coincide con el tamaño o la exactitud de test' using errcode = '22023';
  end if;
  insert into public.run_evaluations(run_id,project_id,problem_type,sample_count,metrics_json)
    values(p_run_id,v_run.project_id,'multiclass',p_sample_count,p_metrics);
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values((select auth.uid()),v_run.project_id,'training_evaluated','training_run',p_run_id);
end;
$$;

-- Solamente authenticated puede ejecutar las nuevas RPC. Sin escrituras de tablas.
revoke all on function public.create_cnn_training_run(
  uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
revoke all on function public.record_cnn_training_epoch(
  uuid,integer,double precision,double precision,double precision,double precision)
  from public, anon, authenticated;
revoke all on function public.record_cnn_test_evaluation(uuid,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_cnn_training_run(
  uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text) to authenticated;
grant execute on function public.record_cnn_training_epoch(
  uuid,integer,double precision,double precision,double precision,double precision) to authenticated;
grant execute on function public.record_cnn_test_evaluation(uuid,integer,jsonb) to authenticated;

comment on function public.create_cnn_training_run(uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  is 'CNN-4A: registra metadata multiclase; sin CSV/pixeles. El hash proviene del cliente.';
comment on function public.record_cnn_test_evaluation(uuid,integer,jsonb)
  is 'CNN-4A: matriz y métricas agregadas únicamente; no almacena muestras o inferencias.';
commit;
