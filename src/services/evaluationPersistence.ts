import { supabase } from '../lib/supabase'
import type { TestEvaluation } from '../ml/evaluation/metrics.ts'
import type { EpochMetrics } from '../ml/training/types.ts'
import { assembleHistoryMetrics } from '../ml/evaluation/history.ts'
import type { TrainingProblemType, TrainingFamily, FamilyFilter } from '../ml/evaluation/families.ts'
import { parseCnnStoredEvaluation, type CnnStoredEvaluation } from '../ml/evaluation/cnnStoredEvaluation.ts'
import { parseRnnStoredEvaluation, type RnnStoredEvaluation } from '../ml/evaluation/rnnStoredEvaluation.ts'
import { assembleGanHistoryEpochs, parseGanStoredEvaluation, type GanStoredEvaluation } from '../ml/evaluation/ganStoredEvaluation.ts'
import type { GanEpochMetrics } from '../ml/gan/trainingTypes.ts'

export interface HistoryRun {
  id: string
  status: string
  family: TrainingFamily
  ganDimension: number | null
  problem_type: TrainingProblemType
  completed_epochs: number
  epochs_planned: number
  backend: string | null
  created_at: string
  ended_at: string | null
}
export interface HistoryPage { items: HistoryRun[]; total: number }
export const HISTORY_PAGE_SIZE = 8
export type StoredEvaluation = TestEvaluation | CnnStoredEvaluation | RnnStoredEvaluation | GanStoredEvaluation
export type HistoryDetail = { epochs: EpochMetrics[]; ganEpochs: GanEpochMetrics[]; evaluation: StoredEvaluation | null }

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

/** Paginación en PostgreSQL con JOIN real: la familia no se infiere de problem_type.
 * La relación architectures!inner distingue GAN y evita etiquetar una RNN como Feedforward.
 * Los permisos de lectura dependen siempre de las políticas RLS del servidor.
 */
export async function listHistoryPage(projectId: string, page: number, family: FamilyFilter = 'all'): Promise<HistoryPage> {
  if (!Number.isInteger(page) || page < 1) throw new Error('Página de historial inválida.')
  if (!['all', 'feedforward', 'cnn', 'rnn', 'gan'].includes(family)) throw new Error('Familia de historial inválida.')
  const start = (page - 1) * HISTORY_PAGE_SIZE
  let query = client().from('training_runs')
    .select('id,status,problem_type,completed_epochs,epochs_planned,backend,created_at,ended_at,preprocessing_json,architectures!inner(family)', { count: 'exact' })
    .eq('project_id', projectId)
    .in('architectures.family', ['feedforward', 'cnn', 'rnn', 'gan'])
  // El filtro se ejecuta en DB ANTES de .range; RNN comparte tareas con otras familias.
  if (family !== 'all') query = query.eq('architectures.family', family)
  const { data, error, count } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(start, start + HISTORY_PAGE_SIZE - 1)
  if (error) throw new Error(`No se pudo consultar el historial: ${error.message}`)
  // PostgREST devuelve un objeto de arquitectura por la FK many-to-one.
  type JoinedRun = Omit<HistoryRun, 'family' | 'ganDimension'> & {
    preprocessing_json: Record<string, unknown> | null
    architectures: { family: string } | null
  }
  const rows = (data ?? []) as unknown as JoinedRun[]
  const items = rows.map(({ architectures, preprocessing_json, ...run }) => {
    const actualFamily: unknown = architectures?.family
    if (actualFamily !== 'feedforward' && actualFamily !== 'cnn' && actualFamily !== 'rnn' && actualFamily !== 'gan') {
      throw new Error('Una ejecución no tiene familia de arquitectura reconocida.')
    }
    return { ...run, family: actualFamily,
      ganDimension: actualFamily === 'gan' && typeof preprocessing_json?.dimension === 'number'
        ? preprocessing_json.dimension : null,
    } as HistoryRun
  })
  return { items, total: count ?? 0 }
}

type MetricRow = { epoch: number; split: string; metric_name: string; metric_value: number }

export async function loadHistoryDetail(runId: string, problemType: TrainingProblemType, family: TrainingFamily): Promise<HistoryDetail> {
  const [metrics, evaluations] = await Promise.all([
    client().from('training_metrics').select('epoch,split,metric_name,metric_value').eq('run_id', runId)
      .order('epoch', { ascending: true }).limit(family === 'gan' ? 420 : 250),
    client().from('run_evaluations').select('metrics_json').eq('run_id', runId).maybeSingle(),
  ])
  if (metrics.error) throw new Error(`No se pudieron leer las métricas: ${metrics.error.message}`)
  if (evaluations.error) throw new Error(`No se pudo leer la evaluación: ${evaluations.error.message}`)
  const raw: unknown = evaluations.data?.metrics_json
  // La misma tarea puede guardar JSON distintos según familia; no usar solo problem_type.
  const evaluation = raw === null || raw === undefined ? null
    : family === 'gan' ? parseGanStoredEvaluation(raw)
    : family === 'rnn' ? parseRnnStoredEvaluation(raw)
    : family === 'cnn' ? parseCnnStoredEvaluation(raw)
    : typeof raw === 'object' && 'problemType' in raw && raw.problemType === problemType
      ? raw as TestEvaluation : null
  if (evaluation && 'problemType' in evaluation && evaluation.problemType !== problemType) throw new Error('Evaluación con tipo de problema inconsistente.')
  const rows = (metrics.data ?? []) as MetricRow[]
  if (family === 'gan') {
    if (problemType !== 'generative') throw new Error('Familia GAN con tipo de problema inconsistente.')
    return { epochs: [], ganEpochs: assembleGanHistoryEpochs(rows), evaluation }
  }
  return { epochs: assembleHistoryMetrics(rows, problemType), ganEpochs: [], evaluation }
}
