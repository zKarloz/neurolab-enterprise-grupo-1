/** Prueba de mensajería Worker CNN-4C sin TensorFlow.js ni Supabase. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { startCnnTraining } from '../src/ml/cnn/cnnSession.ts'

const config = { blocks: [{ id: 'block-1', filters: 8, kernel: 3, padding: 'same', pool: true }], denseUnits: 32 }
const options = { samples: 100, epochs: 2, batchSize: 16, learningRate: 0.001 }
const dataset = { name: 'local.csv', width: 8, height: 8, channels: 1, classNames: ['0','1'], count: 100, originalScale: 16,
  truncated: false, labels: new Uint8Array(100), pixels: new Uint8Array(6400) }

test('Exportación del Worker resuelve solo su requestId y mantiene sesión para predicción', async () => {
  const OriginalWorker = globalThis.Worker
  let created
  const bundle = { modelJson: '{"modelTopology":{}}', weightData: new ArrayBuffer(4) }
  class FakeWorker {
    terminated = false
    constructor() { created = this }
    postMessage(command) {
      if (command.type === 'start') queueMicrotask(() => this.onmessage({ data: { type: 'completed', durationMs: 1, backend: 'cpu', epochsCompleted: 2 } }))
      if (command.type === 'export-model') queueMicrotask(() => {
        this.onmessage({ data: { type: 'model-exported', requestId: command.requestId + 111, bundle } }) // respuesta ajena
        this.onmessage({ data: { type: 'model-exported', requestId: command.requestId, bundle } })
      })
      if (command.type === 'predict') queueMicrotask(() => this.onmessage({ data: { type: 'prediction', requestId: command.requestId, probabilities: [0.2, 0.8] } }))
    }
    terminate() { this.terminated = true }
  }
  globalThis.Worker = FakeWorker
  try {
    const events = []
    const session = startCnnTraining(config, options, (event) => events.push(event), dataset)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(events.map((e) => e.type), ['completed'])
    assert.equal(await session.exportModel(), bundle)
    assert.deepEqual(await session.predict(new Uint8Array(64)), [0.2,0.8])
    assert.equal(created.terminated, false)
    session.dispose()
    assert.equal(created.terminated, true)
    await assert.rejects(session.exportModel(), /Completa primero/)
  } finally { globalThis.Worker = OriginalWorker }
})

test('Disponer la CNN durante serialización rechaza la petición pendiente', async () => {
  const OriginalWorker = globalThis.Worker
  class FakeWorker {
    postMessage(command) {
      if (command.type === 'start') queueMicrotask(() => this.onmessage({ data: { type: 'completed', durationMs: 1, backend: 'cpu', epochsCompleted: 2 } }))
      // Sin respuesta para export-model: se simula pérdida de contexto.
    }
    terminate() {}
  }
  globalThis.Worker = FakeWorker
  try {
    const session = startCnnTraining(config, options, () => {}, dataset)
    await new Promise((resolve) => setImmediate(resolve))
    const request = session.exportModel()
    session.dispose()
    await assert.rejects(request, /sesión fue cerrada/)
  } finally { globalThis.Worker = OriginalWorker }
})
