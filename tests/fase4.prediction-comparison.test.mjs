import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareDataset } from '../src/ml/preprocessing/prepare.ts'
import { preparePredictionInput, interpretPrediction } from '../src/ml/evaluation/inference.ts'
import { buildValidationComparison, compareTestMetrics } from '../src/ml/evaluation/comparison.ts'

const table = {
  columns: ['edad', 'grupo', 'target'],
  rows: Array.from({ length: 40 }, (_, i) => [String(30 + i), i % 2 ? 'b' : 'a', i < 20 ? 'negativo' : 'positivo']),
}
const prepared = prepareDataset(table, { targetColumn: 'target', problemType: 'binary', seed: 42 })

test('inferencia: usa el manifiesto ya ajustado de train y conserva orden de características', () => {
  const { manifest } = prepared
  const values = preparePredictionInput({ edad: '48', grupo: 'a' }, manifest)
  assert.equal(values.length, manifest.featureNames.length)
  assert.ok(values.every(Number.isFinite))
  assert.equal(values[0], (48 - manifest.transformers[0].mean) / manifest.transformers[0].standardDeviation)
})

test('inferencia: rechaza valor numérico inválido y respeta etiquetas originales', () => {
  assert.throws(() => preparePredictionInput({ edad: 'errores', grupo: 'a' }, prepared.manifest), /no numérico/)
  assert.deepEqual(interpretPrediction(0.8, prepared.manifest), {
    problemType: 'binary', label: 'positivo', probabilityPositive: 0.8, threshold: 0.5,
  })
  assert.throws(() => interpretPrediction(1.1, prepared.manifest), /probabilidad válida/)
})

test('comparación: no inventa evaluación ni conecta épocas ausentes', () => {
  assert.deepEqual(compareTestMetrics(null, null), [])
  const points = buildValidationComparison(
    [{ epoch: 1, validationLoss: 0.9 }, { epoch: 3, validationLoss: 0.6 }],
    [{ epoch: 2, validationLoss: 0.8 }],
  )
  assert.deepEqual(points, [
    { epoch: 1, first: 0.9, second: null },
    { epoch: 2, first: null, second: 0.8 },
    { epoch: 3, first: 0.6, second: null },
  ])
})

test('comparación: rechaza comparar evaluación binaria contra regresión', () => {
  const binary = { problemType: 'binary', samples: 10, loss: 0.5, accuracy: .8, precision: .8, recall: .8, f1: .8, threshold: 0.5, confusion: { tp: 4, tn: 4, fp: 1, fn: 1 } }
  const regression = { problemType: 'regression', samples: 10, mse: 2, rmse: Math.sqrt(2), mae: 1, r2: .5 }
  assert.throws(() => compareTestMetrics(binary, regression), /tipos de problema distintos/)
  assert.equal(compareTestMetrics(binary, binary).length, 5)
  assert.equal(compareTestMetrics(regression, regression).length, 4)
})
