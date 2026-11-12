/** Motor TensorFlow.js RNN-2: solo entrenamiento local, sin pesos persistidos. */
import * as tf from '@tensorflow/tfjs'
import { serializeDenseModel, type ModelArtifactBundle } from '../models/artifacts.ts'
import type { RawTable } from '../preprocessing/types.ts'
import { describeRnn, type RnnConfig } from './architecture.ts'
import { prepareRnnTrainingData, type RnnPreparedData } from './trainingData.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'
import { summarizeRnnTest } from './evaluation.ts'
import { prepareRnnInferenceWindow, decodeRnnInference, type RnnInferenceResult } from './inference.ts'
import { readRnnEpochMetrics, validateRnnTrainOptions, type RnnTrainingEvent, type RnnTrainOptions } from './trainingTypes.ts'

/** El conteo de pesos debe coincidir con el diagrama matemático de RNN-1. */
export function buildRnnModel(config: RnnConfig, data: RnnPreparedData): tf.Sequential {
  const diagram = describeRnn(config, data.shape)
  if (diagram.errors.length) throw new Error(diagram.errors.join(' '))
  const model = tf.sequential()
  try {
    for (let index = 0; index < config.layers; index++) {
      const args = {
        units: config.units,
        returnSequences: index < config.layers - 1,
        ...(index === 0 ? { inputShape: [data.shape.steps, data.shape.features] } : {}),
        kernelInitializer: tf.initializers.glorotUniform({ seed: 42 + index }),
        recurrentInitializer: tf.initializers.glorotUniform({ seed: 52 + index }),
      }
      model.add(config.kind === 'lstm' ? tf.layers.lstm(args) : tf.layers.simpleRNN(args))
    }
    if (config.denseUnits > 0) model.add(tf.layers.dense({ units: config.denseUnits, activation: 'relu' }))
    const regression = data.shape.problemType === 'regression'
    const binary = data.shape.problemType === 'binary'
    model.add(tf.layers.dense({
      units: regression || binary ? 1 : data.shape.classes,
      activation: regression ? 'linear' : binary ? 'sigmoid' : 'softmax',
    }))
    if (model.countParams() !== diagram.parameterCount) throw new Error('El modelo RNN no coincide con el número de parámetros del diagrama.')
    return model
  } catch (cause) { model.dispose(); throw cause }
}

/** Solo la sesión activa retiene este modelo; la UI no recibe tensores ni pesos. */
export interface RnnTrainedRuntime {
  predict: (seriesId: string) => Promise<RnnInferenceResult>
  exportModel: () => Promise<ModelArtifactBundle>
  dispose: () => void
}

