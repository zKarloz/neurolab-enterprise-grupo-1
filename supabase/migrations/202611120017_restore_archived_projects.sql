-- NeuroLab Enterprise · M02. Restauración segura de proyectos archivados.
-- Aplicar DESPUÉS de 202611120016_gan_adversarial.sql.
-- No borra proyectos, miembros ni datos técnicos; registra un evento de auditoría.
BEGIN;

-- Conservar las acciones que ya soporta la Fase 6 y añadir restauración explícita.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'project_created','project_updated','project_archived','project_restored',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated','model_published',
  'admin_user_created','admin_user_activated','admin_user_deactivated','admin_password_reset',
  'model_reviewed','model_approved','model_rejected','model_retired',
  'report_export_requested','audit_export_requested'
));

-- Los administradores globales ven hechos administrativos de proyectos,
-- pero NO reciben lectura automática de entrenamientos ni auditorías técnicas.
ALTER POLICY "Auditoria por rol y alcance" ON public.audit_events USING (
  (project_id IS NULL AND private.is_platform_admin()) OR
  (project_id IS NOT NULL AND private.has_project_role(project_id, ARRAY['responsible']::text[])) OR
  (project_id IS NOT NULL AND private.is_platform_admin() AND action IN (
    'project_created','project_updated','project_archived','project_restored',
    'member_added','member_role_changed','member_removed'
  ))
);

-- Escritura exclusivamente por RPC: valida permisos en DB y audita en la
-- misma transacción. No permite reactivar proyectos ya activos.
CREATE FUNCTION public.restore_project(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_project_id IS NULL OR NOT COALESCE(private.can_manage_project(p_project_id), false) THEN
    RAISE EXCEPTION 'No autorizado para restaurar el proyecto' USING errcode = '42501';
  END IF;

  -- Mantener al menos un Responsable activo al volver a habilitar escrituras.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_members m
    JOIN public.app_users u ON u.id = m.user_id
    WHERE m.project_id = p_project_id AND m.role = 'responsible' AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'No se puede restaurar un proyecto sin Responsable activo'
      USING errcode = '22023';
  END IF;

  UPDATE public.projects SET status = 'active', updated_at = now()
  WHERE id = p_project_id AND status = 'archived';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proyecto no encontrado o no está archivado' USING errcode = '22023';
  END IF;

  INSERT INTO public.audit_events(actor_id, project_id, action, resource_type, resource_id, metadata_json)
  VALUES ((SELECT auth.uid()), p_project_id, 'project_restored', 'project', p_project_id,
    jsonb_build_object('previous_status','archived','new_status','active'));
END;
$$;

-- PostgreSQL concede EXECUTE a PUBLIC por defecto: retirarlo primero.
REVOKE ALL ON FUNCTION public.restore_project(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_project(uuid) TO authenticated;

COMMENT ON FUNCTION public.restore_project(uuid) IS
  'Restaura proyectos archivados solo con permiso administrativo vigente; sin eliminar datos, con auditoría.';
COMMIT;
