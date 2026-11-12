/** Prueba real de TensorFlow.js CPU: SimpleRNN y LSTM, guardar y restaurar sin CSV. */
import test from 'node:test'
import assert from 'node:assert/strict'
import * as tf from '@tensorflow/tfjs'
import { readFileSync } from 'node:fs'
import { trainRnnModel } from '../src/ml/rnn/trainEngine.ts'
import { rnnRunPayload } from '../src/ml/rnn/persistencePayload.ts'
import { prepareRnnTrainingData } from '../src/ml/rnn/trainingData.ts'
import { loadRnnPredictor } from '../src/ml/rnn/modelPersistence.ts'

const csv = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
const table = { columns: csv[0].split(','), rows: csv.slice(1).map((line) => line.split(',')) }
const dataset = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target',
  features: ['temperatura','consumo'], steps: 4, problemType: 'regression' }
const opts = { epochs: 2, batchSize: 8, learningRate: 0.001 }

for (const kind of ['simpleRNN', 'lstm']) {
  test(`RNN-4C: ${kind} entrena, serializa y predice igual tras restaurar`, async () => {
    await tf.setBackend('cpu')
    await tf.ready()
    let runtime
    const events = []
    const architecture = { kind, layers: 1, units: 8, denseUnits: 0 }
    await trainRnnModel(table, dataset, architecture, opts,
      (event) => events.push(event), () => false, new AbortController().signal, 'main', (next) => { runtime = next })
    assert.ok(runtime, JSON.stringify(events.filter((event) => event.type === 'error')))
    assert.ok(events.some((event) => event.type === 'completed'))
    const prepared = prepareRnnTrainingData(table, dataset)
    const manifest = rnnRunPayload('project', 'demo.csv', 7000, 'a'.repeat(64), table, dataset, architecture, opts, prepared).p_preprocessing_json
    let restored
    try {
      const original = await runtime.predict('sensor_A')
      const bundle = await runtime.exportModel()
      assert.ok(bundle.modelJson.includes('weightsManifest'))
      restored = await loadRnnPredictor(bundle, manifest)
      const seriesIndex = table.columns.indexOf('series_id')
      const timeIndex = table.columns.indexOf('step')
      const indices = dataset.features.map((feature) => table.columns.indexOf(feature))
      const window = table.rows.filter((row) => row[seriesIndex] === 'sensor_A')
        .sort((a, b) => Number(a[timeIndex]) - Number(b[timeIndex]))
        .slice(-dataset.steps).map((row) => indices.map((i) => Number(row[i])))
      const same = await restored.predict(window)
      assert.ok(Math.abs(original.value - same.value) < 1e-4, `${kind}: original=${original.value} restaurado=${same.value}`)
    } finally { restored?.dispose(); runtime.dispose() }
  })
}
