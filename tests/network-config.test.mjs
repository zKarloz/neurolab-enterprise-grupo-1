import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_DENSE_CONFIG, validateDenseConfig } from '../src/ml/networks/config.ts'

const sample = () => ({ ...DEFAULT_DENSE_CONFIG, hiddenLayers: [{ units: 12, activation: 'relu' }] })

test('arquitectura binaria: 4 entradas -> 12 Dense -> una salida sigmoide, parámetros exactos', () => {
  const result = validateDenseConfig(sample(), 4, 30, 'binary')
  assert.equal(result.parameters, (4 + 1) * 12 + 13)
  assert.equal(result.loss, 'binaryCrossentropy')
  assert.equal(result.outputActivation, 'sigmoid')
})

test('regresión utiliza salida lineal y MSE', () => {
  const result = validateDenseConfig(sample(), 2, 15, 'regression')
  assert.equal(result.loss, 'meanSquaredError')
  assert.equal(result.outputActivation, 'linear')
})

test('limita capas, unidades y parámetros antes de reservar tensores', () => {
  assert.throws(() => validateDenseConfig({ ...sample(), hiddenLayers: [] }, 2, 10, 'binary'), /1 y 3/)
  assert.throws(() => validateDenseConfig({ ...sample(), hiddenLayers: [{ units: 999, activation: 'relu' }] }, 2, 10, 'binary'), /1 y 64/)
  assert.throws(() => validateDenseConfig({ ...sample(), hiddenLayers: Array.from({ length: 4 }, () => ({ units: 16, activation: 'relu' })) }, 2, 10, 'binary'), /1 y 3/)
  assert.throws(() => validateDenseConfig(sample(), 0, 10, 'binary'), /1 y 128/)
})

test('rechaza capas, épocas, batch y tasa de aprendizaje inválidos', () => {
  assert.throws(() => validateDenseConfig({ ...sample(), epochs: 0 }, 3, 20, 'binary'), /épocas/)
  assert.throws(() => validateDenseConfig({ ...sample(), batchSize: 40 }, 3, 20, 'binary'), /batch/)
  assert.throws(() => validateDenseConfig({ ...sample(), learningRate: NaN }, 3, 20, 'binary'), /learning rate/)
  assert.throws(() => validateDenseConfig({ ...sample(), hiddenLayers: [{ units: 8, activation: 'linear' }] }, 3, 20, 'binary'), /Activación/)
})

test('semilla debe ser reproducible y válida', () => {
  assert.throws(() => validateDenseConfig({ ...sample(), seed: -1 }, 3, 20, 'regression'), /semilla/)
  assert.ok(validateDenseConfig({ ...sample(), seed: 42 }, 3, 20, 'regression').parameters > 0)
})
