/** Protocolo serializable UI ↔ Worker RNN-2. No transmite datos a Supabase. */
import type { RawTable } from '../preprocessing/types.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'
import type { RnnConfig } from './architecture.ts'
import type { RnnTestEvaluation } from './evaluation.ts'
import type { RnnInferenceResult } from './inference.ts'
import type { ModelArtifactBundle } from '../models/artifacts.ts'

export interface RnnTrainOptions {
  epochs: 2 | 5 | 10
  batchSize: 8 | 16 | 32
  learningRate: 0.001 | 0.0005
}
export const DEFAULT_RNN_TRAIN_OPTIONS: RnnTrainOptions = { epochs: 2, batchSize: 8, learningRate: 0.001 }
export interface RnnEpochMetrics {
  epoch: number
  loss: number
  metric: number
  validationLoss: number
  validationMetric: number
}
export type RnnTrainingEvent =
  | { type: 'status'; message: string; backend: string; context: 'worker' | 'main'; tfjsVersion: string; trainingCount: number; validationCount: number; testCount: number }
  | { type: 'batch'; epoch: number; batch: number; batches: number; epochs: number }
  | { type: 'epoch'; metrics: RnnEpochMetrics }
  | { type: 'evaluation'; result: RnnTestEvaluation }
  | { type: 'completed'; durationMs: number; backend: string; epochsCompleted: number }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
export type RnnWorkerCommand =
  | { type: 'start'; table: RawTable; datasetOptions: RnnDatasetOptions; config: RnnConfig; options: RnnTrainOptions }
  | { type: 'cancel' }
  | { type: 'predict'; requestId: number; seriesId: string }
  | { type: 'export-model'; requestId: number }

export type RnnPredictionReply =
  | { type: 'prediction'; requestId: number; result: RnnInferenceResult }
  | { type: 'prediction_error'; requestId: number; message: string }
  | { type: 'model-exported'; requestId: number; bundle: ModelArtifactBundle }
  | { type: 'model-export-error'; requestId: number; message: string }

export function validateRnnTrainOptions(options: RnnTrainOptions) {
  if (![2, 5, 10].includes(options.epochs)) throw new Error('Épocas fuera del rango RNN-2.')
  if (![8, 16, 32].includes(options.batchSize)) throw new Error('Batch size RNN-2 no permitido.')
  if (![0.001, 0.0005].includes(options.learningRate)) throw new Error('Learning rate RNN-2 no permitido.')
}
export function readRnnEpochMetrics(epoch: number, logs: Record<string, number | undefined>, regression: boolean): RnnEpochMetrics {
  const data = {
    epoch, loss: logs.loss,
    metric: regression ? logs.mae ?? logs.meanAbsoluteError : logs.acc ?? logs.accuracy,
    validationLoss: logs.val_loss,
    validationMetric: regression ? logs.val_mae ?? logs.val_meanAbsoluteError : logs.val_acc ?? logs.val_accuracy,
  }
  if (Object.values(data).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('TensorFlow.js no devolvió métricas válidas completas para la época.')
  }
  return data as RnnEpochMetrics
}
