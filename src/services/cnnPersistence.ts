/** Persistencia CNN-4B: solo metadatos y métricas agregadas; jamás CSV, píxeles o ejemplos. */
import { supabase } from '../lib/supabase.ts'
import type { CnnEvaluation } from '../ml/cnn/cnnEvaluation.ts'
import type { LocalImageDataset } from '../ml/cnn/localImageCsv.ts'
import type { CnnConfig } from '../ml/cnn/architecture.ts'
import type { CnnEpochMetrics, CnnTrainOptions } from '../ml/cnn/trainingTypes.ts'
import { cnnRunPayload, cnnEvaluationSummary } from '../ml/cnn/persistencePayload.ts'
import { recordBackend, type FinalRunStatus } from './trainingPersistence.ts'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado para guardar las CNN.')
  return supabase
}

export async function createCnnRun(projectId: string, dataset: LocalImageDataset,
  fileSize: number, fileHash: string, config: CnnConfig, options: CnnTrainOptions): Promise<string> {
  const { data, error } = await client().rpc('create_cnn_training_run',
    cnnRunPayload(projectId, dataset, fileSize, fileHash, config, options))
  if (error) throw new Error(`No se pudo crear el entrenamiento CNN: ${error.message}`)
  if (typeof data !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(data)) {
    throw new Error('Supabase no devolvió un identificador de ejecución CNN válido.')
  }
  return data
}

export async function recordCnnRuntime(runId: string, backend: string,
  context: 'worker' | 'main', tfjsVersion: string) {
  await recordBackend(runId, backend, context, tfjsVersion)
}

export async function recordCnnEpoch(runId: string, metrics: CnnEpochMetrics) {
  const { error } = await client().rpc('record_cnn_training_epoch', {
    p_run_id: runId, p_epoch: metrics.epoch,
    p_loss: metrics.loss, p_validation_loss: metrics.validationLoss,
    p_accuracy: metrics.accuracy, p_validation_accuracy: metrics.validationAccuracy,
  })
  if (error) throw new Error(`No se confirmó la época CNN ${metrics.epoch}: ${error.message}`)
}

export async function recordCnnEvaluation(runId: string, evaluation: CnnEvaluation) {
  const { error } = await client().rpc('record_cnn_test_evaluation', {
    p_run_id: runId, p_sample_count: evaluation.sampleCount,
    p_metrics: cnnEvaluationSummary(evaluation),
  })
  if (error) throw new Error(`No se confirmó la evaluación CNN: ${error.message}`)
}

export async function finishCnnRun(runId: string, status: FinalRunStatus,
  durationMs?: number, errorMessage?: string) {
  // Mantiene el contrato original de finalización aprobado en F3.
  const { error } = await client().rpc('finish_training_run', {
    p_run_id: runId, p_status: status, p_duration_ms: durationMs ?? null,
    p_error_summary: errorMessage?.slice(0, 500) ?? null,
  })
  if (error) throw new Error(`No se confirmó la finalización CNN: ${error.message}`)
}
