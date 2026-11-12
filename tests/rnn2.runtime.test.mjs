/** Ejecutar con dependencias npm instaladas: CPU real para SimpleRNN y LSTM. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { trainRnnModel } from '../src/ml/rnn/trainEngine.ts'
import { readFileSync } from 'node:fs'
const source = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8').trim().split(/\r?\n/).map((row) => row.split(','))
const table = { columns: source[0], rows: source.slice(1) }
const options = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target', features: ['temperatura', 'consumo'], steps: 4, problemType: 'regression' }
for (const kind of ['simpleRNN', 'lstm']) {
  test(`RNN-2: ${kind} entrena CPU dos épocas con pérdidas y MAE reales`, async () => {
    const events = []
    await trainRnnModel(table, options, { kind, layers: 1, units: 8, denseUnits: 0 },
      { epochs: 2, batchSize: 8, learningRate: 0.001 }, (event) => events.push(event),
      () => false, new AbortController().signal, 'main')
    const errors = events.filter((event) => event.type === 'error')
    assert.deepEqual(errors, [], JSON.stringify(errors))
    assert.equal(events.filter((event) => event.type === 'epoch').length, 2)
    assert.equal(events.at(-1)?.type, 'completed')
    assert.equal(events.find((event) => event.type === 'status')?.testCount, 18)
    for (const event of events.filter((event) => event.type === 'epoch')) {
      assert.ok(Number.isFinite(event.metrics.loss))
      assert.ok(Number.isFinite(event.metrics.validationLoss))
      assert.ok(Number.isFinite(event.metrics.metric))
      assert.ok(Number.isFinite(event.metrics.validationMetric))
    }
  })
}
