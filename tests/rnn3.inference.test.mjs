import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareRnnInferenceWindow, decodeRnnInference } from '../src/ml/rnn/inference.ts'
const table = {
  columns: ['series_id', 'step', 'temperatura', 'target'],
  rows: [
    ['B', '1', '100', 'secret'], ['A', '3', '30', '999'], ['A', '1', '10', '999'],
    ['A', '2', '20', '999'], ['A', '4', '40', '999'], ['B', '2', '101', 'secret'],
  ],
}
const options = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target', features: ['temperatura'], steps: 4, problemType: 'regression' }
const prepared = { shape: { steps: 4, features: 1, classes: 1, problemType: 'regression' },
  normalization: { means: [10], scales: [10], targetMean: 100, targetScale: 2 }, classNames: [] }
test('RNN-3: inferencia ordenada por tiempo, solo de la serie elegida y sin target', () => {
  const window = prepareRnnInferenceWindow(table, options, prepared, 'A')
  assert.deepEqual(Array.from(window.values), [0, 1, 2, 3])
  assert.equal(window.fromTime, 1)
  assert.equal(window.toTime, 4)
  assert.equal(decodeRnnInference(prepared, window, [2]).value, 104)
})
test('RNN-3: series con ventanas insuficientes y normalización inválida se rechazan', () => {
  assert.throws(() => prepareRnnInferenceWindow(table, options, prepared, 'B'), /4 observaciones/)
  assert.throws(() => prepareRnnInferenceWindow(table, options,
    { ...prepared, normalization: { ...prepared.normalization, scales: [0] } }, 'A'), /no finita/)
})
test('RNN-3: clasificación devuelve etiqueta y probabilidades de entrenamiento', () => {
  const window = { seriesId: 'A', fromTime: 1, toTime: 4 }
  const result = decodeRnnInference({ ...prepared, shape: { ...prepared.shape, problemType: 'multiclass', classes: 3 },
    classNames: ['a', 'b', 'c'] }, window, [0.1, 0.8, 0.1])
  assert.equal(result.value, 'b')
  assert.equal(result.probabilities?.length, 3)
})
