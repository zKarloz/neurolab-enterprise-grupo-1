/** Prueba CPU TensorFlow.js real: entrenamiento → test → inferencia → liberación. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trainRnnModel } from '../src/ml/rnn/trainEngine.ts'
const content = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map((line) => line.split(','))
const table = { columns: content[0], rows: content.slice(1) }
const datasetOptions = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target', features: ['temperatura', 'consumo'], steps: 4, problemType: 'regression' }
for (const kind of ['simpleRNN', 'lstm']) {
  test(`RNN-3: ${kind} evalúa test y predice con el modelo retenido`, async () => {
    const events = []
    let runtime = null
    try {
      await trainRnnModel(table, datasetOptions, { kind, layers: 1, units: 8, denseUnits: 0 },
        { epochs: 2, batchSize: 8, learningRate: 0.001 }, (event) => events.push(event),
        () => false, new AbortController().signal, 'main', (value) => { runtime = value })
      assert.deepEqual(events.filter((event) => event.type === 'error'), [])
      const evaluation = events.find((event) => event.type === 'evaluation')?.result
      assert.equal(evaluation?.kind, 'regression')
      assert.equal(evaluation?.count, 18)
      assert.ok(Number.isFinite(evaluation?.mae))
      assert.equal(events.at(-1)?.type, 'completed')
      const inference = await runtime.predict('sensor_A')
      assert.equal(inference.problemType, 'regression')
      assert.ok(Number.isFinite(inference.value))
    } finally { runtime?.dispose() }
  })
}
