-- NeuroLab Enterprise · Fase 6, incremento 1.
-- Ejecutar una sola vez DESPUÉS de 005. Extiende la auditoría global sin
-- modificar roles técnicos, modelos ni permisos de escritura de app_users.
begin;

-- La auditoría global no pertenece a ningún proyecto particular.
alter table public.audit_events alter column project_id drop not null;

-- Conservar todas las acciones existentes e incorporar solo las administrativas.
alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated','model_published',
  'admin_user_created','admin_user_activated','admin_user_deactivated','admin_password_reset'
));
alter table public.audit_events drop constraint audit_events_resource_type_check;
alter table public.audit_events add constraint audit_events_resource_type_check check (
  resource_type in ('project','project_member','training_run','model_version','app_user')
);

-- La regla anterior dejaba que el Admin global consultara auditoría técnica
-- de proyectos ajenos. La corregimos conforme a la seguridad aprobada en Fase 0.
drop policy if exists "Responsables ven auditoria administrativa" on public.audit_events;
create policy "Auditoria por rol y alcance" on public.audit_events
  for select to authenticated
  using (
    (project_id is null and private.is_platform_admin()) or
    (project_id is not null and private.has_project_role(project_id, array['responsible']::text[])) or
    (project_id is not null and private.is_platform_admin() and action in (
      'project_created','project_updated','project_archived',
      'member_added','member_role_changed','member_removed'
    ))
  );

-- Ni un Administrador global puede desactivar al último Responsable activo
-- de un proyecto. La comprobación se ejecuta también con service_role.
create function private.guard_last_responsible_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'active' and new.status = 'inactive' and exists (
    select 1 from public.project_members m
    join public.projects p on p.id = m.project_id
    where m.user_id = old.id and m.role = 'responsible' and p.status = 'active'
      and not exists (
        select 1 from public.project_members other_member
        join public.app_users other_user on other_user.id = other_member.user_id
        where other_member.project_id = m.project_id
          and other_member.user_id <> old.id
          and other_member.role = 'responsible'
          and other_user.status = 'active'
      )
  ) then
    raise exception 'No se puede desactivar el último Responsable activo de un proyecto'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_last_responsible_status() from public, anon, authenticated;
create trigger guard_last_responsible_status_before_update
  before update of status on public.app_users
  for each row execute function private.guard_last_responsible_status();

-- Mantener app_users sin permisos de escritura para authenticated/anon.
revoke insert, update, delete on public.app_users from anon, authenticated;
commit;
