-- NeuroLab Enterprise / Fase 2. Ejecutar UNA SOLA VEZ, después de 202611070001_init_app_users.sql.
-- No reejecutar el bootstrap del administrador. Esta migración no modifica cuentas Auth.
-- Operaciones de escritura: RPC con autorización explícita y auditoría en la misma transacción.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  owner_id uuid not null references public.app_users(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.app_users(id) on delete restrict,
  role text not null check (role in ('responsible', 'engineer', 'reviewer', 'reader')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index idx_project_members_user on public.project_members(user_id, project_id);
create index idx_projects_owner on public.projects(owner_id);
create index idx_projects_created on public.projects(created_at desc);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.app_users(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  action text not null check (action in (
    'project_created','project_updated','project_archived',
    'member_added','member_role_changed','member_removed'
  )),
  resource_type text not null check (resource_type in ('project','project_member')),
  resource_id uuid not null,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index idx_audit_events_project_created on public.audit_events(project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.audit_events enable row level security;

-- Desactivar privilegios concedidos por defecto: RLS y GRANT son controles complementarios.
revoke all on public.projects, public.project_members, public.audit_events from public, anon, authenticated;
grant select on public.projects, public.project_members, public.audit_events to authenticated;

-- Funciones internas: se evalúa el estado vigente en DB (no claims de JWT editables).
-- Los helpers SECURITY DEFINER son de propósito limitado y viven fuera del esquema Data API.
create function private.is_active()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = (select auth.uid()) and u.status = 'active'
  );
$$;

create function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.app_users u
    where u.id = (select auth.uid()) and u.status = 'active' and u.is_platform_admin
  );
$$;

create function private.has_project_role(p_project_id uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_active() and exists (
    select 1 from public.project_members m
    where m.project_id = p_project_id and m.user_id = (select auth.uid())
      and m.role = any(p_roles)
  );
$$;

create function private.can_view_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_active() and (
    private.is_platform_admin() or
    exists (select 1 from public.project_members m
      where m.project_id = p_project_id and m.user_id = (select auth.uid()))
  );
$$;

create function private.can_manage_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_active() and (
    private.is_platform_admin() or
    private.has_project_role(p_project_id, array['responsible']::text[])
  );
$$;

create function private.can_create_project()
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_active() and (
    private.is_platform_admin() or exists (
      select 1 from public.project_members m
      join public.projects p on p.id = m.project_id
      where m.user_id = (select auth.uid()) and m.role = 'responsible'
        and p.status = 'active'
    )
  );
$$;

revoke all on function private.is_active(), private.is_platform_admin(),
  private.has_project_role(uuid,text[]), private.can_view_project(uuid),
  private.can_manage_project(uuid), private.can_create_project()
  from public, anon, authenticated;
grant execute on function private.is_active(), private.is_platform_admin(),
  private.has_project_role(uuid,text[]), private.can_view_project(uuid),
  private.can_manage_project(uuid), private.can_create_project()
  to authenticated;

create policy "Integrantes leen metadatos de proyectos autorizados"
  on public.projects for select to authenticated
  using (private.can_view_project(id));

create policy "Integrantes leen asignaciones de sus proyectos"
  on public.project_members for select to authenticated
  using (private.can_view_project(project_id));

create policy "Responsables ven auditoria administrativa"
  on public.audit_events for select to authenticated
  using (private.can_manage_project(project_id));

-- NO hay políticas de escritura: solo funciones RPC validadas, no INSERT/UPDATE/DELETE desde Data API.

create function public.create_project(p_name text, p_description text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_id uuid; v_actor uuid := (select auth.uid());
begin
  if not private.can_create_project() then
    raise exception 'No autorizado para crear proyectos' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 100
      or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Nombre o descripción no válidos' using errcode = '22023';
  end if;
  insert into public.projects (name, description, owner_id)
  values (btrim(p_name), coalesce(btrim(p_description), ''), v_actor)
  returning id into v_id;
  -- El creador queda explícitamente incorporado como Responsable, incluso si es Admin global.
  insert into public.project_members (project_id, user_id, role)
  values (v_id, v_actor, 'responsible');
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id)
  values (v_actor, v_id, 'project_created', 'project', v_id);
  return v_id;
end;
$$;

create function public.update_project(p_project_id uuid, p_name text, p_description text default '')
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_manage_project(p_project_id) then
    raise exception 'No autorizado para modificar el proyecto' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 100
      or char_length(coalesce(p_description, '')) > 1000 then
    raise exception 'Nombre o descripción no válidos' using errcode = '22023';
  end if;
  update public.projects set name = btrim(p_name), description = btrim(coalesce(p_description, '')),
    updated_at = now()
  where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyecto no encontrado o archivado' using errcode = '22023';
  end if;
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id)
  values ((select auth.uid()), p_project_id, 'project_updated', 'project', p_project_id);
end;
$$;

create function public.archive_project(p_project_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not private.can_manage_project(p_project_id) then
    raise exception 'No autorizado para archivar el proyecto' using errcode = '42501';
  end if;
  update public.projects set status = 'archived', updated_at = now()
  where id = p_project_id and status = 'active';
  if not found then
    raise exception 'Proyecto no encontrado o archivado' using errcode = '22023';
  end if;
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id)
  values ((select auth.uid()), p_project_id, 'project_archived', 'project', p_project_id);
end;
$$;

-- Listado de identidad de miembros: no altera la RLS restrictiva de app_users de F1.
create function public.list_project_members(p_project_id uuid)
returns table (user_id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.can_view_project(p_project_id) then
    raise exception 'Proyecto no autorizado' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email, u.display_name, m.role, m.created_at
    from public.project_members m join public.app_users u on u.id = m.user_id
    where m.project_id = p_project_id order by m.created_at, u.display_name;
end;
$$;

create function public.add_project_member(p_project_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_target uuid;
begin
  if not private.can_manage_project(p_project_id) then
    raise exception 'No autorizado para gestionar integrantes' using errcode = '42501';
  end if;
  if p_role not in ('responsible','engineer','reviewer','reader') or p_role is null then
    raise exception 'Rol de proyecto no válido' using errcode = '22023';
  end if;
  -- Bloqueo de la fila de proyecto: serializa mutaciones concurrentes de miembros.
  perform 1 from public.projects where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'Proyecto no disponible' using errcode = '22023';
  end if;
  select id into v_target from public.app_users
    where lower(email) = lower(btrim(coalesce(p_email, ''))) and status = 'active';
  if v_target is null then
    raise exception 'La cuenta no existe o está inactiva' using errcode = '22023';
  end if;
  if v_target = (select auth.uid()) then
    raise exception 'No puedes modificar tu propia membresía' using errcode = '42501';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, v_target, p_role);
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id, metadata_json)
  values ((select auth.uid()), p_project_id, 'member_added', 'project_member', v_target,
    jsonb_build_object('role', p_role));
end;
$$;

create function public.change_project_member_role(p_project_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old_role text; v_owner uuid;
begin
  if not private.can_manage_project(p_project_id) then
    raise exception 'No autorizado para gestionar integrantes' using errcode = '42501';
  end if;
  if p_role not in ('responsible','engineer','reviewer','reader') or p_role is null then
    raise exception 'Rol de proyecto no válido' using errcode = '22023';
  end if;
  select owner_id into v_owner from public.projects
    where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'Proyecto no disponible' using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) or p_user_id = v_owner then
    raise exception 'No puede cambiarse el rol propio ni el del propietario' using errcode = '42501';
  end if;
  select role into v_old_role from public.project_members
    where project_id = p_project_id and user_id = p_user_id;
  if not found then
    raise exception 'El integrante no existe' using errcode = '22023';
  end if;
  if v_old_role = 'responsible' and p_role <> 'responsible' and not exists (
    select 1 from public.project_members m join public.app_users u on u.id = m.user_id
    where m.project_id = p_project_id and m.user_id <> p_user_id
      and m.role = 'responsible' and u.status = 'active'
  ) then
    raise exception 'Debe permanecer un Responsable activo' using errcode = '22023';
  end if;
  if v_old_role = p_role then return; end if;
  update public.project_members set role = p_role
    where project_id = p_project_id and user_id = p_user_id;
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id, metadata_json)
  values ((select auth.uid()), p_project_id, 'member_role_changed', 'project_member', p_user_id,
    jsonb_build_object('previous_role', v_old_role, 'new_role', p_role));
end;
$$;

create function public.remove_project_member(p_project_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_old_role text; v_owner uuid;
begin
  if not private.can_manage_project(p_project_id) then
    raise exception 'No autorizado para gestionar integrantes' using errcode = '42501';
  end if;
  select owner_id into v_owner from public.projects
    where id = p_project_id and status = 'active' for update;
  if not found then
    raise exception 'Proyecto no disponible' using errcode = '22023';
  end if;
  if p_user_id = (select auth.uid()) or p_user_id = v_owner then
    raise exception 'No puede quitarse a sí mismo ni al propietario' using errcode = '42501';
  end if;
  select role into v_old_role from public.project_members
    where project_id = p_project_id and user_id = p_user_id;
  if not found then
    raise exception 'El integrante no existe' using errcode = '22023';
  end if;
  if v_old_role = 'responsible' and not exists (
    select 1 from public.project_members m join public.app_users u on u.id = m.user_id
    where m.project_id = p_project_id and m.user_id <> p_user_id
      and m.role = 'responsible' and u.status = 'active'
  ) then
    raise exception 'Debe permanecer un Responsable activo' using errcode = '22023';
  end if;
  delete from public.project_members where project_id = p_project_id and user_id = p_user_id;
  insert into public.audit_events (actor_id, project_id, action, resource_type, resource_id, metadata_json)
  values ((select auth.uid()), p_project_id, 'member_removed', 'project_member', p_user_id,
    jsonb_build_object('previous_role', v_old_role));
end;
$$;

-- En public, todas las funciones RPC están protegidas por checks explícitos.
-- PostgreSQL concede EXECUTE a PUBLIC por defecto: retirarlo en cada función.
revoke all on function public.create_project(text,text), public.update_project(uuid,text,text),
  public.archive_project(uuid), public.list_project_members(uuid),
  public.add_project_member(uuid,text,text), public.change_project_member_role(uuid,uuid,text),
  public.remove_project_member(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.create_project(text,text), public.update_project(uuid,text,text),
  public.archive_project(uuid), public.list_project_members(uuid),
  public.add_project_member(uuid,text,text), public.change_project_member_role(uuid,uuid,text),
  public.remove_project_member(uuid,uuid)
  to authenticated;

comment on table public.projects is 'Metadatos administrativos. Admin global puede verlos sin heredar acceso a contenido técnico.';
comment on table public.project_members is 'Un rol explícito por usuario/proyecto. Admin global NO se convierte automáticamente en miembro.';
comment on table public.audit_events is 'Auditoría administrativa insertada en RPC, nunca por el cliente.';

commit;
