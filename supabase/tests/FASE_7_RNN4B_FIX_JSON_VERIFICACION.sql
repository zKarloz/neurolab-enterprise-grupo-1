-- RNN-4B / Verificacion 015 de solo lectura: NO inserta ni actualiza filas.
-- Esperado: una fila, json_parentheses_correct=true, security_definer=true,
-- anon_execute=false, authenticated_execute=true.
select p.proname as funcion,
       position('(p_architecture_config->''input'') - array[' in p.prosrc) > 0
         as json_parentheses_correct,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_catalog.pg_proc p
where p.oid = 'public.create_rnn_training_run(uuid,text,jsonb,integer,integer,text,jsonb,jsonb,jsonb,integer,text)'::regprocedure;

-- Esperado: las siete tablas siguen con RLS activo (true).
select tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
  and tablename in ('architectures','datasets','training_runs','training_metrics',
                    'run_evaluations','models','model_versions')
order by tablename;

-- Conteos de ejecuciones RNN, no incluye datos de sensores ni predicciones individuales.
select r.status, count(*) as ejecuciones
from public.training_runs r
join public.architectures a on a.id = r.architecture_id and a.family = 'rnn'
group by r.status
order by r.status;
