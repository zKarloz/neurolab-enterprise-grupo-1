/**
 * Entrenamiento CNN-2 en memoria con dataset local. Se ejecuta preferentemente dentro del Worker;
 * en navegadores sin Worker se usa el hilo principal con callbacks cooperativos.
 * No persiste datos ni envía imágenes a Supabase.
 */
import * as tf from '@tensorflow/tfjs'
import { describeCnn, type CnnConfig, type CnnInputShape } from './architecture.ts'
import { splitLocalImageIndices, type LocalImageDataset } from './localImageCsv.ts'
import { readCnnEpochMetrics, validateCnnTrainOptions, type CnnTrainingEvent, type CnnTrainOptions } from './trainingTypes.ts'

/** Construye exactamente las mismas capas y dimensiones que el diagrama CNN-1. */
export function buildCnnModel(config: CnnConfig, input: CnnInputShape): tf.Sequential {
  const diagram = describeCnn(config, input)
  if (diagram.errors.length) throw new Error(diagram.errors.join(' '))
  const model = tf.sequential()
  for (const [index, block] of config.blocks.entries()) {
    model.add(tf.layers.conv2d({
      ...(index === 0 ? { inputShape: [input.height, input.width, input.channels] } : {}),
      filters: block.filters, kernelSize: [block.kernel, block.kernel],
      strides: [1, 1], padding: block.padding, activation: 'relu', useBias: true,
    }))
    if (block.pool) model.add(tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2], padding: 'valid' }))
  }
  model.add(tf.layers.flatten())
  model.add(tf.layers.dense({ units: config.denseUnits, activation: 'relu' }))
  model.add(tf.layers.dense({ units: input.classes, activation: 'softmax' }))
  if (model.countParams() !== diagram.parameterCount) {
    model.dispose()
    throw new Error('Las dimensiones o parámetros del motor no coinciden con el diagrama CNN.')
  }
  return model
}

/** Crea tensores normalizados y etiquetas one-hot solo para la sesión actual. */
function tensorsForPartition(pixels: Uint8Array, labels: Uint8Array, indices: number[], input: CnnInputShape) {
  const area = input.height * input.width * input.channels
  const floats = new Float32Array(indices.length * area)
  const digits = new Int32Array(indices.length)
  indices.forEach((source, position) => {
    const start = source * area
    const offset = position * area
    for (let pixel = 0; pixel < area; pixel++) floats[offset + pixel] = pixels[start + pixel] / 255
    digits[position] = labels[source]
  })
  const images = tf.tensor4d(floats, [indices.length, input.height, input.width, input.channels])
  const targets = tf.tidy(() => tf.oneHot(tf.tensor1d(digits, 'int32'), input.classes))
  return { images, targets }
}

/** El motor libera pesos, métricas y tensores incluso cuando el usuario cancela. */
export async function trainCnnModel(
  config: CnnConfig, options: CnnTrainOptions, emit: (event: CnnTrainingEvent) => void,
  cancelled: () => boolean, signal: AbortSignal, environment: 'worker' | 'main', dataset: LocalImageDataset,
): Promise<void> {
  validateCnnTrainOptions(options)
  const input: CnnInputShape = { width: dataset.width, height: dataset.height, channels: dataset.channels, classes: dataset.classNames.length }
  if (describeCnn(config, input).errors.length) throw new Error('Arquitectura CNN inválida para el dataset seleccionado.')
  if (options.samples > dataset.count) throw new Error('La muestra solicitada supera las imágenes cargadas.')
  const started = Date.now()
  let model: tf.Sequential | null = null
  let train: ReturnType<typeof tensorsForPartition> | null = null
  let validation: ReturnType<typeof tensorsForPartition> | null = null
  let epochsCompleted = 0
  try {
    if (environment === 'worker') await tf.setBackend('cpu')
    await tf.ready()
    const backend = tf.getBackend()
    if (cancelled()) { emit({ type: 'cancelled' }); return }
    emit({ type: 'status', stage: 'prepare', message: 'Preparando imágenes locales…', backend })
    if (signal.aborted) { emit({ type: 'cancelled' }); return }
    // Se trabaja solo con la cantidad elegida; el archivo original nunca se envía al servidor.
    const area = input.height * input.width
    const pixels = dataset.pixels.subarray(0, area * options.samples)
    const labels = dataset.labels.subarray(0, options.samples)
    emit({ type: 'status', stage: 'prepare', message: 'Normalizando píxeles y separando entrenamiento/validación…', backend })
    const split = splitLocalImageIndices(labels, input.classes, 42)
    train = tensorsForPartition(pixels, labels, split.train, input)
    validation = tensorsForPartition(pixels, labels, split.validation, input)
    if (cancelled()) { emit({ type: 'cancelled' }); return }
    model = buildCnnModel(config, input)
    model.compile({ optimizer: tf.train.adam(options.learningRate), loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
    const batches = Math.ceil(split.train.length / options.batchSize)
    emit({ type: 'status', stage: 'fit', message: 'Entrenamiento real en progreso…', backend, trainingCount: split.train.length, validationCount: split.validation.length })
    await model.fit(train.images, train.targets, {
      epochs: options.epochs, batchSize: options.batchSize, validationData: [validation.images, validation.targets],
      shuffle: true, verbose: 0, yieldEvery: 'batch',
      callbacks: {
        onBatchEnd: async (batch) => {
          if (cancelled() && model) model.stopTraining = true
          if (batch % 3 === 0 || batch + 1 === batches) {
            emit({ type: 'batch', epoch: epochsCompleted + 1, batch: batch + 1, batches, epochs: options.epochs })
          }
          // Permite que el hilo principal/Worker procese el mensaje de cancelación.
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          if (cancelled() && model) model.stopTraining = true
        },
        onEpochEnd: async (index, logs) => {
          epochsCompleted = index + 1
          if (!cancelled()) emit({ type: 'epoch', metrics: readCnnEpochMetrics(index + 1, (logs ?? {}) as Record<string, number | undefined>) })
          if (cancelled() && model) model.stopTraining = true
        },
      },
    })
    if (cancelled()) emit({ type: 'cancelled' })
    else emit({ type: 'completed', durationMs: Date.now() - started, backend, epochsCompleted })
  } catch (error) {
    if (cancelled() || signal.aborted) emit({ type: 'cancelled' })
    else emit({ type: 'error', message: error instanceof Error ? error.message : 'Error desconocido entrenando CNN.' })
  } finally {
    train?.images.dispose(); train?.targets.dispose()
    validation?.images.dispose(); validation?.targets.dispose()
    model?.dispose()
  }
}
