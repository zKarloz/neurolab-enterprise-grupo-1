// Pruebas matemáticas sin TensorFlow ni Supabase: casos conocidos y degenerados.
import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateBinary, evaluateRegression } from '../src/ml/evaluation/metrics.ts'

test('clasificación: matriz de confusión y métricas calculadas con probabilidades reales', () => {
  const result = evaluateBinary([1, 0, 1, 0], [0.9, 0.7, 0.8, 0.1])
  assert.deepEqual(result.confusion, { tp: 2, tn: 1, fp: 1, fn: 0 })
  assert.equal(result.accuracy, 0.75)
  assert.equal(result.precision, 2 / 3)
  assert.equal(result.recall, 1)
  assert.ok(Math.abs(result.f1 - 0.8) < 1e-12)
  assert.ok(result.loss > 0)
})

test('clasificación: división por cero controlada sin positivos predichos', () => {
  const result = evaluateBinary([1, 0], [0.1, 0.2])
  assert.equal(result.precision, 0)
  assert.equal(result.recall, 0)
  assert.equal(result.f1, 0)
})

test('clasificación: los valores no son etiquetas ni probabilidades válidas', () => {
  assert.throws(() => evaluateBinary([0, 2], [0.5, 0.6]))
  assert.throws(() => evaluateBinary([0, 1], [0.5, 1.1]))
  assert.throws(() => evaluateBinary([0], [0.5, 0.3]))
})

test('regresión: MSE, RMSE, MAE y R²', () => {
  const result = evaluateRegression([1, 2, 3], [1, 3, 2])
  assert.ok(Math.abs(result.mse - (2 / 3)) < 1e-12)
  assert.ok(Math.abs(result.rmse - Math.sqrt(2 / 3)) < 1e-12)
  assert.ok(Math.abs(result.mae - (2 / 3)) < 1e-12)
  assert.ok(Math.abs(result.r2 - 0) < 1e-12)
})

test('regresión: R² indefinido cuando el test tiene objetivo constante', () => {
  assert.equal(evaluateRegression([5, 5, 5], [4, 5, 6]).r2, null)
})

test('regresión: rechazo de valores no finitos', () => {
  assert.throws(() => evaluateRegression([1, Number.NaN], [1, 2]))
  assert.throws(() => evaluateRegression([], []))
})
