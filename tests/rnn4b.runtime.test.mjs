/** Se ejecuta en VSCode con @tensorflow/tfjs instalado. No accede a Supabase. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { trainRnnModel } from '../src/ml/rnn/trainEngine.ts'
import { createRnnPersistenceQueue } from '../src/ml/rnn/persistenceQueue.ts'
import { rnnEvaluationSummary } from '../src/ml/rnn/persistencePayload.ts'
const csv = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8')
  .trim().split(/\r?\n/).map((line) => line.split(','))
const table = { columns: csv[0], rows: csv.slice(1) }
const dataset = { seriesColumn:'series_id',timeColumn:'step',targetColumn:'target',
  features:['temperatura','consumo'],steps:4,problemType:'regression' }

for (const kind of ['simpleRNN', 'lstm']) {
  test(`RNN-4B: ${kind} genera 2 épocas, 18 test y confirmación de cola con datos reales`, async () => {
    const written = []
    const confirmations = []
    const queue = createRnnPersistenceQueue('fake-run-id', {
      runtime: async (_id, backend, context) => written.push(['runtime', backend, context]),
      epoch: async (_id, m) => written.push(['epoch', m.epoch]),
      evaluation: async (_id, problemType, report) => {
        const summary = rnnEvaluationSummary(problemType, report)
        assert.equal(summary.sampleCount, 18)
        assert.equal(Object.hasOwn(summary, 'examples'), false)
        written.push(['evaluation', summary.sampleCount])
      },
      finish: async (_id, status) => written.push(['finish', status]),
    }, {
      epochConfirmed: (ep) => confirmations.push(ep),
      evaluationConfirmed: () => confirmations.push('test'),
      finishedConfirmed: (status) => confirmations.push(status),
      failed: (message) => { throw new Error(message) },
    })
    let runtime = null
    try {
      await trainRnnModel(table, dataset, {kind,layers:1,units:8,denseUnits:0},
        {epochs:2,batchSize:8,learningRate:0.001}, (event) => {
          if (event.type === 'status') queue.runtime(event.backend,event.context,event.tfjsVersion)
          if (event.type === 'epoch') queue.epoch(event.metrics)
          if (event.type === 'evaluation') queue.evaluation(dataset.problemType,event.result)
          if (event.type === 'completed') queue.finish('completed',event.durationMs)
          if (event.type === 'cancelled') queue.finish('cancelled')
          if (event.type === 'error') queue.finish('failed',undefined,event.message)
        }, () => false, new AbortController().signal, 'main', (saved) => {runtime = saved})
      await queue.idle()
      assert.deepEqual(written.map((row) => row[0]), ['runtime','epoch','epoch','evaluation','finish'])
      assert.deepEqual(confirmations, [1,2,'test','completed'])
      assert.equal((await runtime.predict('sensor_A')).problemType, 'regression')
    } finally { runtime?.dispose() }
  })
}
