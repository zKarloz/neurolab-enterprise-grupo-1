/** GAN-4A: contrato puro de persistencia preparado para GAN-4B.
 * No invoca Supabase ni incluye archivos, píxeles o imágenes generadas.
 */
import { describeGan, type GanConfig } from './architecture.ts'
import { validateGanTrainingData } from './trainingData.ts'
import { validateGanTrainOptions, type GanTrainOptions, type GanEpochMetrics } from './trainingTypes.ts'
import { summarizeGanGeneratedBatch, type GanGeneratedBatch } from './generation.ts'
import type { GanImageDataset } from './imageDataset.ts'

export interface GanSourceIdentity {
  name: string
  byteSize: number
  /** SHA-256 del archivo CSV original completo; nunca del buffer de imágenes reducido. */
  sha256: string
}

/** Contrato de RPC: el seed=0 significa no fijado, no reproducibilidad inventada. */
export function ganRunPayload(projectId: string, source: GanSourceIdentity,
  dataset: GanImageDataset, architecture: GanConfig, options: GanTrainOptions) {
  validateGanTrainingData(dataset, architecture)
  validateGanTrainOptions(options)
  const shape = describeGan(architecture, dataset.dimension)
  if (shape.errors.length) throw new Error(shape.errors.join(' '))
  if (!/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(projectId)) {
    throw new Error('Identificador de proyecto GAN inválido.')
  }
  if (!source.name.toLowerCase().endsWith('.csv') || source.name.length < 1 || source.name.length > 180
    || !Number.isSafeInteger(source.byteSize) || source.byteSize < 1 || source.byteSize > 200_000_000
    || !/^[0-9a-f]{64}$/.test(source.sha256)) {
    throw new Error('Metadatos o SHA-256 del CSV GAN inválidos.')
  }
  return {
    p_project_id: projectId,
    p_dataset_name: source.name,
    p_row_count: dataset.count,
    p_byte_size: source.byteSize,
    p_file_hash: source.sha256,
    p_schema_json: {
      kind: 'gan_grayscale_csv_v1', dimension: dataset.dimension,
      pixelCount: shape.imagePixels, imageCount: dataset.count,
      originalScale: dataset.originalScale, hadLabels: dataset.hadLabels,
      truncated: dataset.truncated,
    },
    p_preprocessing_json: {
      family: 'gan', kind: 'gan_grayscale_csv_v1',
      dimension: dataset.dimension, channels: 1, pixelRange: 'zero_to_255',
      normalization: 'tanh_minus1_plus1', latentSize: architecture.latentSize,
      unconditional: true, trainedImages: dataset.count, seedMode: 'unseeded',
    },
    p_architecture_config: {
      family: 'gan', kind: 'dense_unconditional_v1', dimension: dataset.dimension,
      latentSize: architecture.latentSize, generatorUnits: architecture.generatorUnits,
      discriminatorUnits: architecture.discriminatorUnits,
    },
    p_hyperparameters_json: {
      optimizer: 'adam', epochs: options.epochs, batchSize: options.batchSize,
      learningRate: options.learningRate, noiseDistribution: 'normal_unseeded',
    },
    p_seed: 0,
    p_app_version: '0.1.0',
  }
}

/** Cuatro indicadores reales por época, con el mismo nombre que usa la RPC. */
export function ganEpochPayload(runId: string, metrics: GanEpochMetrics) {
  return {
    p_run_id: runId, p_epoch: metrics.epoch,
    p_generator_loss: metrics.generatorLoss, p_discriminator_loss: metrics.discriminatorLoss,
    p_real_score: metrics.realScore, p_fake_score: metrics.fakeScore,
  }
}

/** Resumen de generación descriptivo, no evaluación científica ni datos individuales. */
export function ganGenerationSummaryPayload(runId: string, generated: GanGeneratedBatch) {
  const stats = summarizeGanGeneratedBatch(generated)
  return {
    p_run_id: runId,
    p_sample_count: generated.count,
    p_metrics: {
      family: 'gan', kind: 'descriptive_only', sampleCount: generated.count,
      dimension: generated.dimension, ...stats,
    },
  }
}
