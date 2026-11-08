import type { ProblemType } from '../preprocessing/types.ts'

/** Los límites son provisionales y protegen la memoria del navegador, no cuotas de servidor. */
export type HiddenActivation = 'relu' | 'tanh' | 'sigmoid'
export interface DenseLayerConfig { units: number; activation: HiddenActivation }
export interface DenseTrainConfig {
  hiddenLayers: DenseLayerConfig[]
  epochs: number
  batchSize: number
  learningRate: number
  seed: number
}

export interface ValidatedNetwork { parameters: number; outputActivation: 'sigmoid' | 'linear'; loss: 'binaryCrossentropy' | 'meanSquaredError' }

export const DEFAULT_DENSE_CONFIG: DenseTrainConfig = {
  hiddenLayers: [{ units: 12, activation: 'relu' }],
  epochs: 20,
  batchSize: 8,
  learningRate: 0.01,
  seed: 42,
}

/** Validación pura utilizada tanto en la UI como en el Worker, antes de reservar tensores. */
export function validateDenseConfig(config: DenseTrainConfig, inputFeatures: number, trainRows: number, problem: ProblemType): ValidatedNetwork {
  if (problem !== 'binary' && problem !== 'regression') throw new Error('Tipo de problema no permitido.')
  if (!Number.isSafeInteger(inputFeatures) || inputFeatures < 1 || inputFeatures > 128) {
    throw new Error('La red requiere entre 1 y 128 características de entrada.')
  }
  if (!Number.isSafeInteger(trainRows) || trainRows < 2) throw new Error('Se necesitan al menos dos muestras de entrenamiento.')
  if (!Array.isArray(config.hiddenLayers) || config.hiddenLayers.length < 1 || config.hiddenLayers.length > 3) {
    throw new Error('Configura entre 1 y 3 capas ocultas Dense.')
  }
  if (!Number.isSafeInteger(config.epochs) || config.epochs < 1 || config.epochs > 50) {
    throw new Error('Las épocas deben estar entre 1 y 50.')
  }
  if (!Number.isSafeInteger(config.batchSize) || config.batchSize < 1 || config.batchSize > 128 || config.batchSize > trainRows) {
    throw new Error(`El batch size debe estar entre 1 y ${Math.min(128, trainRows)}.`)
  }
  if (!Number.isFinite(config.learningRate) || config.learningRate < 0.00001 || config.learningRate > 0.1) {
    throw new Error('El learning rate debe estar entre 0.00001 y 0.1.')
  }
  if (!Number.isSafeInteger(config.seed) || config.seed < 0 || config.seed > 2147483647) {
    throw new Error('La semilla debe ser un entero entre 0 y 2147483647.')
  }
  let parameters = 0
  let previous = inputFeatures
  for (const layer of config.hiddenLayers) {
    if (!Number.isSafeInteger(layer.units) || layer.units < 1 || layer.units > 64) {
      throw new Error('Cada capa Dense debe tener entre 1 y 64 neuronas.')
    }
    if (!['relu', 'tanh', 'sigmoid'].includes(layer.activation)) throw new Error('Activación oculta incompatible.')
    parameters += (previous + 1) * layer.units // pesos y sesgos
    previous = layer.units
  }
  parameters += previous + 1 // una salida para binaria o regresión
  if (parameters > 100_000) throw new Error('Se supera el límite provisional de 100 000 parámetros.')
  return {
    parameters,
    outputActivation: problem === 'binary' ? 'sigmoid' : 'linear',
    loss: problem === 'binary' ? 'binaryCrossentropy' : 'meanSquaredError',
  }
}
