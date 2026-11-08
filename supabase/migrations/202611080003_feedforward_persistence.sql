-- NeuroLab Enterprise / Fase 3, incremento de persistencia.
-- Ejecutar una sola vez, DESPUÉS de la migración 202611070002.
-- Las filas originales de CSV y los pesos NO se almacenan aquí.
-- Las escrituras se realizan exclusivamente mediante RPC protegidas y atómicas.
begin;

create table public.architectures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 120),
  version integer not null check (version >= 1),
  family text not null default 'feedforward' check (family = 'feedforward'),
  config_json jsonb not null check (jsonb_typeof(config_json) = 'object' and octet_length(config_json::text) <= 8192),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, name, version)
);

create table public.datasets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 180),
  version integer not null check (version >= 1),
  schema_json jsonb not null check (jsonb_typeof(schema_json) = 'object' and octet_length(schema_json::text) <= 32768),
  target_column text not null check (char_length(target_column) between 1 and 200),
  problem_type text not null check (problem_type in ('binary', 'regression')),
  row_count integer not null check (row_count between 3 and 50000),
  byte_size integer not null check (byte_size between 1 and 10485760),
  file_hash text not null check (file_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, name, version)
);

create table public.training_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  architecture_id uuid not null,
  dataset_id uuid not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  problem_type text not null check (problem_type in ('binary', 'regression')),
  hyperparameters_json jsonb not null check (jsonb_typeof(hyperparameters_json) = 'object' and octet_length(hyperparameters_json::text) <= 8192),
  preprocessing_json jsonb not null check (jsonb_typeof(preprocessing_json) = 'object' and octet_length(preprocessing_json::text) <= 131072),
  seed integer not null check (seed between 0 and 2147483647),
  dataset_hash text not null check (dataset_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'created' check (status in ('created', 'preparing', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  epochs_planned integer not null check (epochs_planned between 1 and 50),
  completed_epochs integer not null default 0 check (completed_epochs >= 0 and completed_epochs <= epochs_planned),
  backend text check (backend in ('webgl', 'cpu', 'wasm')),
  execution_context text check (execution_context in ('worker', 'main')),
  tfjs_version text check (char_length(tfjs_version) between 1 and 40),
  app_version text not null check (char_length(app_version) between 1 and 40),
  error_summary text check (char_length(error_summary) <= 500),
  duration_ms integer check (duration_ms >= 0),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, id),
  constraint fk_run_architecture_project foreign key (project_id, architecture_id)
    references public.architectures(project_id, id) on delete restrict,
  constraint fk_run_dataset_project foreign key (project_id, dataset_id)
    references public.datasets(project_id, id) on delete restrict
);

create table public.training_metrics (
  project_id uuid not null,
  run_id uuid not null,
  epoch integer not null check (epoch >= 1 and epoch <= 50),
  split text not null check (split in ('train','validation')),
  metric_name text not null check (metric_name in ('loss','accuracy','mae')),
  metric_value double precision not null check (metric_value::text not in ('NaN','Infinity','-Infinity')),
  recorded_at timestamptz not null default now(),
  primary key (run_id, epoch, split, metric_name),
  constraint fk_metric_run_project foreign key (project_id, run_id)
    references public.training_runs(project_id, id) on delete restrict
);

create index idx_architectures_project on public.architectures(project_id, created_at desc);
create index idx_datasets_project on public.datasets(project_id, created_at desc);
create index idx_training_runs_project on public.training_runs(project_id, created_at desc);
create index idx_training_runs_owner on public.training_runs(created_by, created_at desc);
create index idx_training_metrics_project on public.training_metrics(project_id, run_id);

alter table public.architectures enable row level security;
alter table public.datasets enable row level security;
alter table public.training_runs enable row level security;
alter table public.training_metrics enable row level security;

-- La Data API únicamente expone lectura a miembros del proyecto. Sin INSERT/UPDATE/DELETE directos.
revoke all on public.architectures, public.datasets, public.training_runs, public.training_metrics
  from public, anon, authenticated;
grant select on public.architectures, public.datasets, public.training_runs, public.training_metrics to authenticated;

create policy "Solo integrantes pueden leer arquitecturas privadas"
  on public.architectures for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));
