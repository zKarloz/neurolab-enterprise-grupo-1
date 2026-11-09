-- NeuroLab Enterprise · Fase 6 · Mejora «Mi cuenta».
-- Aplicar una vez DESPUÉS de 007. No cambia roles, RLS ni privilegios de escritura
-- directa en app_users. El único punto de edición es este RPC validado en servidor.
begin;

create or replace function public.update_my_display_name(p_display_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_display_name, ''));
  v_updated text;
begin
  -- Validación en PostgreSQL: nunca confiar solo en la validación de React.
  if char_length(v_name) < 2 or char_length(v_name) > 80 or v_name ~ '[[:cntrl:]]' then
    raise exception 'El nombre debe tener entre 2 y 80 caracteres válidos.'
      using errcode = '22023';
  end if;

  -- auth.uid() proviene del JWT verificado; el cliente no envía identificadores.
  -- Solo se permite actualizar la propia cuenta y si continúa activa.
  update public.app_users
     set display_name = v_name,
         updated_at = now()
   where id = (select auth.uid())
     and status = 'active'
  returning display_name into v_updated;

  if not found then
    raise exception 'Se requiere una sesión activa para cambiar el nombre.'
      using errcode = '42501';
  end if;

  return v_updated;
end;
$$;

-- Evitar permisos EXECUTE implícitos de PUBLIC en funciones nuevas.
revoke all on function public.update_my_display_name(text) from public, anon, authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;

commit;
