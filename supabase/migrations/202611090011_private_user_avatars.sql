-- NeuroLab Enterprise | F6 Mejora 5: fotografía personal privada.
-- EJECUTAR UNA VEZ con SQL Editor. La migración no modifica permisos de modelos.
BEGIN;

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS avatar_path text;

COMMENT ON COLUMN public.app_users.avatar_path IS
  'Ruta privada de la foto del propio usuario en el bucket user-avatars; NULL muestra iniciales.';

-- F1 restringió SELECT a columnas explícitas; añadir la columna nueva es
-- obligatorio para que AuthProvider pueda consultar el perfil sin errores.
GRANT SELECT (avatar_path) ON public.app_users TO authenticated;

-- El bucket rechaza SVG y archivos de más de 2 MiB también desde el servidor.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-avatars', 'user-avatars', false, 2097152,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Una ruta sólo puede estar bajo el UUID del usuario autenticado y utilizar
-- un nombre UUID nuevo: sin sobrescritura de fotos ni edición de modelos.
CREATE POLICY "neurolab_avatar_owner_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'
    )
  );

CREATE POLICY "neurolab_avatar_owner_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'
    )
  );

CREATE POLICY "neurolab_avatar_owner_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'user-avatars'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND owner_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1 FROM public.app_users u
      WHERE u.id = (SELECT auth.uid()) AND u.status = 'active'
    )
  );

-- La interfaz nunca recibe un permiso general UPDATE de app_users.
-- SECURITY DEFINER autoriza únicamente modificar su propio puntero.
CREATE OR REPLACE FUNCTION public.set_my_avatar(p_avatar_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No hay una sesión autenticada.' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.app_users
    WHERE id = v_user_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'La cuenta no está activa.' USING ERRCODE = '42501';
  END IF;

  IF p_avatar_path IS NOT NULL AND (
    p_avatar_path !~ ('^' || v_user_id::text || '/[0-9a-f-]{36}\.(jpg|png|webp)$')
    OR NOT EXISTS (
      SELECT 1 FROM storage.objects
      WHERE bucket_id = 'user-avatars'
        AND name = p_avatar_path
        AND owner_id = v_user_id::text
    )
  ) THEN
    RAISE EXCEPTION 'La fotografía indicada no pertenece al usuario.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.app_users
    SET avatar_path = p_avatar_path,
        updated_at = now()
  WHERE id = v_user_id AND status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_avatar(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_avatar(text) TO authenticated;

COMMIT;
