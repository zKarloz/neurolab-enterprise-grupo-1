/** GAN-5: continuidad de métricas adversariales, resumen agregado y cierre remoto. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createGanPersistenceQueue } from '../src/ml/gan/persistenceQueue.ts'
import { assembleGanHistoryEpochs, parseGanStoredEvaluation } from '../src/ml/evaluation/ganStoredEvaluation.ts'

const metric = (epoch) => ({ epoch, generatorLoss: 0.72, discriminatorLoss: 1.21,
  realScore: 0.55, fakeScore: 0.43 })
const batch = { count: 8, dimension: 8, pixels: new Uint8Array(8 * 64) }
const summary = { family: 'gan', kind: 'descriptive_only', sampleCount: 8, dimension: 8,
  meanIntensity: 72, meanPairwiseDistance: 22.3, minimumPixel: 0, maximumPixel: 248 }

function queueStub(epochs) {
  const calls = []
  const adapter = {
    runtime: async () => { calls.push('runtime') },
    epoch: async (_id, m) => { calls.push(`epoch:${m.epoch}`) },
    finish: async (_id, status) => { calls.push(`finish:${status}`) },
    summary: async () => { calls.push('summary') },
  }
  const queue = createGanPersistenceQueue('gan-test-run', epochs, adapter, {
    epochConfirmed() {}, finishedConfirmed() {}, failed() {},
  })
  return { calls, queue }
}

test('GAN-5: se confirman 100 épocas reales antes del estado completed', async () => {
  const { queue, calls } = queueStub(100)
  queue.runtime('cpu', 'worker', '4.22.0')
  for (let ep = 1; ep <= 100; ep++) queue.epoch(metric(ep))
  queue.finish('completed')
  await queue.idle()
  assert.equal(queue.isCompletedConfirmed, true)
  assert.equal(calls.length, 102)
  assert.equal(calls[0], 'runtime')
  assert.equal(calls.at(-1), 'finish:completed')
  assert.equal(calls.at(-2), 'epoch:100')
  assert.equal(await queue.summary(batch), true)
  assert.equal(await queue.summary(batch), false)
  assert.equal(calls.filter((op) => op === 'summary').length, 1)
})

test('GAN-5: un entrenamiento incompleto no se registra como terminado ni genera resumen', async () => {
  const { queue, calls } = queueStub(100)
  queue.runtime('cpu', 'worker', '4.22.0')
  queue.epoch(metric(1))
  queue.finish('completed')
  await queue.idle()
  assert.equal(queue.isCompletedConfirmed, false)
  assert.equal(await queue.summary(batch), false)
  assert.ok(calls.includes('finish:failed'))
  assert.ok(!calls.includes('summary'))
})

test('GAN-5: historial recupera exactamente cuatro métricas por cada una de 100 épocas', () => {
  const rows = Array.from({ length: 100 }, (_, index) => {
    const ep = index + 1
    return [
      { epoch: ep, split: 'train', metric_name: 'generator_loss', metric_value: 0.7 },
      { epoch: ep, split: 'train', metric_name: 'discriminator_loss', metric_value: 1.3 },
      { epoch: ep, split: 'train', metric_name: 'd_real', metric_value: 0.56 },
      { epoch: ep, split: 'train', metric_name: 'd_fake', metric_value: 0.48 },
    ]
  }).flat()
  assert.equal(rows.length, 400)
  const reconstructed = assembleGanHistoryEpochs(rows)
  assert.equal(reconstructed.length, 100)
  assert.equal(reconstructed[99].epoch, 100)
  assert.ok(!('accuracy' in reconstructed[0]))
})

test('GAN-5: el resumen almacenado es descriptivo y no acepta imágenes ni etiquetas', () => {
  assert.deepEqual(parseGanStoredEvaluation(summary), summary)
  for (const invalid of [{ ...summary, pixels: [1, 2, 3] },
    { ...summary, images: [] }, { ...summary, examples: ['0'] },
    { ...summary, accuracy: 0.99 }, { ...summary, meanIntensity: Number.NaN }]) {
    assert.throws(() => parseGanStoredEvaluation(invalid))
  }
})
