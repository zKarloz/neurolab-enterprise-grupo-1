import test from 'node:test'
import assert from 'node:assert/strict'
import { describeSequenceDataset } from '../src/ml/rnn/sequenceDataset.ts'

const columns = ['series_id', 'step', 'temperatura', 'consumo', 'target']
const options = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target', features: ['temperatura', 'consumo'], steps: 4, problemType: 'regression' }
const sample = (series = 'A', n = 8) => Array.from({ length: n }, (_, i) => [series, String(i), String(i + 1), String(i * 2), String(i + 100)])

test('RNN-1: ventanas por serie con objetivo en el paso siguiente, sin cruzar series', () => {
  const result = describeSequenceDataset({ columns, rows: [...sample('A'), ...sample('B', 6)] }, options)
  assert.equal(result.seriesCount, 2)
  assert.equal(result.windowCount, 6)
  assert.equal(result.exampleWindows[0].seriesId, 'A')
  assert.equal(result.exampleWindows[0].toTime, 3)
  assert.equal(result.exampleWindows[0].predictedTime, 4)
  assert.equal(result.exampleWindows[0].target, '104')
  assert.deepEqual(result.exampleWindows[0].values, [[1,0],[2,2],[3,4],[4,6]])
})

test('RNN-1: CSV desordenado se ordena por índice temporal', () => {
  const rows = sample().reverse()
  const result = describeSequenceDataset({ columns, rows }, options)
  assert.equal(result.exampleWindows[0].fromTime, 0)
  assert.equal(result.exampleWindows[0].target, '104')
})

test('RNN-1: rechaza tiempos repetidos y no finitos', () => {
  assert.throws(() => describeSequenceDataset({ columns, rows: [...sample(), ['A', '2', '1', '2', '3']] }, options), /duplicado/)
  assert.throws(() => describeSequenceDataset({ columns, rows: [['A', 'Infinity', '1', '2', '3'], ...sample()] }, options), /número decimal/)
})

test('RNN-1: rechaza objetivos inválidos y fuga por seleccionar target como predictor', () => {
  assert.throws(() => describeSequenceDataset({ columns, rows: sample() }, { ...options, features: ['target'] }), /excluyendo/)
  assert.throws(() => describeSequenceDataset({ columns, rows: sample() }, { ...options, problemType: 'binary' }), /exactamente dos clases/)
  assert.throws(() => describeSequenceDataset({ columns, rows: sample().map((row) => row.map((c, i) => i === 4 ? 'abc' : c)) }, options), /número decimal/)
})

test('RNN-1: clasificación multiclase real y serie demasiado corta', () => {
  const rows = sample().map((row, i) => [...row.slice(0, 4), String(i % 3)])
  const result = describeSequenceDataset({ columns, rows: [...rows, ...sample('short', 2)] }, { ...options, problemType: 'multiclass' })
  assert.deepEqual(result.classes, ['0', '1', '2'])
  assert.equal(result.skippedShortSeries, 1)
  assert.equal(result.windowCount, 4)
  assert.throws(() => describeSequenceDataset({ columns, rows: sample('short', 4) }, options), /No hay ventanas/)
})

test('RNN-1: límite de variables y columnas obligatorias', () => {
  assert.throws(() => describeSequenceDataset({ columns, rows: sample() }, { ...options, features: [] }), /entre 1 y 16/)
  assert.throws(() => describeSequenceDataset({ columns, rows: sample() }, { ...options, timeColumn: 'series_id' }), /diferentes/)
})
