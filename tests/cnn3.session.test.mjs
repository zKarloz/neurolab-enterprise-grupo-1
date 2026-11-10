import test from 'node:test'
import assert from 'node:assert/strict'
import { startCnnTraining } from '../src/ml/cnn/cnnSession.ts'

const config = { blocks: [{ id: 'block-1', filters: 8, kernel: 3, padding: 'same', pool: true }], denseUnits: 32 }
const options = { samples: 100, epochs: 2, batchSize: 16, learningRate: 0.001 }
const dataset = { name: 'test.csv', width: 8, height: 8, channels: 1, classNames: ['0', '1'], count: 100, originalScale: 16, truncated: false, labels: new Uint8Array(100), pixels: new Uint8Array(6400) }

test('Worker conserva el modelo al completar y devuelve probabilidades de predicción', async () => {
  const OriginalWorker = globalThis.Worker
  let created
  class FakeWorker {
    terminated = false
    constructor() { created = this }
    postMessage(command) {
      if (command.type === 'start') queueMicrotask(() => this.onmessage({ data: { type: 'completed', durationMs: 100, backend: 'cpu', epochsCompleted: 2 } }))
      if (command.type === 'predict') queueMicrotask(() => this.onmessage({ data: { type: 'prediction', requestId: command.requestId, probabilities: [0.25, 0.75] } }))
    }
    terminate() { this.terminated = true }
  }
  globalThis.Worker = FakeWorker
  try {
    const events = []
    const session = startCnnTraining(config, options, (event) => events.push(event), dataset)
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(events.at(-1).type, 'completed')
    assert.equal(created.terminated, false, 'No debe liberar Worker al completar el entrenamiento')
    assert.deepEqual(await session.predict(new Uint8Array(64)), [0.25, 0.75])
    session.dispose()
    assert.equal(created.terminated, true)
    await assert.rejects(session.predict(new Uint8Array(64)), /primero completa/i)
  } finally { globalThis.Worker = OriginalWorker }
})

test('Worker que falla después de un evento no reinicia entrenamientos a escondidas', async () => {
  const OriginalWorker = globalThis.Worker
  class FakeWorker {
    terminated = false
    postMessage(command) {
      if (command.type === 'start') queueMicrotask(() => {
        this.onmessage({ data: { type: 'status', stage: 'fit', message: 'Trabajando', backend: 'cpu' } })
        this.onerror()
      })
    }
    terminate() { this.terminated = true }
  }
  globalThis.Worker = FakeWorker
  try {
    const events = []
    const session = startCnnTraining(config, options, (event) => events.push(event), dataset)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(events.map((event) => event.type), ['status', 'error'])
    await assert.rejects(session.predict(new Uint8Array(64)), /primero completa/i)
    session.dispose()
  } finally { globalThis.Worker = OriginalWorker }
})
