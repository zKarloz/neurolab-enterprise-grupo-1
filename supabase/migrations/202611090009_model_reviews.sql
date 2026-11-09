-- NeuroLab Enterprise | Fase 6, incremento 2 | Revisión inmutable de versiones.
-- Aplicar UNA sola vez después de 008. Nunca modifica model_versions ni Storage.
-- Las decisiones se insertan en model_review_events y se reflejan en auditoría.
BEGIN;

CREATE TABLE public.model_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  project_id uuid NOT NULL,
  model_version_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('reviewed', 'approved', 'rejected', 'retired')),
  resulting_status text NOT NULL CHECK (resulting_status IN ('reviewed', 'approved', 'rejected', 'retired')),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (project_id, model_version_id)
    REFERENCES public.model_versions(project_id, id) ON DELETE RESTRICT,
  CHECK (decision = resulting_status),
  CHECK (decision NOT IN ('rejected', 'retired') OR char_length(btrim(note)) >= 10)
);
CREATE INDEX idx_model_review_events_version_latest
  ON public.model_review_events(model_version_id, id DESC);
CREATE INDEX idx_model_review_events_project_latest
  ON public.model_review_events(project_id, id DESC);

ALTER TABLE public.model_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.model_review_events FROM public, anon, authenticated;
GRANT SELECT ON public.model_review_events TO authenticated;
CREATE POLICY "Integrantes consultan decisiones de sus proyectos"
  ON public.model_review_events FOR SELECT TO authenticated
  USING (private.has_project_role(project_id,
    ARRAY['responsible','engineer','reviewer','reader']::text[]));
-- Sin INSERT, UPDATE ni DELETE directos: los cambios de estado requieren el RPC.

-- La función bloquea la fila de versión para serializar revisiones concurrentes.
-- Este bloqueo NO modifica model_versions, que conserva su inmutabilidad.
CREATE FUNCTION public.decide_model_review(
  p_version_id uuid,
  p_decision text,
  p_note text DEFAULT ''
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_version public.model_versions%ROWTYPE;
  v_current text;
  v_note text := btrim(coalesce(p_note, ''));
  v_next text;
  v_audit_action text;
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('reviewed','approved','rejected','retired') THEN
    RAISE EXCEPTION 'Decisión de revisión inválida' USING errcode = '22023';
  END IF;
  IF char_length(v_note) > 1000 OR
    (p_decision IN ('rejected','retired') AND char_length(v_note) < 10) THEN
    RAISE EXCEPTION 'Motivo inválido: máximo 1000 caracteres, mínimo 10 para rechazar/retirar'
      USING errcode = '22023';
  END IF;

  SELECT * INTO v_version FROM public.model_versions WHERE id = p_version_id FOR UPDATE;
  IF NOT FOUND OR NOT private.has_project_role(v_version.project_id, ARRAY['reviewer']::text[]) THEN
    RAISE EXCEPTION 'Versión no disponible o revisor no autorizado' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_version.project_id AND status = 'active') THEN
    RAISE EXCEPTION 'El proyecto está archivado' USING errcode = '42501';
  END IF;
  -- Separación efectiva de responsabilidades, comprobada en la base de datos.
  IF v_version.created_by = v_actor OR EXISTS (
    SELECT 1 FROM public.training_runs r
    WHERE r.id = v_version.run_id AND r.created_by = v_actor
  ) OR EXISTS (
    SELECT 1 FROM public.models m
    WHERE m.id = v_version.model_id AND m.created_by = v_actor
  ) THEN
    RAISE EXCEPTION 'No puedes revisar una versión que creaste o entrenaste'
      USING errcode = '42501';
  END IF;

  SELECT resulting_status INTO v_current
    FROM public.model_review_events
    WHERE model_version_id = p_version_id ORDER BY id DESC LIMIT 1;
  v_current := coalesce(v_current, 'draft');

  -- Flujo cerrado: borrador -> revisado -> aprobado/rechazado; aprobado -> retirado.
  -- Rechazado y retirado son terminales; para seguir entrenando, crear nueva versión.
  IF (v_current = 'draft' AND p_decision = 'reviewed') OR
     (v_current = 'reviewed' AND p_decision IN ('approved','rejected')) OR
     (v_current = 'approved' AND p_decision = 'retired') THEN
    v_next := p_decision;
  ELSE
    RAISE EXCEPTION 'Transición no permitida desde % hacia %', v_current, p_decision
      USING errcode = '22023';
  END IF;

  INSERT INTO public.model_review_events(project_id,model_version_id,actor_id,decision,resulting_status,note)
  VALUES (v_version.project_id,p_version_id,v_actor,p_decision,v_next,v_note);

  v_audit_action := CASE p_decision
    WHEN 'reviewed' THEN 'model_reviewed'
    WHEN 'approved' THEN 'model_approved'
    WHEN 'rejected' THEN 'model_rejected'
    WHEN 'retired' THEN 'model_retired'
  END;
  INSERT INTO public.audit_events(actor_id,project_id,action,resource_type,resource_id,metadata_json)
  VALUES (v_actor,v_version.project_id,v_audit_action,'model_version',p_version_id,
          jsonb_build_object('status',v_next));
  RETURN v_next;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_model_review(uuid,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_model_review(uuid,text,text) TO authenticated;

-- Mantener la lista de auditoría completa de 006 + acciones de revisión.
ALTER TABLE public.audit_events DROP CONSTRAINT audit_events_action_check;
ALTER TABLE public.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated','model_published',
  'admin_user_created','admin_user_activated','admin_user_deactivated','admin_password_reset',
  'model_reviewed','model_approved','model_rejected','model_retired'
));

COMMENT ON TABLE public.model_review_events IS
 'Historial append-only de decisiones por versión; draft se infiere si no hay eventos.';
COMMIT;
