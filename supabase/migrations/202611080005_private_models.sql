-- NeuroLab Enterprise | Fase 5 | Registro privado, versiones inmutables.
-- Aplicar UNA vez después de 202611080004_test_evaluation.sql.
-- IMPORTANTE: no se conceden UPDATE ni DELETE sobre model_versions o storage.objects.
begin;

-- Nombre lógico del modelo; los artefactos nunca se almacenan como filas SQL.
create table public.models (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (project_id, id),
  unique (project_id, name)
);

-- Reserva técnica para el protocolo de subida en dos etapas. NO es una versión publicada.
-- Reservas fallidas no pueden convertirse en versiones visibles, ni reutilizarse tras expirar.
create table public.model_uploads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  model_id uuid not null,
  run_id uuid not null,
  version integer not null check (version between 1 and 999999),
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  unique (model_id, version),
  unique (project_id, id),
  foreign key (project_id, model_id) references public.models(project_id, id) on delete restrict,
  foreign key (project_id, run_id) references public.training_runs(project_id, id) on delete restrict
);

-- Publicación final de solo inserción. Sin estados actualizables o eliminación de usuario.
create table public.model_versions (
  id uuid primary key references public.model_uploads(id) on delete restrict,
  project_id uuid not null,
  model_id uuid not null,
  run_id uuid not null,
  version integer not null check (version >= 1),
  manifest_path text not null unique,
  weights_path text not null unique,
  manifest_sha256 text not null check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  weights_sha256 text not null check (weights_sha256 ~ '^[0-9a-f]{64}$'),
  preprocessing_manifest jsonb not null check (jsonb_typeof(preprocessing_manifest) = 'object'),
  backend text not null,
  tfjs_version text not null,
  created_by uuid not null references public.app_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (model_id, version),
  unique (project_id, id),
  foreign key (project_id, model_id) references public.models(project_id, id) on delete restrict,
  foreign key (project_id, run_id) references public.training_runs(project_id, id) on delete restrict
);
create index idx_models_project on public.models(project_id, created_at desc);
create index idx_model_versions_project on public.model_versions(project_id, created_at desc);
create index idx_model_versions_run on public.model_versions(run_id);

alter table public.models enable row level security;
alter table public.model_uploads enable row level security;
alter table public.model_versions enable row level security;
revoke all on public.models, public.model_uploads, public.model_versions from public, anon, authenticated;
grant select on public.models, public.model_versions to authenticated;
-- Solo integrantes activos del proyecto. Ser Admin global no da lectura técnica.
create policy "Miembros pueden consultar modelos logicos" on public.models
  for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));
create policy "Miembros pueden consultar versiones publicadas" on public.model_versions
  for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));

-- Bucket privado, nunca público. 10 MiB por archivo, tipos estrictos.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('model-artifacts', 'model-artifacts', false, 10485760,
        array['application/json','application/octet-stream']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                            allowed_mime_types = excluded.allowed_mime_types;

-- Los paths se componen solo con UUIDs generados en la reserva y un nombre fijo.
-- No se confía en el nombre proporcionado por el cliente ni en un flag is_admin.
create function private.model_object_path(p_project uuid, p_model uuid, p_version uuid, p_filename text)
returns text language sql immutable set search_path = '' as $$
  select p_project::text || '/' || p_model::text || '/' || p_version::text || '/' || p_filename
$$;
revoke all on function private.model_object_path(uuid,uuid,uuid,text) from public, anon, authenticated;

create function private.can_upload_model_object(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.model_uploads u
      join public.training_runs r on r.id = u.run_id and r.project_id = u.project_id
    where u.created_by = (select auth.uid()) and u.expires_at > now()
      and not exists (select 1 from public.model_versions v where v.id = u.id)
      and r.status = 'completed' and r.created_by = u.created_by
      and private.can_train_in_project(u.project_id)
      and p_path in (
        private.model_object_path(u.project_id,u.model_id,u.id,'model.json'),
        private.model_object_path(u.project_id,u.model_id,u.id,'weights.bin')
      )
  );
$$;
revoke all on function private.can_upload_model_object(text) from public, anon, authenticated;
grant execute on function private.can_upload_model_object(text) to authenticated;

create function private.can_read_model_object(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.model_versions v
    where p_path in (v.manifest_path, v.weights_path)
      and private.has_project_role(v.project_id, array['responsible','engineer','reviewer','reader']::text[])
  );
$$;
revoke all on function private.can_read_model_object(text) from public, anon, authenticated;
grant execute on function private.can_read_model_object(text) to authenticated;

create policy "Subida privada solo a reserva propia" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'model-artifacts' and private.can_upload_model_object(name));
create policy "Lectura privada solo a versiones publicadas" on storage.objects
  for select to authenticated
  using (bucket_id = 'model-artifacts' and private.can_read_model_object(name));
-- Nunca crear políticas de UPDATE/DELETE para 'model-artifacts'.

