import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleHistoryMetrics } from '../src/ml/evaluation/history.ts'

test('historial: agrupa cuatro métricas por época sin completar valores ficticios', () => {
  const rows = [
    { epoch: 2, split: 'validation', metric_name: 'loss', metric_value: 0.7 },
    { epoch: 1, split: 'train', metric_name: 'loss', metric_value: 0.5 },
    { epoch: 1, split: 'validation', metric_name: 'loss', metric_value: 0.6 },
    { epoch: 1, split: 'train', metric_name: 'accuracy', metric_value: 0.8 },
    { epoch: 1, split: 'validation', metric_name: 'accuracy', metric_value: 0.75 },
    { epoch: 2, split: 'train', metric_name: 'loss', metric_value: 0.4 },
  ]
  const epochs = assembleHistoryMetrics(rows, 'binary')
  assert.equal(epochs.length, 2)
  assert.equal(epochs[0].epoch, 1)
  assert.equal(epochs[0].metric, 0.8)
  assert.equal(epochs[1].epoch, 2)
  assert.equal(epochs[1].metric, null)
  assert.equal(epochs[1].validationLoss, 0.7)
})

test('historial: no inventa una época si falta pérdida de validación', () => {
  const rows = [{ epoch: 1, split: 'train', metric_name: 'loss', metric_value: 0.3 }]
  assert.deepEqual(assembleHistoryMetrics(rows, 'regression'), [])
})
