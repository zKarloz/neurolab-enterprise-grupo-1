-- NeuroLab Enterprise / Fase 1.
-- Aplicar únicamente en el proyecto Supabase nuevo. No se reutilizan tablas antiguas.

create table public.app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_users is 'Perfil operacional de Auth; nunca contiene contraseñas.';

-- El trigger inserta perfiles al crear cuentas desde Dashboard/Auth Admin, pero jamás
-- confía en atributos de cliente para establecer is_platform_admin o status.
create function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.app_users (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'usuario'), '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email, updated_at = now();
  return new;
end;
$$;

revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;

create trigger sync_auth_user_profile_on_create
  after insert on auth.users
  for each row execute function public.sync_auth_user_profile();

create trigger sync_auth_user_profile_on_email_change
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_auth_user_profile();

-- Perfil existente en Auth (si el proyecto ya tiene usuarios creados manualmente).
insert into public.app_users (id, email, display_name)
select id, coalesce(email,''), split_part(coalesce(email, 'usuario'), '@', 1)
from auth.users
on conflict (id) do nothing;

alter table public.app_users enable row level security;

-- En F1 la consulta propia activa es suficiente; no se concede gestión global aún.
revoke all on public.app_users from anon, authenticated;
grant select (id, email, display_name, status, is_platform_admin, created_at, updated_at)
  on public.app_users to authenticated;

create policy "Los usuarios activos leen exclusivamente su perfil"
  on public.app_users
  for select
  to authenticated
  using (id = (select auth.uid()) and status = 'active');

-- Intencionalmente sin políticas INSERT/UPDATE/DELETE para las sesiones normales.
-- La asignación del primer Admin se realiza exclusivamente desde SQL Editor con
-- privilegios administrativos y nunca desde un endpoint/cliente público.