-- Reservar es una sola transacción: el número de versión queda bloqueado bajo el proyecto.
create function public.reserve_model_upload(p_run_id uuid, p_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_run public.training_runs%rowtype;
  v_model public.models%rowtype;
  v_upload public.model_uploads%rowtype;
  v_name text := btrim(coalesce(p_name,''));
begin
  select * into v_run from public.training_runs where id = p_run_id;
  if not found or v_run.status <> 'completed' or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'La ejecución no está completada o no tienes permiso para publicar' using errcode = '42501';
  end if;
  if char_length(v_name) not between 1 and 120 then
    raise exception 'Nombre de modelo inválido (1 a 120 caracteres)' using errcode = '22023';
  end if;
  -- Sin evaluación de prueba final no se publica un modelo de Fase 5.
  if not exists (select 1 from public.run_evaluations e where e.run_id = p_run_id) then
    raise exception 'La ejecución necesita evaluación de prueba confirmada' using errcode = '22023';
  end if;
  -- Bloqueo para versionado concurrente y nombres únicos.
  perform 1 from public.projects where id = v_run.project_id for update;
  select * into v_model from public.models where project_id = v_run.project_id and name = v_name;
  if not found then
    insert into public.models(project_id,name,created_by)
      values(v_run.project_id,v_name,auth.uid()) returning * into v_model;
  end if;
  insert into public.model_uploads(project_id,model_id,run_id,version,created_by)
  values (v_run.project_id,v_model.id,p_run_id,
    coalesce((select max(version)+1 from public.model_uploads where model_id = v_model.id),1),auth.uid())
  returning * into v_upload;
  return jsonb_build_object('id',v_upload.id,'model_id',v_model.id,'version',v_upload.version,
    'manifest_path',private.model_object_path(v_run.project_id,v_model.id,v_upload.id,'model.json'),
    'weights_path',private.model_object_path(v_run.project_id,v_model.id,v_upload.id,'weights.bin'));
end;
$$;

-- Publicación atómica tras comprobar AMBOS objetos en Storage. Hashes reportados por cliente,
-- NO una prueba criptográfica de que el entrenamiento en navegador sea auténtico.
create function public.publish_model_version(p_upload_id uuid, p_manifest_sha256 text, p_weights_sha256 text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_upload public.model_uploads%rowtype;
  v_run public.training_runs%rowtype;
  v_json storage.objects%rowtype;
  v_weights storage.objects%rowtype;
  v_manifest text;
  v_bin text;
begin
  select * into v_upload from public.model_uploads where id = p_upload_id for update;
  if not found or v_upload.created_by is distinct from (select auth.uid())
    or v_upload.expires_at <= now() or not private.can_train_in_project(v_upload.project_id)
    or exists(select 1 from public.model_versions where id = p_upload_id) then
    raise exception 'Reserva vencida, publicada o no autorizada' using errcode = '42501';
  end if;
  select * into v_run from public.training_runs where id = v_upload.run_id;
  if not found or v_run.status <> 'completed' or v_run.created_by <> v_upload.created_by
    or v_run.project_id <> v_upload.project_id then
    raise exception 'Ejecución inválida para publicar modelo' using errcode = '22023';
  end if;
  if p_manifest_sha256 !~ '^[0-9a-f]{64}$' or p_weights_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Huellas SHA-256 inválidas' using errcode = '22023';
  end if;
  v_manifest := private.model_object_path(v_upload.project_id,v_upload.model_id,v_upload.id,'model.json');
  v_bin := private.model_object_path(v_upload.project_id,v_upload.model_id,v_upload.id,'weights.bin');
  select * into v_json from storage.objects where bucket_id = 'model-artifacts' and name = v_manifest;
  select * into v_weights from storage.objects where bucket_id = 'model-artifacts' and name = v_bin;
  if v_json.id is null or v_weights.id is null
    or coalesce((v_json.metadata->>'size')::bigint,0) not between 1 and 1048576
    or coalesce((v_weights.metadata->>'size')::bigint,0) not between 1 and 10485760 then
    raise exception 'Falta model.json o pesos, o exceden los límites' using errcode = '22023';
  end if;
  insert into public.model_versions(id,project_id,model_id,run_id,version,
     manifest_path,weights_path,manifest_sha256,weights_sha256,preprocessing_manifest,
     backend,tfjs_version,created_by)
  values(v_upload.id,v_upload.project_id,v_upload.model_id,v_upload.run_id,v_upload.version,
     v_manifest,v_bin,p_manifest_sha256,p_weights_sha256,v_run.preprocessing_json,
     v_run.backend,v_run.tfjs_version,auth.uid());
  insert into public.audit_events(actor_id,project_id,action,resource_type,resource_id)
    values(auth.uid(),v_upload.project_id,'model_published','model_version',v_upload.id);
  return v_upload.id;
end;
$$;

-- Auditoría mínima de publicación.
alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated','model_published'
));
alter table public.audit_events drop constraint audit_events_resource_type_check;
alter table public.audit_events add constraint audit_events_resource_type_check
  check (resource_type in ('project','project_member','training_run','model_version'));

revoke all on function public.reserve_model_upload(uuid,text) from public, anon, authenticated;
revoke all on function public.publish_model_version(uuid,text,text) from public, anon, authenticated;
grant execute on function public.reserve_model_upload(uuid,text) to authenticated;
grant execute on function public.publish_model_version(uuid,text,text) to authenticated;

comment on table public.model_uploads is 'Reservas no publicadas; pueden quedar huérfanas. No exponer al cliente.';
comment on table public.model_versions is 'Versiones inmutables para la aplicación; archivos sin UPDATE o DELETE.';
commit;