/** En el navegador el Worker usa CPU por compatibilidad; el fallback no reinicia tras un error de fit. */
export async function trainRnnModel(
  table: RawTable, datasetOptions: RnnDatasetOptions, config: RnnConfig, options: RnnTrainOptions,
  emit: (event: RnnTrainingEvent) => void, cancelled: () => boolean,
  signal: AbortSignal, context: 'worker' | 'main',
  retainModel?: (runtime: RnnTrainedRuntime) => void,
): Promise<void> {
  let model: tf.Sequential | null = null
  let trainX: tf.Tensor3D | null = null
  let trainY: tf.Tensor2D | null = null
  let validationX: tf.Tensor3D | null = null
  let validationY: tf.Tensor2D | null = null
  const startedAt = Date.now()
  let completed = 0
  let retained = false
  try {
    validateRnnTrainOptions(options)
    const prepared = prepareRnnTrainingData(table, datasetOptions)
    if (describeRnn(config, prepared.shape).errors.length) throw new Error('Arquitectura no compatible con las secuencias seleccionadas.')
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
    // CPU se soporta también en Workers sin WebGL; nada se ejecuta en Supabase.
    await tf.setBackend('cpu')
    await tf.ready()
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
    const backend = tf.getBackend()
    const { steps, features, problemType, classes } = prepared.shape
    const outputCount = problemType === 'multiclass' ? classes : 1
    trainX = tf.tensor3d(prepared.train.x, [prepared.train.count, steps, features])
    trainY = tf.tensor2d(prepared.train.y, [prepared.train.count, outputCount])
    validationX = tf.tensor3d(prepared.validation.x, [prepared.validation.count, steps, features])
    validationY = tf.tensor2d(prepared.validation.y, [prepared.validation.count, outputCount])
    model = buildRnnModel(config, prepared)
    model.compile({
      optimizer: tf.train.adam(options.learningRate),
      loss: problemType === 'regression' ? 'meanSquaredError' : problemType === 'binary' ? 'binaryCrossentropy' : 'categoricalCrossentropy',
      metrics: [problemType === 'regression' ? 'mae' : 'accuracy'],
    })
    emit({ type: 'status', message: 'Entrenamiento temporal real en curso…', backend, context,
      tfjsVersion: tf.version.tfjs, trainingCount: prepared.train.count,
      validationCount: prepared.validation.count, testCount: prepared.test.count })
    const batches = Math.ceil(prepared.train.count / options.batchSize)
    await model.fit(trainX, trainY, {
      epochs: options.epochs, batchSize: options.batchSize, shuffle: false, verbose: 0,
      validationData: [validationX, validationY], yieldEvery: 'batch',
      callbacks: {
        onBatchEnd: async (batch) => {
          if (cancelled() && model) model.stopTraining = true
          emit({ type: 'batch', epoch: completed + 1, batch: batch + 1, batches, epochs: options.epochs })
          await new Promise<void>((resolve) => setTimeout(resolve, 0))
          if (cancelled() && model) model.stopTraining = true
        },
        onEpochEnd: async (epochIndex, logs) => {
          if (cancelled() && model) model.stopTraining = true
          if (!cancelled()) {
            const metrics = readRnnEpochMetrics(epochIndex + 1, (logs ?? {}) as Record<string, number | undefined>, problemType === 'regression')
            completed = epochIndex + 1
            emit({ type: 'epoch', metrics })
          }
        },
      },
    })
    if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
    if (completed !== options.epochs) throw new Error('El entrenamiento terminó sin completar todas las épocas previstas.')
    // Test oficial de esta sesión: no participa en fit() ni en validationData.
    const testPartition = prepared.test
    const testTensor = tf.tensor3d(testPartition.x, [testPartition.count, steps, features])
    let testOutput: tf.Tensor | null = null
    try {
      testOutput = model.predict(testTensor) as tf.Tensor
      const values = await testOutput.data()
      if (cancelled() || signal.aborted) { emit({ type: 'cancelled' }); return }
      const result = summarizeRnnTest(prepared, values)
      emit({ type: 'evaluation', result })
    } finally {
      testOutput?.dispose()
      testTensor.dispose()
    }
    // Modelo vivo únicamente tras evaluación satisfactoria, hasta abandonar módulo.
    if (retainModel) {
      const readyModel = model
      const runtime: RnnTrainedRuntime = {
        async predict(seriesId) {
          const window = prepareRnnInferenceWindow(table, datasetOptions, prepared, seriesId)
          const input = tf.tensor3d(window.values, [1, steps, features])
          let output: tf.Tensor | null = null
          try {
            output = readyModel.predict(input) as tf.Tensor
            return decodeRnnInference(prepared, window, await output.data())
          } finally { output?.dispose(); input.dispose() }
        },
        // El mismo serializador de F5 soporta modelos Layers SimpleRNN/LSTM.
        exportModel: () => serializeDenseModel(readyModel),
        dispose() { readyModel.dispose() },
      }
      retainModel(runtime)
      retained = true
    }
    emit({ type: 'completed', durationMs: Date.now() - startedAt, backend, epochsCompleted: completed })
  } catch (cause) {
    if (cancelled() || signal.aborted) emit({ type: 'cancelled' })
    else emit({ type: 'error', message: cause instanceof Error ? cause.message : 'Error entrenando la RNN.' })
  } finally {
    trainX?.dispose(); trainY?.dispose(); validationX?.dispose(); validationY?.dispose()
    if (!retained) model?.dispose()
  }
}
