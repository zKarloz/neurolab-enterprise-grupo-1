import * as tf from '@tensorflow/tfjs'
import { validateDenseConfig } from '../networks/config.ts'
import type { DenseTrainConfig } from '../networks/config.ts'
import type { PreparedDataset } from '../preprocessing/types.ts'
import type { BackendName, EpochMetrics, RuntimeContext, TrainingEvent } from './types.ts'

/** Prueba entrenamiento y gradientes, no solo inicialización del backend. */
async function probeTrainBackend(backend: BackendName): Promise<boolean> {
  let model: tf.Sequential | null = null
  let xs: tf.Tensor2D | null = null
  let ys: tf.Tensor2D | null = null
  let optimizer: tf.Optimizer | null = null
  try {
    if (!await tf.setBackend(backend)) return false
    await tf.ready()
    model = tf.sequential()
    model.add(tf.layers.dense({ inputShape: [1], units: 2, activation: 'relu' }))
    model.add(tf.layers.dense({ units: 1 }))
    optimizer = tf.train.sgd(0.01)
    model.compile({ optimizer, loss: 'meanSquaredError' })
    xs = tf.tensor2d([[0], [1]], [2, 1])
    ys = tf.tensor2d([[0], [1]], [2, 1])
    await model.fit(xs, ys, { epochs: 1, batchSize: 2, verbose: 0 })
    return true
  } catch {
    return false
  } finally {
    xs?.dispose()
    ys?.dispose()
    model?.dispose()
    optimizer?.dispose()
  }
}

/** La compatibilidad GPU dentro de Workers se prueba en ejecución; CPU es respaldo. */
async function selectBackend(): Promise<BackendName> {
  const inWorker = typeof document === 'undefined'
  const candidates: BackendName[] = inWorker && typeof OffscreenCanvas === 'undefined'
    ? ['cpu']
    : ['webgl', 'cpu']
  for (const candidate of candidates) {
    if (await probeTrainBackend(candidate)) return candidate
  }
  throw new Error('Este navegador no pudo completar una prueba de entrenamiento en GPU ni CPU.')
}

function metricValue(logs: Readonly<Record<string, unknown>> | undefined, keys: string[]): number | null {
  for (const key of keys) {
    const value = logs?.[key]
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error(`TensorFlow.js devolvió «${key}» no finito.`)
      return value
    }
  }
  return null
}

/** Ejecución real en TF.js. No usa los datos de test y libera todos los tensores, incluso al cancelar. */
export async function trainDenseModel(
  dataset: PreparedDataset,
  config: DenseTrainConfig,
  context: RuntimeContext,
  emit: (event: TrainingEvent) => void,
  cancelled: () => boolean,
): Promise<void> {
  const features = dataset.manifest.featureNames.length
  const validated = validateDenseConfig(config, features, dataset.train.x.length, dataset.manifest.problemType)
  if (dataset.validation.x.length < 1 || dataset.test.x.length < 1) throw new Error('Faltan datos de validación o prueba.')
  if ([dataset.train, dataset.validation, dataset.test].some((split) => split.x.some((row) => row.length !== features || row.some((n) => !Number.isFinite(n))) || split.y.some((n) => !Number.isFinite(n)))) {
    throw new Error('El dataset contiene valores no finitos o dimensiones incompatibles.')
  }
  if (cancelled()) { emit({ type: 'cancelled', epochsCompleted: 0 }); return }

  emit({ type: 'initializing', context })
  const backend = await selectBackend()
  if (cancelled()) { emit({ type: 'cancelled', epochsCompleted: 0 }); return }
  emit({ type: 'backend', context, backend, tfjsVersion: tf.version.tfjs })

  let model: tf.Sequential | null = null
  let optimizer: tf.Optimizer | null = null
  const tensors: tf.Tensor[] = []
  const startedAt = performance.now()
  // Los callbacks ocurren durante fit(); conservar sus métricas en una colección
  // evita que TypeScript considere imposible la asignación desde onEpochEnd.
  const completedEpochs: EpochMetrics[] = []
  try {
    model = tf.sequential()
    config.hiddenLayers.forEach((layer, index) => {
      model!.add(tf.layers.dense({
        units: layer.units,
        activation: layer.activation,
        ...(index === 0 ? { inputShape: [features] } : {}),
        kernelInitializer: tf.initializers.glorotUniform({ seed: config.seed + index }),
      }))
    })
    model.add(tf.layers.dense({
      units: 1,
      activation: validated.outputActivation,
      kernelInitializer: tf.initializers.glorotUniform({ seed: config.seed + 100 }),
    }))
    optimizer = tf.train.adam(config.learningRate)
    model.compile({
      optimizer,
      loss: validated.loss,
      metrics: dataset.manifest.problemType === 'binary' ? ['accuracy'] : ['mae'],
    })
    const mkX = (x: number[][]) => { const t = tf.tensor2d(x, [x.length, features]); tensors.push(t); return t }
    const mkY = (y: number[]) => { const t = tf.tensor2d(y, [y.length, 1]); tensors.push(t); return t }
    const xTrain = mkX(dataset.train.x)
    const yTrain = mkY(dataset.train.y)
    const xValidation = mkX(dataset.validation.x)
    const yValidation = mkY(dataset.validation.y)
    // Nunca se construyen tensores de test durante fit(): la evaluación pertenece a F4.
    await model.fit(xTrain, yTrain, {
      epochs: config.epochs,
      batchSize: config.batchSize,
      shuffle: false,
      verbose: 0,
      yieldEvery: 'epoch',
      validationData: [xValidation, yValidation],
      callbacks: {
        onEpochBegin: async () => {
          if (cancelled() && model) model.stopTraining = true
        },
        onEpochEnd: async (index, logs) => {
          const loss = metricValue(logs, ['loss'])
          const validationLoss = metricValue(logs, ['val_loss'])
          if (loss === null || validationLoss === null) throw new Error('TensorFlow.js no devolvió las pérdidas esperadas.')
          const epochMetrics: EpochMetrics = {
            epoch: index + 1,
            totalEpochs: config.epochs,
            loss,
            validationLoss,
            metric: metricValue(logs, ['accuracy', 'acc', 'mae', 'meanAbsoluteError']),
            validationMetric: metricValue(logs, ['val_accuracy', 'val_acc', 'val_mae', 'val_meanAbsoluteError']),
          }
          completedEpochs.push(epochMetrics)
          emit({ type: 'epoch', metrics: epochMetrics })
          // Ceder al event loop permite recibir la solicitud de cancelación desde la UI.
          await tf.nextFrame()
          if (cancelled() && model) model.stopTraining = true
        },
      },
    })
    // .at(-1) devuelve EpochMetrics | undefined, incluso tras un callback asíncrono.
    const final = completedEpochs.at(-1)
    if (cancelled()) {
      emit({ type: 'cancelled', epochsCompleted: final?.epoch ?? 0 })
    } else if (!final) {
      throw new Error('No se completó ninguna época de entrenamiento.')
    } else {
      emit({ type: 'completed', summary: {
        backend, context, tfjsVersion: tf.version.tfjs,
        durationMs: Math.round(performance.now() - startedAt),
        epochsCompleted: final.epoch, final, parameters: validated.parameters,
      } })
    }
  } finally {
    tensors.forEach((tensor) => tensor.dispose())
    model?.dispose()
    optimizer?.dispose()
  }
}
