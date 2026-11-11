/** Contrato compartido entre el Worker de CNN, el motor y la pantalla React. */
import type { CnnConfig } from './architecture.ts'
import type { LocalImageDataset } from './localImageCsv.ts'
import type { CnnEvaluation } from './cnnEvaluation.ts'
import type { ModelArtifactBundle } from '../models/artifacts.ts'

export interface CnnTrainOptions {
  samples: number
  epochs: 2 | 5 | 10
  batchSize: 16 | 32 | 64
  learningRate: 0.001 | 0.0005
}

export const DEFAULT_CNN_TRAIN_OPTIONS: CnnTrainOptions = {
  samples: 500, epochs: 2, batchSize: 32, learningRate: 0.001,
}
export interface CnnEpochMetrics {
  epoch: number
  loss: number
  accuracy: number
  validationLoss: number
  validationAccuracy: number
}

export type CnnTrainingEvent =
  | { type: 'status'; stage: 'download' | 'prepare' | 'fit' | 'evaluate'; message: string; backend?: string; context?: 'worker' | 'main'; tfjsVersion?: string; trainingCount?: number; validationCount?: number; testCount?: number }
  | { type: 'batch'; epoch: number; batch: number; batches: number; epochs: number }
  | { type: 'epoch'; metrics: CnnEpochMetrics }
  | { type: 'evaluated'; report: CnnEvaluation }
  | { type: 'completed'; durationMs: number; backend: string; epochsCompleted: number }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }
  | { type: 'prediction'; requestId: number; probabilities: number[] }
  | { type: 'prediction-error'; requestId: number; message: string }
  | { type: 'model-exported'; requestId: number; bundle: ModelArtifactBundle }
  | { type: 'model-export-error'; requestId: number; message: string }

export type CnnWorkerCommand =
  | { type: 'start'; config: CnnConfig; options: CnnTrainOptions; dataset: LocalImageDataset }
  | { type: 'cancel' }
  | { type: 'predict'; requestId: number; pixels: Uint8Array }
  | { type: 'export-model'; requestId: number }

/** Rechazo preventivo de solicitudes fuera de los límites de memoria establecidos. */
export function validateCnnTrainOptions(options: CnnTrainOptions) {
  if (!Number.isInteger(options.samples) || options.samples < 100 || options.samples > 2000) throw new Error('Selecciona entre 100 y 2 000 imágenes locales.')
  if (![2, 5, 10].includes(options.epochs)) throw new Error('Épocas fuera del límite permitido.')
  if (![16, 32, 64].includes(options.batchSize)) throw new Error('Batch size no admitido.')
  if (![0.001, 0.0005].includes(options.learningRate)) throw new Error('Learning rate no admitido.')
}

/** Las métricas provienen de TensorFlow.js; no se inventan ni sustituyen por cero. */
export function readCnnEpochMetrics(epoch: number, logs: Record<string, number | undefined>): CnnEpochMetrics {
  const metrics = {
    epoch,
    loss: logs.loss,
    accuracy: logs.acc ?? logs.accuracy ?? logs.categoricalAccuracy,
    validationLoss: logs.val_loss,
    validationAccuracy: logs.val_acc ?? logs.val_accuracy ?? logs.val_categoricalAccuracy,
  }
  if (Object.values(metrics).some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error('TensorFlow.js no devolvió todas las métricas reales esperadas.')
  }
  return metrics as CnnEpochMetrics
}
