/**
 * CNN-3: entrenamiento y evaluación sobre particiones separadas, sin Supabase.
 * El modelo entrenado se conserva exclusivamente durante la sesión de la página
 * para poder predecir, y se libera al reiniciar, cambiar datos o abandonar CNN.
 */
import * as tf from '@tensorflow/tfjs'
import { describeCnn, type CnnConfig, type CnnInputShape } from './architecture.ts'
import { type LocalImageDataset } from './localImageCsv.ts'
import { computeCnnEvaluation, splitCnnHoldoutIndices, type CnnEvaluation, type CnnTestSample } from './cnnEvaluation.ts'
import { readCnnEpochMetrics, validateCnnTrainOptions, type CnnTrainingEvent, type CnnTrainOptions } from './trainingTypes.ts'

export interface TrainedCnnRuntime {
  predict: (pixels: Uint8Array) => Promise<number[]>
  dispose: () => void
}

/** Construye las mismas capas y dimensiones mostradas por el diagrama CNN-1. */
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
    throw new Error('Los parámetros del motor no coinciden con el diagrama CNN.')
  }
  return model
}

/** Normaliza imágenes y one-hot únicamente en la memoria de la sesión. */
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

/** Predice una única imagen en forma y rango idénticos a entrenamiento. */
async function predictPixels(model: tf.Sequential, pixels: Uint8Array, input: CnnInputShape): Promise<number[]> {
  const area = input.height * input.width * input.channels
  if (pixels.length !== area) throw new Error(`La imagen debe contener ${area} píxeles normalizados.`)
  const floats = Float32Array.from(pixels, (value) => value / 255)
  const tensor = tf.tensor4d(floats, [1, input.height, input.width, input.channels])
  let output: tf.Tensor | null = null
  try {
    output = model.predict(tensor) as tf.Tensor
    const values = Array.from(await output.data())
    if (values.length !== input.classes || values.some((n) => !Number.isFinite(n))) {
      throw new Error('La CNN devolvió probabilidades inválidas.')
    }
    return values
  } finally { tensor.dispose(); output?.dispose() }
}

/** Evalúa solo el conjunto test que nunca participa en fit ni validación. */
async function evaluateCnn(
  model: tf.Sequential, dataset: LocalImageDataset, input: CnnInputShape,
  pixels: Uint8Array, labels: Uint8Array, indices: number[],
): Promise<CnnEvaluation> {
  const area = input.height * input.width * input.channels
  const examples = indices.map((index) => pixels.slice(index * area, (index + 1) * area))
  const testBatch = tensorsForPartition(pixels, labels, indices, input)
  let output: tf.Tensor | null = null
  try {
    output = model.predict(testBatch.images) as tf.Tensor
    const values = await output.data()
    const probabilities = indices.map((_, index) => Array.from(values.slice(index * input.classes, (index + 1) * input.classes)))
    const actual = indices.map((index) => labels[index])
    const result = computeCnnEvaluation(dataset.classNames, actual, probabilities)
    // 18 casos de referencia, priorizando errores; sin almacenar todo el CSV.
    const selected = indices.map((index, position): CnnTestSample => ({
      index, actual: actual[position], predicted: result.predictions[position].predicted,
      confidence: result.predictions[position].confidence, pixels: examples[position], probabilities: probabilities[position],
    }))
    const failures = selected.filter((item) => item.actual !== item.predicted)
    const successes = selected.filter((item) => item.actual === item.predicted)
    return {
      classNames: [...dataset.classNames], sampleCount: result.sampleCount, loss: result.loss,
      accuracy: result.accuracy, macroPrecision: result.macroPrecision,
      macroRecall: result.macroRecall, macroF1: result.macroF1,
      matrix: result.matrix, classes: result.classes,
      examples: [...failures.slice(0, 12), ...successes.slice(0, 6)],
    }
  } finally {
    testBatch.images.dispose(); testBatch.targets.dispose(); output?.dispose()
  }
}

/** Devuelve el modelo disponible para inferencia solo si finalizó correctamente. */
export async function trainCnnModel(
  config: CnnConfig, options: CnnTrainOptions, emit: (event: CnnTrainingEvent) => void,
  cancelled: () => boolean, signal: AbortSignal, environment: 'worker' | 'main', dataset: LocalImageDataset,
): Promise<TrainedCnnRuntime | null> {
  validateCnnTrainOptions(options)
  const input: CnnInputShape = { width: dataset.width, height: dataset.height, channels: dataset.channels, classes: dataset.classNames.length }
  if (describeCnn(config, input).errors.length) throw new Error('Arquitectura CNN inválida para el dataset seleccionado.')
  if (options.samples > dataset.count) throw new Error('La muestra solicitada supera las imágenes cargadas.')
  const started = Date.now()
  let model: tf.Sequential | null = null
  let train: ReturnType<typeof tensorsForPartition> | null = null
  let validation: ReturnType<typeof tensorsForPartition> | null = null
  let epochsCompleted = 0
  let keepModel = false
  try {
    if (environment === 'worker') await tf.setBackend('cpu')
    await tf.ready()
    const backend = tf.getBackend()
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return null }
    emit({ type: 'status', stage: 'prepare', message: 'Preparando imágenes locales…', backend })
    const area = input.height * input.width * input.channels
    const pixels = dataset.pixels.subarray(0, area * options.samples)
    const labels = dataset.labels.subarray(0, options.samples)
    const split = splitCnnHoldoutIndices(labels, input.classes, 42)
    train = tensorsForPartition(pixels, labels, split.train, input)
    validation = tensorsForPartition(pixels, labels, split.validation, input)
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return null }
    model = buildCnnModel(config, input)
    model.compile({ optimizer: tf.train.adam(options.learningRate), loss: 'categoricalCrossentropy', metrics: ['accuracy'] })
    const batches = Math.ceil(split.train.length / options.batchSize)
    emit({ type: 'status', stage: 'fit', message: 'Entrenamiento real en progreso…', backend,
      trainingCount: split.train.length, validationCount: split.validation.length, testCount: split.test.length })
    await model.fit(train.images, train.targets, {
      epochs: options.epochs, batchSize: options.batchSize, validationData: [validation.images, validation.targets],
      shuffle: true, verbose: 0, yieldEvery: 'batch',
      callbacks: {
        onBatchEnd: async (batch) => {
          if (cancelled() && model) model.stopTraining = true
          if (batch % 3 === 0 || batch + 1 === batches) {
            emit({ type: 'batch', epoch: epochsCompleted + 1, batch: batch + 1, batches, epochs: options.epochs })
          }
          // Cede el hilo para permitir cancelar una sesión extensa.
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
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return null }
    emit({ type: 'status', stage: 'evaluate', message: 'Evaluando imágenes que no participaron en el entrenamiento…', backend })
    const report = await evaluateCnn(model, dataset, input, pixels, labels, split.test)
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return null }
    emit({ type: 'evaluated', report })
    // Se conserva el modelo en el entorno donde entrenó, no en Supabase.
    const retained = model
    keepModel = true
    emit({ type: 'completed', durationMs: Date.now() - started, backend, epochsCompleted })
    return {
      predict: (image) => predictPixels(retained, image, input),
      dispose: () => retained.dispose(),
    }
  } catch (error) {
    if (cancelled() || signal.aborted) emit({ type: 'cancelled' })
    else emit({ type: 'error', message: error instanceof Error ? error.message : 'Error desconocido entrenando CNN.' })
    return null
  } finally {
    train?.images.dispose(); train?.targets.dispose()
    validation?.images.dispose(); validation?.targets.dispose()
    if (!keepModel) model?.dispose()
  }
}