create policy "Solo integrantes pueden leer metadatos de dataset"
  on public.datasets for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));
create policy "Solo integrantes pueden leer ejecuciones"
  on public.training_runs for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));
create policy "Solo integrantes pueden leer metricas"
  on public.training_metrics for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));

-- Ampliar auditoría administrativa existente con eventos mínimos de F3.
alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted'
));
alter table public.audit_events drop constraint audit_events_resource_type_check;
alter table public.audit_events add constraint audit_events_resource_type_check
  check (resource_type in ('project','project_member','training_run'));

-- Una operación de entrenamiento debe verificar membresía, estado del usuario y proyecto activo.
create function private.can_train_in_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.has_project_role(p_project_id, array['engineer']::text[])
    and exists (select 1 from public.projects p where p.id = p_project_id and p.status = 'active');
$$;
revoke all on function private.can_train_in_project(uuid) from public, anon, authenticated;
grant execute on function private.can_train_in_project(uuid) to authenticated;

-- El registro inicial de arquitectura + dataset + ejecución + auditoría es una sola transacción.
-- Es una instantánea por ejecución; versiones de mismo nombre se numeran bajo bloqueo del proyecto.
create function public.create_training_run(
  p_project_id uuid, p_dataset_name text, p_schema_json jsonb,
  p_target_column text, p_problem_type text, p_row_count integer,
  p_byte_size integer, p_file_hash text, p_preprocessing_json jsonb,
  p_architecture_config jsonb, p_hyperparameters_json jsonb,
  p_seed integer, p_app_version text
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_arch_id uuid;
  v_dataset_id uuid;
  v_run_id uuid;
  v_arch_version integer;
  v_dataset_version integer;
  v_dataset_name text := btrim(coalesce(p_dataset_name, ''));
begin
  if not private.can_train_in_project(p_project_id) then
    raise exception 'Se requiere el rol Ingeniero en un proyecto activo' using errcode = '42501';
  end if;
  if char_length(v_dataset_name) not between 1 and 180
    or p_row_count not between 3 and 50000
    or p_byte_size not between 1 and 10485760
    or p_file_hash !~ '^[0-9a-f]{64}$'
    or p_problem_type is null or p_problem_type not in ('binary','regression')
    or p_seed not between 0 and 2147483647
    or char_length(coalesce(p_app_version, '')) not between 1 and 40
    or char_length(coalesce(p_target_column, '')) not between 1 and 200
    or jsonb_typeof(p_schema_json) is distinct from 'object'
    or jsonb_typeof(p_preprocessing_json) is distinct from 'object'
    or jsonb_typeof(p_architecture_config) is distinct from 'object'
    or jsonb_typeof(p_hyperparameters_json) is distinct from 'object'
    or jsonb_typeof(p_schema_json->'columns') is distinct from 'array'
    or jsonb_typeof(p_architecture_config->'hiddenLayers') is distinct from 'array'
    or (p_preprocessing_json->>'problemType') is distinct from p_problem_type
    or (p_preprocessing_json->>'targetColumn') is distinct from p_target_column
    or octet_length(p_schema_json::text) > 32768
    or octet_length(p_preprocessing_json::text) > 131072
    or octet_length(p_architecture_config::text) > 8192
    or octet_length(p_hyperparameters_json::text) > 8192
    or coalesce((p_hyperparameters_json->>'epochs')::integer, 0) not between 1 and 50
  then
    raise exception 'Metadatos, configuración o límites de entrenamiento no válidos' using errcode = '22023';
  end if;
  -- Validaciones de estructura adicionales: la base no confía en la UI para validar configuración.
  if jsonb_array_length(p_schema_json->'columns') not between 2 and 100
    or not exists (select 1 from jsonb_array_elements(p_schema_json->'columns') as col
      where col->>'name' = p_target_column)
    or jsonb_array_length(p_architecture_config->'hiddenLayers') not between 1 and 3
    or coalesce((p_architecture_config->>'inputFeatures')::integer, 0) not between 1 and 128
    or coalesce((p_architecture_config->>'outputUnits')::integer, 0) <> 1
    or (p_architecture_config->>'family') is distinct from 'feedforward'
    or (p_architecture_config->>'outputActivation') is distinct from
      (case p_problem_type when 'binary' then 'sigmoid' else 'linear' end)
    or exists (
      select 1 from jsonb_array_elements(p_architecture_config->'hiddenLayers') as layer
      where jsonb_typeof(layer->'units') is distinct from 'number'
        or coalesce((layer->>'units')::integer, 0) not between 1 and 64
        or (layer->>'activation') is null
        or layer->>'activation' not in ('relu', 'tanh', 'sigmoid')
    )
    or coalesce((p_hyperparameters_json->>'batchSize')::integer, 0) not between 1 and 128
    or coalesce((p_hyperparameters_json->>'learningRate')::double precision, 0)
      not between 0.00001 and 0.1
    or (p_hyperparameters_json->>'optimizer') is distinct from 'adam'
    or (p_hyperparameters_json->>'seed')::integer is distinct from p_seed
  then
    raise exception 'Dimensiones, capas o hiperparámetros inválidos' using errcode = '22023';
  end if;

  -- El bloqueo serializa el cómputo de versiones concurrentes.
  perform 1 from public.projects where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'Proyecto archivado o no encontrado' using errcode = '42501';
  end if;
  select coalesce(max(version), 0) + 1 into v_arch_version
    from public.architectures where project_id = p_project_id and name = 'Feedforward Dense';
  select coalesce(max(version), 0) + 1 into v_dataset_version
    from public.datasets where project_id = p_project_id and name = v_dataset_name;
  insert into public.architectures(project_id, name, version, config_json, created_by)
    values (p_project_id, 'Feedforward Dense', v_arch_version, p_architecture_config, v_actor)
    returning id into v_arch_id;
  insert into public.datasets(project_id, name, version, schema_json, target_column,
    problem_type, row_count, byte_size, file_hash, created_by)
    values (p_project_id, v_dataset_name, v_dataset_version, p_schema_json,
      p_target_column, p_problem_type, p_row_count, p_byte_size, p_file_hash, v_actor)
    returning id into v_dataset_id;
  insert into public.training_runs(project_id, architecture_id, dataset_id, created_by,
    problem_type, hyperparameters_json, preprocessing_json, seed,
    dataset_hash, epochs_planned, app_version)
    values (p_project_id, v_arch_id, v_dataset_id, v_actor,
      p_problem_type, p_hyperparameters_json, p_preprocessing_json,
      p_seed, p_file_hash, (p_hyperparameters_json->>'epochs')::integer, p_app_version)
    returning id into v_run_id;
  insert into public.audit_events(actor_id, project_id, action, resource_type, resource_id)
    values (v_actor, p_project_id, 'training_started', 'training_run', v_run_id);
  return v_run_id;
end;
$$;

-- Registrar backend comprobado; no acepta el backend que el cliente "pretendía" utilizar.
-- Aun así, el servidor no puede demostrar la autenticidad de resultados enviados por navegador.
create function public.set_training_runtime(
  p_run_id uuid, p_backend text, p_context text, p_tfjs_version text
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_run public.training_runs%rowtype;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Ejecución no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'created'
    or p_backend is null or p_backend not in ('webgl','cpu')
    or p_context is null or p_context not in ('worker','main')
    or char_length(coalesce(p_tfjs_version,'')) not between 1 and 40 then
    raise exception 'Estado o backend inválido' using errcode = '22023';
  end if;
  update public.training_runs set status = 'running', backend = p_backend,
    execution_context = p_context, tfjs_version = p_tfjs_version,
    started_at = now(), updated_at = now() where id = p_run_id;
end;
$$;

-- Cada época se confirma de forma atómica; nada de métricas sintéticas o reescritura del historial.
create function public.record_training_epoch(
  p_run_id uuid, p_epoch integer, p_loss double precision,
  p_validation_loss double precision, p_metric double precision,
  p_validation_metric double precision
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.training_runs%rowtype;
  v_metric_name text;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Ejecución no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'running' or p_epoch is null
    or p_epoch <> v_run.completed_epochs + 1 or p_epoch > v_run.epochs_planned
    or p_loss is null or p_validation_loss is null
    or p_loss < 0 or p_validation_loss < 0
    or p_loss::text in ('NaN','Infinity','-Infinity')
    or p_validation_loss::text in ('NaN','Infinity','-Infinity')
    or (p_metric is not null and p_metric::text in ('NaN','Infinity','-Infinity'))
    or (p_validation_metric is not null and p_validation_metric::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'Orden de épocas, métricas o estado no válidos' using errcode = '22023';
  end if;
  if (p_metric is null) <> (p_validation_metric is null) then
    raise exception 'Las métricas de train y validación deben estar emparejadas' using errcode = '22023';
  end if;
  v_metric_name := case v_run.problem_type when 'binary' then 'accuracy' else 'mae' end;
  if p_metric is not null and
    (p_metric < 0 or p_validation_metric < 0 or
      (v_metric_name = 'accuracy' and (p_metric > 1 or p_validation_metric > 1))) then
    raise exception 'Métrica incompatible con el problema' using errcode = '22023';
  end if;
  insert into public.training_metrics(project_id, run_id, epoch, split, metric_name, metric_value)
    values (v_run.project_id, p_run_id, p_epoch, 'train', 'loss', p_loss),
           (v_run.project_id, p_run_id, p_epoch, 'validation', 'loss', p_validation_loss);
  if p_metric is not null then
    insert into public.training_metrics(project_id, run_id, epoch, split, metric_name, metric_value)
      values (v_run.project_id, p_run_id, p_epoch, 'train', v_metric_name, p_metric),
             (v_run.project_id, p_run_id, p_epoch, 'validation', v_metric_name, p_validation_metric);
  end if;
  update public.training_runs set completed_epochs = p_epoch, updated_at = now()
    where id = p_run_id;
end;
$$;

-- Los estados finales se confirman en BD, después de confirmar todas las épocas precedentes.
create function public.finish_training_run(
  p_run_id uuid, p_status text, p_duration_ms integer default null,
  p_error_summary text default null
) returns void language plpgsql security definer set search_path = ''
as $$
declare v_run public.training_runs%rowtype;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Ejecución no autorizada' using errcode = '42501';
  end if;
  if v_run.status not in ('created','running')
    or p_status is null or p_status not in ('completed','failed','cancelled','interrupted')
    or (p_status = 'completed' and (v_run.status <> 'running'
      or v_run.completed_epochs <> v_run.epochs_planned))
    or (p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 86400000))
    or char_length(coalesce(p_error_summary, '')) > 500 then
    raise exception 'Transición o datos de finalización no válidos' using errcode = '22023';
  end if;
  update public.training_runs set status = p_status, duration_ms = p_duration_ms,
    error_summary = nullif(left(p_error_summary, 500), ''), ended_at = now(), updated_at = now()
    where id = p_run_id;
  insert into public.audit_events(actor_id, project_id, action, resource_type, resource_id)
    values ((select auth.uid()), v_run.project_id, 'training_' || p_status, 'training_run', p_run_id);
end;
$$;

-- RPC: funciones SECURITY DEFINER solo para cuentas autenticadas; ninguna tabla acepta escrituras directas.
revoke all on function public.create_training_run(uuid,text,jsonb,text,text,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  from public, anon, authenticated;
revoke all on function public.set_training_runtime(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.record_training_epoch(uuid,integer,double precision,double precision,double precision,double precision)
  from public, anon, authenticated;
revoke all on function public.finish_training_run(uuid,text,integer,text) from public, anon, authenticated;
grant execute on function public.create_training_run(uuid,text,jsonb,text,text,integer,integer,text,jsonb,jsonb,jsonb,integer,text)
  to authenticated;
grant execute on function public.set_training_runtime(uuid,text,text,text) to authenticated;
grant execute on function public.record_training_epoch(uuid,integer,double precision,double precision,double precision,double precision)
  to authenticated;
grant execute on function public.finish_training_run(uuid,text,integer,text) to authenticated;

comment on table public.datasets is 'Solo metadatos. No almacena archivos CSV ni filas originales.';
comment on table public.training_runs is 'Resultados del cliente, verificables por reproducción, no atestación del cómputo.';
comment on table public.training_metrics is 'Métricas calculadas localmente y confirmadas vía RPC, sin UPDATE/DELETE.';

commit;
