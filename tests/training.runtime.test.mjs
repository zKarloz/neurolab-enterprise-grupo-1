import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareDataset } from '../src/ml/preprocessing/prepare.ts'
import { trainDenseModel } from '../src/ml/training/trainCore.ts'

/** Smoke test REAL, sobre TensorFlow.js CPU. Requiere npm install. */
test('clasificación binaria completa épocas y reporta pérdidas reales en CPU', { timeout: 30000 }, async () => {
  const table = {
    columns: ['x', 'target'],
    rows: Array.from({ length: 40 }, (_, i) => [String(i / 40), i < 20 ? 'no' : 'si']),
  }
  const prepared = prepareDataset(table, { targetColumn: 'target', problemType: 'binary', seed: 42 })
  const events = []
  await trainDenseModel(prepared, {
    hiddenLayers: [{ units: 6, activation: 'relu' }], epochs: 2, batchSize: 8,
    learningRate: 0.01, seed: 42,
  }, 'main', (event) => events.push(event), () => false)
  const epochs = events.filter((event) => event.type === 'epoch')
  assert.equal(epochs.length, 2)
  assert.ok(epochs.every((event) => Number.isFinite(event.metrics.loss) && Number.isFinite(event.metrics.validationLoss)))
  const evaluation = events.find((event) => event.type === 'evaluation')
  assert.ok(evaluation && evaluation.evaluation.problemType === 'binary')
  assert.ok(Number.isFinite(evaluation.evaluation.loss))
  assert.equal(evaluation.evaluation.samples, prepared.test.y.length)
  assert.equal(events.at(-1).type, 'completed')
  assert.equal(events.find((event) => event.type === 'backend').backend, 'cpu')
})

test('cancelación solicitada antes de entrenar no inventa resultado', { timeout: 30000 }, async () => {
  const table = { columns: ['x','target'], rows: Array.from({ length: 28 }, (_, i) => [String(i), String(i)]) }
  const prepared = prepareDataset(table, { targetColumn: 'target', problemType: 'regression', seed: 42 })
  const events = []
  await trainDenseModel(prepared, { hiddenLayers: [{ units: 4, activation: 'relu' }], epochs: 2, batchSize: 4, learningRate: 0.01, seed: 42 }, 'main', (event) => events.push(event), () => true)
  assert.deepEqual(events.map((e) => e.type), ['cancelled'])
  assert.equal(events.some((e) => e.type === 'evaluation'), false)
})


test('regresión: evalúa test después del entrenamiento y reporta métricas reales', { timeout: 30000 }, async () => {
  const table = {
    columns: ['x', 'target'],
    rows: Array.from({ length: 36 }, (_, i) => [String(i / 36), String(i * 2 + 1)]),
  }
  const prepared = prepareDataset(table, { targetColumn: 'target', problemType: 'regression', seed: 42 })
  const events = []
  await trainDenseModel(prepared, {
    hiddenLayers: [{ units: 4, activation: 'relu' }], epochs: 2, batchSize: 8,
    learningRate: 0.01, seed: 42,
  }, 'main', (event) => events.push(event), () => false)
  const evaluation = events.find((event) => event.type === 'evaluation')?.evaluation
  assert.ok(evaluation && evaluation.problemType === 'regression')
  assert.equal(evaluation.samples, prepared.test.y.length)
  assert.ok(Number.isFinite(evaluation.mse) && Number.isFinite(evaluation.rmse) && Number.isFinite(evaluation.mae))
  assert.equal(events.at(-1)?.type, 'completed')
})
