-- NeuroLab Enterprise · Fase 6 M09/M10 · Reportes y auditoría visual.
-- Ejecutar UNA vez después de 009 y de los permisos administrativos 007.
-- No amplía SELECT de tablas técnicas ni de auditoría; se reutiliza RLS vigente.
BEGIN;

-- Acciones adicionales del registro append-only para intentos autorizados de exportación.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated','model_published',
  'admin_user_created','admin_user_activated','admin_user_deactivated','admin_password_reset',
  'model_reviewed','model_approved','model_rejected','model_retired',
  'report_export_requested','audit_export_requested'
));

-- Registra intención antes de descargar CSV o abrir la impresión/PDF.
-- Autorización leída de la base de datos en cada llamada; ningún rol de frontend la concede.
CREATE FUNCTION public.record_report_export(p_project_id uuid, p_kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_action text;
  v_resource_type text;
  v_resource_id uuid;
BEGIN
  IF p_kind NOT IN ('report_csv','report_pdf','audit_csv') OR p_kind IS NULL THEN
    RAISE EXCEPTION 'Tipo de exportación inválido' USING errcode = '22023';
  END IF;
  IF p_project_id IS NULL THEN
    -- Administración global: exclusivamente auditoría; no reportes técnicos.
    IF p_kind <> 'audit_csv' OR NOT private.is_platform_admin() THEN
      RAISE EXCEPTION 'Exportación global no autorizada' USING errcode = '42501';
    END IF;
  ELSIF p_kind IN ('report_csv', 'report_pdf') THEN
    IF NOT private.has_project_role(p_project_id,
      ARRAY['responsible','engineer','reviewer','reader']::text[]) THEN
      RAISE EXCEPTION 'Reporte no autorizado' USING errcode = '42501';
    END IF;
  ELSE
    IF NOT private.has_project_role(p_project_id, ARRAY['responsible']::text[]) THEN
      RAISE EXCEPTION 'Auditoría no autorizada' USING errcode = '42501';
    END IF;
  END IF;

  v_action := CASE WHEN p_kind = 'audit_csv' THEN 'audit_export_requested'
                   ELSE 'report_export_requested' END;
  v_resource_type := CASE WHEN p_project_id IS NULL THEN 'app_user' ELSE 'project' END;
  v_resource_id := COALESCE(p_project_id, v_actor);

  INSERT INTO public.audit_events(actor_id,project_id,action,resource_type,resource_id,metadata_json)
  VALUES (v_actor,p_project_id,v_action,v_resource_type,v_resource_id,
          jsonb_build_object('format', CASE WHEN p_kind = 'report_pdf' THEN 'pdf' ELSE 'csv' END,
                             'kind', p_kind, 'max_rows', 200));
END;
$$;
REVOKE ALL ON FUNCTION public.record_report_export(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_report_export(uuid,text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_events_global_recent
  ON public.audit_events(created_at DESC, id DESC) WHERE project_id IS NULL;

COMMENT ON FUNCTION public.record_report_export(uuid,text) IS
  'Registra solicitud de exportación con autorización por rol vigente; no garantiza que el usuario completó la descarga.';
COMMIT;
