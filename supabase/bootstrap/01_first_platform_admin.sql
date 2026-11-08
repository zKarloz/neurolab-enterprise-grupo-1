-- NeuroLab Enterprise / Fase 1 / BOOTSTRAP MANUAL.
-- Solo usar en SQL Editor de un proyecto NUEVO, como operador privilegiado.
-- NO incorporar a migrations, ejecutar automáticamente ni publicar con un UUID real.
-- 1) Ejecutar primero la migración 202611070001_init_app_users.sql.
-- 2) Crear un usuario real en Authentication > Users (no INSERT manual en auth.users).
-- 3) Copiar su UUID desde el Dashboard y reemplazar el UUID de ceros de abajo.
-- 4) Ejecutar este bloque una única vez, luego verificar la consulta final.

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'::uuid;  -- REEMPLAZAR
  v_updated integer;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Debes reemplazar el UUID de ejemplo por el UUID real de Authentication > Users';
  end if;

  if exists (select 1 from public.app_users where is_platform_admin) then
    raise exception 'Ya existe al menos un Administrador global: el bootstrap inicial no puede repetirse';
  end if;

  if not exists (
    select 1
    from public.app_users a
    join auth.users u on u.id = a.id
    where a.id = v_user_id and a.status = 'active' and u.email_confirmed_at is not null
  ) then
    raise exception 'El UUID no corresponde a una cuenta activa y con email confirmado en Auth';
  end if;

  update public.app_users
  set is_platform_admin = true, updated_at = now()
  where id = v_user_id and status = 'active';

  get diagnostics v_updated = row_count;
  if v_updated <> 1 then
    raise exception 'No se pudo establecer un único Administrador global';
  end if;
end;
$$;

-- Resultado esperado: una única fila activa con is_platform_admin=true.
-- El Administrador global NO obtiene acceso a contenido técnico privado sin rol de proyecto.
select id, email, status, is_platform_admin
from public.app_users
where is_platform_admin = true;
