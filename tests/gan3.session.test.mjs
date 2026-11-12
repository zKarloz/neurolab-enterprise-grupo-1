/** GAN-3: contrato de mensajes y ciclo de vida Worker sin TF.js ni servidor. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_GAN_CONFIG } from '../src/ml/gan/architecture.ts'
import { DEFAULT_GAN_TRAIN_OPTIONS } from '../src/ml/gan/trainingTypes.ts'
import { startGanTraining } from '../src/ml/gan/trainingSession.ts'

const dataset = { name: 'demo.csv', dimension: 8, count: 120,
  pixels: new Uint8Array(120 * 64), originalScale: 16, truncated: false, hadLabels: true }

/** Simula solo el transporte; no sustituye las pruebas runtime de TensorFlow.js. */
class FakeWorker {
  static instances = []
  autoGenerate = true
  terminated = false
  constructor() { FakeWorker.instances.push(this) }
  postMessage(command) {
    if (command.type === 'start') {
      queueMicrotask(() => {
        this.onmessage?.({ data: { type: 'status', message: 'running', backend: 'cpu', context: 'worker', tfjsVersion: 'test', images: 120 } })
        this.onmessage?.({ data: { type: 'completed', backend: 'cpu', epochsCompleted: 2, durationMs: 10 } })
      })
    }
    if (command.type === 'generate' && this.autoGenerate) {
      queueMicrotask(() => this.onmessage?.({ data: { type: 'generated', requestId: command.requestId,
        batch: { count: command.count, dimension: 8, pixels: new Uint8Array(command.count * 64) } } }))
    }
  }
  terminate() { this.terminated = true }
}

async function withFakeWorker(fn) {
  const previous = globalThis.Worker
  globalThis.Worker = FakeWorker
  try { await fn() } finally { globalThis.Worker = previous }
}

test('GAN-3: completed conserva Worker para generar y dispose lo termina', async () => {
  await withFakeWorker(async () => {
    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    const events = []
    const session = startGanTraining(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS, (event) => {
      events.push(event)
      if (event.type === 'completed') resolveDone()
    })
    await done
    const worker = FakeWorker.instances.at(-1)
    assert.equal(worker.terminated, false)
    assert.equal(events.at(-1).type, 'completed')
    const batch = await session.generate(8)
    assert.equal(batch.pixels.length, 8 * 64)
    session.dispose()
    assert.equal(worker.terminated, true)
    await assert.rejects(session.generate(4), /Primero debes completar/)
  })
})

test('GAN-3: dispose rechaza una generación pendiente', async () => {
  await withFakeWorker(async () => {
    let resolveDone
    const done = new Promise((resolve) => { resolveDone = resolve })
    const session = startGanTraining(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
      (event) => { if (event.type === 'completed') resolveDone() })
    await done
    FakeWorker.instances.at(-1).autoGenerate = false
    const pending = session.generate(4)
    session.dispose()
    await assert.rejects(pending, /sesión GAN terminó/)
  })
})
