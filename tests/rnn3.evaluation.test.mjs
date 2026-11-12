import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeRnnTest } from '../src/ml/rnn/evaluation.ts'

function prepared(problemType, ys, classes = []) {
  const targets = ys.map((_, i) => ({ seriesId: 'a', startTime: i, targetTime: i + 4 }))
  return { shape: { problemType, classes: classes.length || 1 },
    classNames: classes, normalization: { means: [0], scales: [1], targetMean: 10, targetScale: 2 },
    test: { count: ys.length, x: new Float32Array(ys.length * 4), y: Float32Array.from(ys), targets } }
}
test('RNN-3: métricas de regresión se calculan en escala original del objetivo', () => {
  const result = summarizeRnnTest(prepared('regression', [0, 1, 2]), [0, 1, 3])
  assert.equal(result.kind, 'regression')
  assert.ok(Math.abs(result.mse - 4 / 3) < 1e-8)
  assert.ok(Math.abs(result.mae - 2 / 3) < 1e-8)
  assert.ok(Math.abs(result.r2 - 0.5) < 1e-8)
  assert.equal(result.examples[2].actual, 14)
  assert.equal(result.examples[2].predicted, 16)
})
test('RNN-3: R² indefinido ante objetivo de test constante', () => {
  const result = summarizeRnnTest(prepared('regression', [1, 1]), [1, 1])
  assert.equal(result.r2, null)
})
test('RNN-3: matriz binaria real, filas = real y columnas = predicho', () => {
  const result = summarizeRnnTest(prepared('binary', [0, 1, 1, 0], ['No', 'Sí']), [0.1, 0.8, 0.3, 0.9])
  assert.equal(result.kind, 'classification')
  assert.deepEqual(result.confusion, [[1, 1], [1, 1]])
  assert.equal(result.accuracy, 0.5)
  assert.equal(result.macroF1, 0.5)
})
test('RNN-3: multiclasificación usa softmax y orden de clases de entrenamiento', () => {
  const data = prepared('multiclass', [0, 1, 0, 1, 0, 0], ['A', 'B', 'C'])
  data.test.count = 2
  data.test.targets = data.test.targets.slice(0, 2)
  const result = summarizeRnnTest(data, [0.1, 0.9, 0, 0.1, 0.2, 0.7])
  assert.deepEqual(result.confusion, [[0, 0, 1], [0, 1, 0], [0, 0, 0]])
  assert.equal(result.accuracy, 0.5)
})
test('RNN-3: rechaza test incompleto y valores no finitos', () => {
  const data = prepared('regression', [0, 1])
  assert.throws(() => summarizeRnnTest(data, [0]), /todo el test/)
  assert.throws(() => summarizeRnnTest(data, [NaN, 1]), /finita/)
})
