/** RNN-4B: adaptadores a RPC existentes; no se envían CSV, ventanas o ejemplos. */
import { supabase } from '../lib/supabase.ts'
import type { RawTable } from '../ml/preprocessing/types.ts'
import type { RnnDatasetOptions } from '../ml/rnn/sequenceDataset.ts'
import type { RnnConfig } from '../ml/rnn/architecture.ts'
import type { RnnTrainOptions, RnnEpochMetrics } from '../ml/rnn/trainingTypes.ts'
import type { RnnPreparedData } from '../ml/rnn/trainingData.ts'
import type { RnnTestEvaluation } from '../ml/rnn/evaluation.ts'
import { rnnRunPayload, rnnEvaluationSummary } from '../ml/rnn/persistencePayload.ts'
import { recordBackend, type FinalRunStatus } from './trainingPersistence.ts'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado para guardar las ejecuciones RNN.')
  return supabase
}

export async function createRnnRun(projectId: string, name: string, size: number, hash: string,
  table: RawTable, dataset: RnnDatasetOptions, architecture: RnnConfig,
  options: RnnTrainOptions, prepared: RnnPreparedData): Promise<string> {
  const { data, error } = await client().rpc('create_rnn_training_run',
    rnnRunPayload(projectId, name, size, hash, table, dataset, architecture, options, prepared))
  if (error) throw new Error(`No se pudo registrar la ejecución RNN: ${error.message}`)
  if (typeof data !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data)) {
    throw new Error('Supabase no confirmó un identificador RNN válido.')
  }
  return data
}

/** La RPC F3 conserva el estado `created` → `running` y verifica al autor. */
export async function recordRnnRuntime(runId: string, backend: string,
  context: 'worker' | 'main', tfjsVersion: string): Promise<void> {
  await recordBackend(runId, backend, context, tfjsVersion)
}

export async function recordRnnEpoch(runId: string, metrics: RnnEpochMetrics): Promise<void> {
  const { error } = await client().rpc('record_rnn_training_epoch', {
    p_run_id: runId, p_epoch: metrics.epoch,
    p_loss: metrics.loss, p_validation_loss: metrics.validationLoss,
    p_metric: metrics.metric, p_validation_metric: metrics.validationMetric,
  })
  if (error) throw new Error(`No se confirmó la época RNN ${metrics.epoch}: ${error.message}`)
}

export async function recordRnnEvaluation(runId: string, problemType: RnnDatasetOptions['problemType'],
  evaluation: RnnTestEvaluation): Promise<void> {
  const { error } = await client().rpc('record_rnn_test_evaluation', {
    p_run_id: runId, p_sample_count: evaluation.count,
    p_metrics: rnnEvaluationSummary(problemType, evaluation),
  })
  if (error) throw new Error(`No se confirmó la evaluación RNN: ${error.message}`)
}

export async function finishRnnRun(runId: string, status: FinalRunStatus,
  durationMs?: number, errorMessage?: string): Promise<void> {
  const { error } = await client().rpc('finish_training_run', {
    p_run_id: runId, p_status: status,
    p_duration_ms: durationMs ?? null, p_error_summary: errorMessage?.slice(0, 500) ?? null,
  })
  if (error) throw new Error(`No se pudo confirmar la finalización RNN: ${error.message}`)
}
