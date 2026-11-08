-- NeuroLab Enterprise / Fase 4 - evaluación final por ejecución.
-- Ejecutar UNA VEZ DESPUÉS de 202611080003_feedforward_persistence.sql.
-- No se guardan filas, etiquetas ni predicciones individuales del CSV.
begin;

create table public.run_evaluations (
  run_id uuid primary key,
  project_id uuid not null,
  problem_type text not null check (problem_type in ('binary','regression')),
  sample_count integer not null check (sample_count between 1 and 50000),
  metrics_json jsonb not null check (
    jsonb_typeof(metrics_json) = 'object' and octet_length(metrics_json::text) <= 4096
  ),
  evaluated_at timestamptz not null default now(),
  constraint fk_evaluation_run_project foreign key (project_id, run_id)
    references public.training_runs(project_id, id) on delete restrict
);
create index idx_run_evaluations_project on public.run_evaluations(project_id, evaluated_at desc);
alter table public.run_evaluations enable row level security;

-- Solo lectura para miembros autorizados. La inserción es exclusiva de la RPC siguiente.
revoke all on public.run_evaluations from public, anon, authenticated;
grant select on public.run_evaluations to authenticated;
create policy "Integrantes leen evaluaciones de sus proyectos"
  on public.run_evaluations for select to authenticated
  using (private.has_project_role(project_id, array['responsible','engineer','reviewer','reader']::text[]));

alter table public.audit_events drop constraint audit_events_action_check;
alter table public.audit_events add constraint audit_events_action_check check (action in (
  'project_created','project_updated','project_archived',
  'member_added','member_role_changed','member_removed',
  'training_started','training_completed','training_failed','training_cancelled','training_interrupted',
  'training_evaluated'
));

create function public.record_test_evaluation(
  p_run_id uuid, p_sample_count integer, p_metrics jsonb
) returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_run public.training_runs%rowtype;
  v_confusion jsonb;
  v_name text;
  v_value numeric;
begin
  select * into v_run from public.training_runs where id = p_run_id for update;
  if not found or v_run.created_by is distinct from (select auth.uid())
    or not private.can_train_in_project(v_run.project_id) then
    raise exception 'Evaluación no autorizada' using errcode = '42501';
  end if;
  if v_run.status <> 'running' or v_run.completed_epochs <> v_run.epochs_planned
    or p_sample_count not between 1 and 50000
    or jsonb_typeof(p_metrics) is distinct from 'object'
    or octet_length(p_metrics::text) > 4096
    or (p_metrics->>'problemType') is distinct from v_run.problem_type
    or (p_metrics->>'samples')::integer is distinct from p_sample_count then
    raise exception 'Estado, tamaño o estructura de evaluación inválidos' using errcode = '22023';
  end if;

  if v_run.problem_type = 'binary' then
    foreach v_name in array array['loss','accuracy','precision','recall','f1','threshold'] loop
      if jsonb_typeof(p_metrics->v_name) is distinct from 'number' then
        raise exception 'Falta métrica binaria: %', v_name using errcode = '22023';
      end if;
      v_value := (p_metrics->>v_name)::numeric;
      if v_value < 0 or (v_name <> 'loss' and v_value > 1) or v_value > 1000000000000 then
        raise exception 'Valor binario fuera de rango: %', v_name using errcode = '22023';
      end if;
    end loop;
    if (p_metrics->>'threshold')::numeric <> 0.5 then
      raise exception 'Solo se permite el umbral fijo 0.5 para el MVP' using errcode = '22023';
    end if;
    v_confusion := p_metrics->'confusion';
    if jsonb_typeof(v_confusion) is distinct from 'object' then
      raise exception 'Falta matriz de confusión' using errcode = '22023';
    end if;
    foreach v_name in array array['tp','tn','fp','fn'] loop
      if jsonb_typeof(v_confusion->v_name) is distinct from 'number' then
        raise exception 'Falta contador de confusión: %', v_name using errcode = '22023';
      end if;
      v_value := (v_confusion->>v_name)::numeric;
      if v_value < 0 or v_value > p_sample_count or v_value <> trunc(v_value) then
        raise exception 'Contador de confusión inválido: %', v_name using errcode = '22023';
      end if;
    end loop;
    if (v_confusion->>'tp')::integer + (v_confusion->>'tn')::integer
      + (v_confusion->>'fp')::integer + (v_confusion->>'fn')::integer <> p_sample_count then
      raise exception 'La matriz de confusión no coincide con las muestras de prueba' using errcode = '22023';
    end if;
  else
    foreach v_name in array array['mse','rmse','mae'] loop
      if jsonb_typeof(p_metrics->v_name) is distinct from 'number' then
        raise exception 'Falta métrica de regresión: %', v_name using errcode = '22023';
      end if;
      v_value := (p_metrics->>v_name)::numeric;
      if v_value < 0 or v_value > 1000000000000 then
        raise exception 'Valor de regresión fuera de rango: %', v_name using errcode = '22023';
      end if;
    end loop;
    if p_metrics ? 'r2' and jsonb_typeof(p_metrics->'r2') not in ('number','null') then
      raise exception 'R2 debe ser numérico o nulo' using errcode = '22023';
    end if;
    if jsonb_typeof(p_metrics->'r2') = 'number' and
      abs((p_metrics->>'r2')::numeric) > 1000000000000 then
      raise exception 'R2 fuera de rango' using errcode = '22023';
    end if;
  end if;

  -- Clave primaria única: no hay reescritura ni segunda evaluación del mismo test.
  insert into public.run_evaluations(run_id, project_id, problem_type, sample_count, metrics_json)
    values (p_run_id, v_run.project_id, v_run.problem_type, p_sample_count, p_metrics);
  insert into public.audit_events(actor_id, project_id, action, resource_type, resource_id)
    values ((select auth.uid()), v_run.project_id, 'training_evaluated', 'training_run', p_run_id);
end;
$$;
revoke all on function public.record_test_evaluation(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.record_test_evaluation(uuid,integer,jsonb) to authenticated;
comment on table public.run_evaluations is 'Una evaluación de test por ejecución, sin filas ni predicciones, reportada por cliente autorizado.';
commit;
