import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareRnnTrainingData, splitRnnWindowCounts } from '../src/ml/rnn/trainingData.ts'
import { readRnnEpochMetrics, validateRnnTrainOptions } from '../src/ml/rnn/trainingTypes.ts'

const demoText = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8').trim()
const demoRows = demoText.split(/\r?\n/).map((line) => line.split(','))
const demo = { columns: demoRows[0], rows: demoRows.slice(1) }
const options = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target', features: ['temperatura', 'consumo'], steps: 4, problemType: 'regression' }

test('RNN-2: dataset real de demo genera 72 train, 14 val, 18 test sin cruces de objetivos', () => {
  const prepared = prepareRnnTrainingData(demo, options)
  assert.deepEqual([prepared.train.count, prepared.validation.count, prepared.test.count], [72, 14, 18])
  assert.deepEqual(prepared.shape, { steps: 4, features: 2, classes: 1, problemType: 'regression' })
  const getTimes = (part, id) => part.targets.filter((target) => target.seriesId === id).map((target) => target.targetTime)
  for (const id of ['sensor_A', 'sensor_B']) {
    assert.ok(Math.max(...getTimes(prepared.train, id)) < Math.min(...getTimes(prepared.validation, id)))
    assert.ok(Math.max(...getTimes(prepared.validation, id)) < Math.min(...getTimes(prepared.test, id)))
    const ts = (part) => part.targets.filter((item) => item.seriesId === id)
    assert.ok(Math.max(...ts(prepared.train).map((item) => item.targetTime)) < Math.min(...ts(prepared.validation).map((item) => item.startTime)))
    assert.ok(Math.max(...ts(prepared.validation).map((item) => item.targetTime)) < Math.min(...ts(prepared.test).map((item) => item.startTime)))
  }
})

test('RNN-2: ajuste de estandarización solo desde train; validación futura no altera medias', () => {
  const prepared = prepareRnnTrainingData(demo, options)
  const n = prepared.train.count * options.steps
  for (let feature = 0; feature < 2; feature++) {
    const values = Array.from(prepared.train.x).filter((_, index) => index % 2 === feature)
    const mean = values.reduce((a, b) => a + b, 0) / n
    assert.ok(Math.abs(mean) < 1e-5)
  }
  const altered = { columns: demo.columns, rows: demo.rows.map((row) => [...row]) }
  // Modificar solo los puntos futuros usados exclusivamente como objetivo no cambia
  // el normalizador si esos objetivos no aparecen entre las entradas de train.
  altered.rows.forEach((row) => { if (Number(row[1]) >= 58) row[2] = '1000000' })
  const changed = prepareRnnTrainingData(altered, options)
  assert.deepEqual(changed.normalization.means, prepared.normalization.means)
  assert.notDeepEqual(Array.from(changed.test.x), Array.from(prepared.test.x))
})

test('RNN-2: el conjunto test está reservado y ninguna etiqueta se repite como objetivo entre particiones', () => {
  const prepared = prepareRnnTrainingData(demo, options)
  const ids = (part) => part.targets.map((item) => `${item.seriesId}/${item.targetTime}`)
  const train = new Set(ids(prepared.train))
  const val = new Set(ids(prepared.validation))
  for (const key of [...ids(prepared.validation), ...ids(prepared.test)]) assert.equal(train.has(key), false)
  for (const key of ids(prepared.test)) assert.equal(val.has(key), false)
})

test('RNN-2: se requieren tres particiones por serie para entrenar', () => {
  assert.deepEqual(splitRnnWindowCounts(11, 4), { train: 1, validation: 1, test: 1, purged: 8 })
  assert.throws(() => splitRnnWindowCounts(10, 4), /separación temporal/)
})

test('RNN-2: etiquetas multiclase deben estar presentes en train; no aprender de test', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ['a', String(index), String(index), index < 18 ? String(index % 3) : '9'])
  const table = { columns: ['series_id', 'step', 'f', 'target'], rows }
  const opts = { ...options, features: ['f'], problemType: 'multiclass' }
  assert.throws(() => prepareRnnTrainingData(table, opts), /ausente del entrenamiento/)
})

test('RNN-2: métricas reales incompletas se rechazan; no se sustituyen por ceros', () => {
  assert.deepEqual(readRnnEpochMetrics(1, { loss: 0.8, mae: 0.3, val_loss: 0.9, val_mae: 0.4 }, true),
    { epoch: 1, loss: 0.8, metric: 0.3, validationLoss: 0.9, validationMetric: 0.4 })
  assert.throws(() => readRnnEpochMetrics(1, { loss: 0.1, accuracy: 0.5 }, false), /métricas válidas/)
  assert.throws(() => readRnnEpochMetrics(1, { loss: Infinity, accuracy: 0.5, val_loss: 1, val_accuracy: 0.5 }, false), /métricas válidas/)
  assert.throws(() => validateRnnTrainOptions({ epochs: 100, batchSize: 8, learningRate: .001 }), /Épocas/)
})
