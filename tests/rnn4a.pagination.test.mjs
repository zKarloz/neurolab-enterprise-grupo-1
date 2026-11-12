import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarizeRnnTest } from '../src/ml/rnn/evaluation.ts'

const view = readFileSync(new URL('../src/features/rnn/RnnEvaluationPanel.tsx', import.meta.url), 'utf8')

function fakeTest(n) {
  return { shape: { problemType: 'regression', classes: 1 }, classNames: [],
    normalization: { means: [0], scales: [1], targetMean: 0, targetScale: 1 },
    test: { count: n, x: new Float32Array(n * 4), y: Float32Array.from({ length:n }, (_, i) => i + 1),
      targets: Array.from({ length:n }, (_,i) => ({ seriesId: i < 9 ? 'sensor_A' : 'sensor_B', targetTime:i + 50, startTime:i + 46 })) } }
}

test('RNN-4A: las 18 predicciones forman parte de resultados paginables sin afectar métricas', () => {
  const result = summarizeRnnTest(fakeTest(18), Float32Array.from({ length:18 },(_,i) => i))
  assert.equal(result.count,18)
  assert.equal(result.examples.length,18)
  assert.equal(result.mse,1)
  assert.equal(result.mae,1)
  assert.deepEqual([result.examples.slice(0,8).length,result.examples.slice(8,16).length,result.examples.slice(16,24).length],[8,8,2])
  assert.equal(result.examples.at(-1).seriesId, 'sensor_B')
})

test('RNN-4A: la vista reutiliza Pagination del proyecto con controles accesibles', () => {
  assert.match(view, /components\/ui\/Pagination/)
  assert.match(view, /<Pagination page=\{visiblePage\}/)
  assert.match(view, /report\.examples\.length/)
  assert.doesNotMatch(view, /Ejemplos de test \(máximo 8\)/)
})
