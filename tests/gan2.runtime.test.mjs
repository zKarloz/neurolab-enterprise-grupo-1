/** Ejecutar en VSCode con node_modules instalados: entrenamiento GAN TF.js CPU real. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as tf from '@tensorflow/tfjs'
import { DEFAULT_GAN_CONFIG, describeGan } from '../src/ml/gan/architecture.ts'
import { loadGanImageCsv } from '../src/ml/gan/imageDataset.ts'
import { buildGanModels, trainGanModel } from '../src/ml/gan/trainEngine.ts'
import { DEFAULT_GAN_TRAIN_OPTIONS } from '../src/ml/gan/trainingTypes.ts'

const fixture = readFileSync(new URL('./fixtures/gan1_imagenes_demo.csv', import.meta.url), 'utf8')
const input = () => loadGanImageCsv(new File([fixture], 'demo.csv', { type: 'text/csv' }))

test('GAN-2: redes TF.js reales coinciden con las formas y parámetros del diseñador', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const { generator, discriminator } = buildGanModels(DEFAULT_GAN_CONFIG, 8)
  const description = describeGan(DEFAULT_GAN_CONFIG, 8)
  assert.equal(generator.countParams(), description.generator.totalParameters)
  assert.equal(discriminator.countParams(), description.discriminator.totalParameters)
  assert.deepEqual(generator.outputs[0].shape.slice(1), [8, 8, 1])
  assert.deepEqual(discriminator.outputs[0].shape.slice(1), [1])
  const noise = tf.randomNormal([2, DEFAULT_GAN_CONFIG.latentSize])
  const images = generator.predict(noise)
  assert.deepEqual(images.shape, [2, 8, 8, 1])
  const decision = discriminator.predict(images)
  assert.deepEqual(decision.shape, [2, 1])
  decision.dispose(); images.dispose(); noise.dispose(); generator.dispose(); discriminator.dispose()
})

test('GAN-2: dos épocas CPU realmente optimizan D y G y producen métricas finitas', async () => {
  const dataset = await input()
  const events = []
  await trainGanModel(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
    (event) => events.push(event), () => false, new AbortController().signal, 'main')
  const terminal = events.at(-1)
  assert.equal(terminal.type, 'completed', terminal.message)
  assert.equal(terminal.epochsCompleted, 2)
  const rows = events.filter((event) => event.type === 'epoch').map((event) => event.metrics)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].epoch, 1)
  assert.equal(rows[1].epoch, 2)
  for (const row of rows) {
    assert.ok(Number.isFinite(row.generatorLoss) && row.generatorLoss > 0)
    assert.ok(Number.isFinite(row.discriminatorLoss) && row.discriminatorLoss > 0)
    assert.ok(row.realScore >= 0 && row.realScore <= 1)
    assert.ok(row.fakeScore >= 0 && row.fakeScore <= 1)
  }
  assert.ok(events.some((event) => event.type === 'status' && event.backend === 'cpu'))
  assert.ok(events.some((event) => event.type === 'batch'))
})

test('GAN-2: cancelación tras un minibatch no produce estado completed', async () => {
  const dataset = await input()
  let stopped = false
  const events = []
  await trainGanModel(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
    (event) => { events.push(event); if (event.type === 'batch') stopped = true },
    () => stopped, new AbortController().signal, 'main')
  assert.equal(events.at(-1).type, 'cancelled')
  assert.ok(!events.some((event) => event.type === 'completed'))
})
