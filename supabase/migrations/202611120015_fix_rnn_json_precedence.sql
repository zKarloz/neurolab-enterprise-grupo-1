-- NeuroLab Enterprise / Fase 7 / RNN-4B / migracion 015.
-- Aplicar UNA sola vez DESPUES de 014. No volver a ejecutar 014.
-- Corrige precedencia de operadores JSONB: '-' se evalua antes que '->'.
-- Antes: p_architecture_config->'input' - array[...] puede intentar convertir 'input' a jsonb.
-- Ahora: (p_architecture_config->'input') - array[...] extrae el objeto primero.
-- Conserva la firma RPC, permisos, SECURITY DEFINER, search_path, validaciones y RLS.
-- No modifica tablas, politicas, grants, filas ni datos ya existentes.
begin;

create or replace function public.create_rnn_training_run(
  p_project_id uuid, p_dataset_name text, p_schema_json jsonb,
  p_row_count integer, p_byte_size integer, p_file_hash text,
  p_preprocessing_json jsonb, p_architecture_config jsonb,
  p_hyperparameters_json jsonb, p_seed integer, p_app_version text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
  v_dataset_name text := btrim(coalesce(p_dataset_name, ''));
  v_problem text;
  v_steps integer;
  v_features integer;
  v_classes integer;
  v_class_names jsonb;
  v_feature_names jsonb;
  v_kind text;
  v_layers integer;
  v_units integer;
  v_dense integer;
  v_input_width integer;
  v_params integer := 0;
  v_multiplier integer;
  v_split jsonb;
  v_normalization jsonb;
  v_name text;
  v_item jsonb;
  v_train integer;
  v_validation integer;
  v_test integer;
  v_arch uuid;
  v_dataset uuid;
  v_run uuid;
  v_arch_version integer;
  v_dataset_version integer;
begin
  if not private.can_train_in_project(p_project_id) then
    raise exception 'RNN: solo Ingeniero de proyecto activo' using errcode = '42501';
  end if;
  if char_length(v_dataset_name) not between 1 and 180 or lower(right(v_dataset_name, 4)) <> '.csv'
    or p_row_count is null or p_row_count not between 20 and 50000
    or p_byte_size is null or p_byte_size not between 1 and 10485760
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
    raise exception 'Metadatos RNN fuera de límites' using errcode = '22023';
  end if;

  -- Lista blanca para impedir ventanas/rows/examples/testTargets y futuras claves arbitrarias.
  if (p_schema_json - array['kind','seriesColumn','timeColumn','targetColumn','features','rowCount','seriesCount','windowCount']::text[]) <> '{}'::jsonb
    or (p_preprocessing_json - array['family','kind','seriesColumn','timeColumn','targetColumn','features','steps','problemType','classNames','normalization','split']::text[]) <> '{}'::jsonb
    or (p_architecture_config - array['family','kind','layers','units','denseUnits','input']::text[]) <> '{}'::jsonb
    or (p_hyperparameters_json - array['optimizer','epochs','batchSize','learningRate']::text[]) <> '{}'::jsonb
    or p_schema_json->>'kind' is distinct from 'rnn_temporal_csv_v1'
    or p_preprocessing_json->>'family' is distinct from 'rnn'
    or p_preprocessing_json->>'kind' is distinct from 'rnn_temporal_csv_v1'
    or p_architecture_config->>'family' is distinct from 'rnn'
    or p_hyperparameters_json->>'optimizer' is distinct from 'adam'
    or jsonb_typeof(p_schema_json->'features') is distinct from 'array'
    or jsonb_typeof(p_preprocessing_json->'features') is distinct from 'array'
    or jsonb_typeof(p_preprocessing_json->'classNames') is distinct from 'array'
    or jsonb_typeof(p_preprocessing_json->'normalization') is distinct from 'object'
    or jsonb_typeof(p_preprocessing_json->'split') is distinct from 'object'
    or jsonb_typeof(p_architecture_config->'input') is distinct from 'object' then
    raise exception 'Documentos de contrato RNN inválidos' using errcode = '22023';
  end if;

  v_problem := p_preprocessing_json->>'problemType';
  v_steps := (p_preprocessing_json->>'steps')::integer;
  v_feature_names := p_preprocessing_json->'features';
  v_features := jsonb_array_length(v_feature_names);
  v_class_names := p_preprocessing_json->'classNames';
  v_classes := jsonb_array_length(v_class_names);
  v_split := p_preprocessing_json->'split';
  v_normalization := p_preprocessing_json->'normalization';
  v_train := (v_split->>'trainCount')::integer;
  v_validation := (v_split->>'validationCount')::integer;
  v_test := (v_split->>'testCount')::integer;
  v_kind := p_architecture_config->>'kind';
  v_layers := (p_architecture_config->>'layers')::integer;
  v_units := (p_architecture_config->>'units')::integer;
  v_dense := (p_architecture_config->>'denseUnits')::integer;

  if v_problem not in ('regression','binary','multiclass') or v_problem is null
    or v_steps not in (4,8,16,32) or v_steps is null
    or v_features not between 1 and 16
    or v_kind not in ('simpleRNN','lstm') or v_kind is null
    or v_layers not in (1,2) or v_layers is null
    or v_units not in (8,16,32,64) or v_units is null
    or v_dense not in (0,16,32) or v_dense is null
    or (v_problem = 'regression' and v_classes <> 0)
    or (v_problem = 'binary' and v_classes <> 2)
    or (v_problem = 'multiclass' and v_classes not between 3 and 10)
    or p_schema_json->'features' is distinct from v_feature_names
    or (p_schema_json->>'rowCount')::integer is distinct from p_row_count
    or (p_schema_json->>'windowCount')::integer is null
    or (p_schema_json->>'windowCount')::integer not between 1 and 2000
    or (p_schema_json->>'seriesCount')::integer is null
    or (p_schema_json->>'seriesCount')::integer not between 1 and 500
    or v_split->>'strategy' is distinct from 'per_series_chronological_purged_v1'
    or (v_split - array['strategy','trainCount','validationCount','testCount']::text[]) <> '{}'::jsonb
    or v_train is null or v_validation is null or v_test is null
    or v_train < 4 or v_validation < 1 or v_test < 1
    or v_train + v_validation + v_test > (p_schema_json->>'windowCount')::integer
    or ((p_architecture_config->'input') - array['steps','features','classes','problemType']::text[]) <> '{}'::jsonb
    or (p_architecture_config->'input'->>'steps')::integer is distinct from v_steps
    or (p_architecture_config->'input'->>'features')::integer is distinct from v_features
    or (p_architecture_config->'input'->>'problemType') is distinct from v_problem
    or (p_architecture_config->'input'->>'classes')::integer is distinct from (case when v_problem = 'regression' then 1 else v_classes end)
    or (p_hyperparameters_json->>'epochs')::integer is null
    or (p_hyperparameters_json->>'epochs')::integer not in (2,5,10)
    or (p_hyperparameters_json->>'batchSize')::integer is null
    or (p_hyperparameters_json->>'batchSize')::integer not in (8,16,32)
    or (p_hyperparameters_json->>'learningRate')::numeric is null
    or (p_hyperparameters_json->>'learningRate')::numeric not in (0.001,0.0005) then
    raise exception 'Dimensiones, clases, particiones o hiperparámetros RNN inválidos' using errcode = '22023';
  end if;

  if (v_normalization - array['means','scales','targetMean','targetScale']::text[]) <> '{}'::jsonb
    or jsonb_typeof(v_normalization->'means') is distinct from 'array'
    or jsonb_typeof(v_normalization->'scales') is distinct from 'array' then
    raise exception 'Normalización RNN incompatible' using errcode = '22023';
  end if;
  if jsonb_array_length(v_normalization->'means') <> v_features
    or jsonb_array_length(v_normalization->'scales') <> v_features
    or jsonb_typeof(v_normalization->'targetMean') is distinct from 'number'
    or jsonb_typeof(v_normalization->'targetScale') is distinct from 'number'
    or abs((v_normalization->>'targetMean')::numeric) > 1e12
    or (v_normalization->>'targetScale')::numeric not between 0.000000001 and 1e12 then
    raise exception 'Estadísticos de entrenamiento RNN inválidos' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(v_normalization->'means') loop
    if jsonb_typeof(v_item) <> 'number' or abs((v_item #>> '{}')::numeric) > 1e12 then
      raise exception 'Media RNN inválida' using errcode = '22023';
    end if;
  end loop;
  for v_item in select value from jsonb_array_elements(v_normalization->'scales') loop
    if jsonb_typeof(v_item) <> 'number' or (v_item #>> '{}')::numeric not between 0.000000001 and 1e12 then
      raise exception 'Escala RNN inválida' using errcode = '22023';
    end if;
  end loop;

  -- Las columnas se registran solo por nombre. Nunca contienen valores de filas.
  if p_schema_json->>'seriesColumn' is distinct from p_preprocessing_json->>'seriesColumn'
    or p_schema_json->>'timeColumn' is distinct from p_preprocessing_json->>'timeColumn'
    or p_schema_json->>'targetColumn' is distinct from p_preprocessing_json->>'targetColumn'
    or p_schema_json->>'seriesColumn' = p_schema_json->>'timeColumn'
    or p_schema_json->>'seriesColumn' = p_schema_json->>'targetColumn'
    or p_schema_json->>'timeColumn' = p_schema_json->>'targetColumn' then
    raise exception 'Columnas temporales inconsistentes' using errcode = '22023';
  end if;
  foreach v_name in array array['seriesColumn','timeColumn','targetColumn'] loop
    if char_length(coalesce(p_schema_json->>v_name,'')) not between 1 and 200 then
      raise exception 'Nombre de columna RNN inválido' using errcode = '22023';
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements_text(v_feature_names) f(value)
      where length(f.value) not between 1 and 200 or f.value in
        (p_schema_json->>'seriesColumn',p_schema_json->>'timeColumn',p_schema_json->>'targetColumn'))
    or (select count(distinct value) from jsonb_array_elements_text(v_feature_names)) <> v_features then
    raise exception 'Variables de entrada RNN inválidas o repetidas' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_class_names) c(value)
       where length(c.value) not between 1 and 64)
    or (select count(distinct value) from jsonb_array_elements_text(v_class_names)) <> v_classes then
    raise exception 'Clases RNN inválidas o repetidas' using errcode = '22023';
  end if;

  -- Igualdad con describeRnn(): SimpleRNN=1 puerta; LSTM=4 puertas.
  v_multiplier := case when v_kind = 'lstm' then 4 else 1 end;
  v_params := v_multiplier * (v_features + v_units + 1) * v_units;
  if v_layers = 2 then v_params := v_params + v_multiplier * (v_units + v_units + 1) * v_units; end if;
  v_input_width := v_units;
  if v_dense > 0 then
    v_params := v_params + (v_input_width + 1) * v_dense;
    v_input_width := v_dense;
  end if;
  v_params := v_params + (v_input_width + 1) * (case when v_problem = 'multiclass' then v_classes else 1 end);
  if v_params > 100000 then raise exception 'Arquitectura RNN supera 100 000 parámetros' using errcode = '22023'; end if;

  -- Bloqueo del proyecto para asignar versiones únicas, como en Feedforward/CNN.
  perform 1 from public.projects where id = p_project_id and status = 'active' for update;
  if not found then raise exception 'El proyecto no está activo' using errcode = '42501'; end if;
  select coalesce(max(version),0)+1 into v_arch_version from public.architectures
    where project_id = p_project_id and name = 'RNN temporal';
  select coalesce(max(version),0)+1 into v_dataset_version from public.datasets
    where project_id = p_project_id and name = v_dataset_name;
  insert into public.architectures(project_id,name,version,family,config_json,created_by)
    values(p_project_id,'RNN temporal',v_arch_version,'rnn',p_architecture_config,v_actor)
    returning id into v_arch;
  insert into public.datasets(project_id,name,version,schema_json,target_column,problem_type,
                              row_count,byte_size,file_hash,created_by)
    values(p_project_id,v_dataset_name,v_dataset_version,p_schema_json,
           p_schema_json->>'targetColumn',v_problem,p_row_count,p_byte_size,p_file_hash,v_actor)
    returning id into v_dataset;
  insert into public.training_runs(project_id,architecture_id,dataset_id,created_by,
                                   problem_type,hyperparameters_json,preprocessing_json,
                                   seed,dataset_hash,epochs_planned,app_version)
    values(p_project_id,v_arch,v_dataset,v_actor,v_problem,p_hyperparameters_json,
           p_preprocessing_json,p_seed,p_file_hash,(p_hyperparameters_json->>'epochs')::integer,p_app_version)
    returning id into v_run;
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values(v_actor,p_project_id,'training_started','training_run',v_run);
  return v_run;
end;
$$;

commit;
