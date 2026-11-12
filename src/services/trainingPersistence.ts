import { supabase } from '../lib/supabase'
import type { DenseTrainConfig } from '../ml/networks/config.ts'
import type { LocalCsvMetadata } from '../ml/preprocessing/fileMetadata.ts'
import type { PreparedDataset } from '../ml/preprocessing/types.ts'
import type { EpochMetrics, TrainingSummary } from '../ml/training/types.ts'

export type FinalRunStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface RecentRun {
  id: string
  status: string
  completed_epochs: number
  epochs_planned: number
  backend: string | null
  created_at: string
  ended_at: string | null
}

/** Toda escritura requiere Supabase y confirmación real de la RPC; no se usa localStorage como BD. */
function client() {
  if (!supabase) throw new Error('Supabase no está configurado para guardar los entrenamientos.')
  return supabase
}

export async function createPersistedRun(
  projectId: string,
  csv: LocalCsvMetadata,
  dataset: PreparedDataset,
  config: DenseTrainConfig,
): Promise<string> {
  // Se persiste únicamente el manifest ajustado sobre train, jamás los arrays X/Y.
  const { data, error } = await client().rpc('create_training_run', {
    p_project_id: projectId,
    p_dataset_name: csv.name,
    p_schema_json: csv.schema,
    p_target_column: dataset.manifest.targetColumn,
    p_problem_type: dataset.manifest.problemType,
    p_row_count: csv.rowCount,
    p_byte_size: csv.byteSize,
    p_file_hash: csv.fileHash,
    p_preprocessing_json: dataset.manifest,
    p_architecture_config: {
      family: 'feedforward', kind: 'dense',
      inputFeatures: dataset.manifest.featureNames.length,
      hiddenLayers: config.hiddenLayers,
      outputUnits: 1,
      outputActivation: dataset.manifest.problemType === 'binary' ? 'sigmoid' : 'linear',
    },
    p_hyperparameters_json: {
      epochs: config.epochs, batchSize: config.batchSize,
      learningRate: config.learningRate, optimizer: 'adam', seed: config.seed,
    },
    p_seed: config.seed,
    p_app_version: '0.1.0',
  })
  if (error) throw new Error(`No se pudo registrar la ejecución: ${error.message}`)
  if (typeof data !== 'string' || !/^[\da-f-]{36}$/i.test(data)) {
    throw new Error('Supabase no confirmó el identificador de la ejecución.')
  }
  return data
}

export async function recordBackend(
  runId: string,
  backend: string,
  context: string,
  tfjsVersion: string,
): Promise<void> {
  const { error } = await client().rpc('set_training_runtime', {
    p_run_id: runId, p_backend: backend, p_context: context, p_tfjs_version: tfjsVersion,
  })
  if (error) throw new Error(`No se pudo guardar el backend: ${error.message}`)
}

export async function recordEpoch(runId: string, metrics: EpochMetrics): Promise<void> {
  const { error } = await client().rpc('record_training_epoch', {
    p_run_id: runId, p_epoch: metrics.epoch,
    p_loss: metrics.loss, p_validation_loss: metrics.validationLoss,
    p_metric: metrics.metric, p_validation_metric: metrics.validationMetric,
  })
  if (error) throw new Error(`No se pudo guardar la época ${metrics.epoch}: ${error.message}`)
}

export async function finalizeRun(
  runId: string,
  status: FinalRunStatus,
  summary?: TrainingSummary | null,
  errorSummary?: string,
): Promise<void> {
  const { error } = await client().rpc('finish_training_run', {
    p_run_id: runId, p_status: status,
    p_duration_ms: summary?.durationMs ?? null,
    p_error_summary: errorSummary?.slice(0, 500) ?? null,
  })
  if (error) throw new Error(`No se pudo confirmar el estado final: ${error.message}`)
}

/** Vista mínima de verificación de F3. La pantalla de historial completo pertenece a F4. */
export async function listRecentRuns(projectId: string): Promise<RecentRun[]> {
  const { data, error } = await client()
    .from('training_runs')
    .select('id,status,completed_epochs,epochs_planned,backend,created_at,ended_at,architectures!inner(family)')
    .eq('project_id', projectId)
    // El panel Feedforward no debe mezclar por ahora ejecuciones CNN multiclase.
    .in('problem_type', ['binary', 'regression'])
    .eq('architectures.family', 'feedforward')
    .order('created_at', { ascending: false })
    .limit(8)
  if (error) throw new Error(`No se pudieron recuperar las ejecuciones: ${error.message}`)
  return (data ?? []) as RecentRun[]
}
