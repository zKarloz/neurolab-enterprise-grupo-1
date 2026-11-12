import type { ModelArtifactBundle } from '../models/artifacts.ts'
/** GAN-2: protocolo de entrenamiento local, sin persistencia de píxeles ni pesos. */
import type { GanConfig } from './architecture.ts'
import type { GanImageDataset } from './imageDataset.ts'
import type { GanGeneratedBatch, GanSampleCount } from './generation.ts'

export const GAN_ALLOWED_EPOCHS = [2, 5, 10, 20, 30, 50, 100] as const

export interface GanTrainOptions {
  epochs: (typeof GAN_ALLOWED_EPOCHS)[number]
  batchSize: 16 | 32 | 64
  learningRate: 0.0002 | 0.0001
}

export const DEFAULT_GAN_TRAIN_OPTIONS: GanTrainOptions = {
  epochs: 2, batchSize: 16, learningRate: 0.0002,
}

export interface GanEpochMetrics {
  epoch: number
  generatorLoss: number
  discriminatorLoss: number
  realScore: number
  fakeScore: number
}

export type GanTrainingEvent =
  | { type: 'status'; message: string; backend: string; context: 'worker' | 'main'; tfjsVersion: string; images: number }
  | { type: 'batch'; epoch: number; batch: number; batches: number; epochs: number }
  | { type: 'epoch'; metrics: GanEpochMetrics }
  | { type: 'completed'; backend: string; epochsCompleted: number; durationMs: number }
  | { type: 'cancelled' }
  | { type: 'error'; message: string }

export type GanWorkerCommand =
  | { type: 'start'; dataset: GanImageDataset; config: GanConfig; options: GanTrainOptions }
  | { type: 'cancel' }
  | { type: 'generate'; requestId: number; count: GanSampleCount }
  | { type: 'export-model'; requestId: number }

/** Limita la duración de entrenamientos GAN densos locales, evitando valores arbitrarios. */
export function validateGanTrainOptions(options: GanTrainOptions): void {
  if (!GAN_ALLOWED_EPOCHS.includes(options.epochs)) throw new Error('GAN admite 2, 5, 10, 20, 30, 50 o 100 épocas.')
  if (![16, 32, 64].includes(options.batchSize)) throw new Error('GAN-2 admite batch de 16, 32 o 64 imágenes.')
  if (![0.0002, 0.0001].includes(options.learningRate)) throw new Error('Learning rate GAN-2 no permitido.')
}

/** Nunca sustituir pérdidas ausentes/NaN por valores de muestra. */
export function validateGanEpochMetrics(metrics: GanEpochMetrics): GanEpochMetrics {
  if (!Number.isSafeInteger(metrics.epoch) || metrics.epoch < 1) throw new Error('Época GAN inválida.')
  for (const key of ['generatorLoss', 'discriminatorLoss', 'realScore', 'fakeScore'] as const) {
    if (!Number.isFinite(metrics[key])) throw new Error(`GAN-2: métrica ${key} no finita.`)
  }
  if (metrics.generatorLoss < 0 || metrics.discriminatorLoss < 0) throw new Error('Pérdidas GAN no válidas.')
  if (metrics.realScore < 0 || metrics.realScore > 1 || metrics.fakeScore < 0 || metrics.fakeScore > 1) {
    throw new Error('Probabilidades del discriminador fuera de rango.')
  }
  return metrics
}

/** Respuestas de generación correlacionadas con una petición; no son métricas de entrenamiento. */
export type GanGenerationReply =
  | { type: 'generated'; requestId: number; batch: GanGeneratedBatch }
  | { type: 'generation-error'; requestId: number; message: string }

/** GAN-4C: exportación única del generador, nunca del discriminador. */
export type GanExportReply =
  | { type: 'model-exported'; requestId: number; bundle: ModelArtifactBundle }
  | { type: 'model-export-error'; requestId: number; message: string }
