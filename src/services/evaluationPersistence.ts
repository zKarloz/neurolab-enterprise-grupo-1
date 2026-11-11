import { supabase } from '../lib/supabase'
import type { TestEvaluation } from '../ml/evaluation/metrics.ts'
import type { EpochMetrics } from '../ml/training/types.ts'
import { assembleHistoryMetrics } from '../ml/evaluation/history.ts'
import type { TrainingProblemType, FamilyFilter } from '../ml/evaluation/families.ts'
import { parseCnnStoredEvaluation, type CnnStoredEvaluation } from '../ml/evaluation/cnnStoredEvaluation.ts'

export interface HistoryRun {
  id: string
  status: string
  problem_type: TrainingProblemType
  completed_epochs: number
  epochs_planned: number
  backend: string | null
  created_at: string
  ended_at: string | null
}
export interface HistoryPage { items: HistoryRun[]; total: number }
export const HISTORY_PAGE_SIZE = 8
export type StoredEvaluation = TestEvaluation | CnnStoredEvaluation
export type HistoryDetail = { epochs: EpochMetrics[]; evaluation: StoredEvaluation | null }

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

/** La RPC valida autor, proyecto, estado, conteo y exclusividad de la evaluación. */
export async function persistTestEvaluation(runId: string, evaluation: TestEvaluation): Promise<void> {
  const { error } = await client().rpc('record_test_evaluation', {
    p_run_id: runId,
    p_sample_count: evaluation.samples,
    p_metrics: evaluation,
  })
  if (error) throw new Error(`No se confirmó la evaluación de prueba: ${error.message}`)
}

/** La paginación se hace en PostgreSQL, sin cargar todos los runs. RLS filtra el resultado. */
export async function listHistoryPage(projectId: string, page: number, family: FamilyFilter = 'all'): Promise<HistoryPage> {
  if (!Number.isInteger(page) || page < 1) throw new Error('Página de historial inválida.')
  const start = (page - 1) * HISTORY_PAGE_SIZE
  if (!['all', 'feedforward', 'cnn'].includes(family)) throw new Error('Familia de historial inválida.')
  let query = client().from('training_runs')
    .select('id,status,problem_type,completed_epochs,epochs_planned,backend,created_at,ended_at', { count: 'exact' })
    .eq('project_id', projectId)
  // En el alcance aprobado: CNN=multiclass, Feedforward=binary/regression.
  // Se filtra ANTES de paginar para mantener totales de PostgreSQL exactos.
  if (family === 'cnn') query = query.eq('problem_type', 'multiclass')
  else if (family === 'feedforward') query = query.in('problem_type', ['binary', 'regression'])
  const { data, error, count } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(`No se pudo consultar el historial: ${error.message}`)
  return { items: (data ?? []) as HistoryRun[], total: count ?? 0 }
}

type MetricRow = { epoch: number; split: string; metric_name: string; metric_value: number }

export async function loadHistoryDetail(runId: string, problemType: TrainingProblemType): Promise<HistoryDetail> {
  const [metrics, evaluations] = await Promise.all([
    client().from('training_metrics').select('epoch,split,metric_name,metric_value').eq('run_id', runId)
      .order('epoch', { ascending: true }).limit(250),
    client().from('run_evaluations').select('metrics_json').eq('run_id', runId).maybeSingle(),
  ])
  if (metrics.error) throw new Error(`No se pudieron leer las métricas: ${metrics.error.message}`)
  if (evaluations.error) throw new Error(`No se pudo leer la evaluación: ${evaluations.error.message}`)
  const raw: unknown = evaluations.data?.metrics_json
  const evaluation = problemType === 'multiclass' && raw
    ? parseCnnStoredEvaluation(raw)
    : raw && typeof raw === 'object' && 'problemType' in raw && raw.problemType === problemType
      ? raw as TestEvaluation : null
  return { epochs: assembleHistoryMetrics((metrics.data ?? []) as MetricRow[], problemType), evaluation }
}
