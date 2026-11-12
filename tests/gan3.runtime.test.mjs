/** Ejecutar con node_modules instalados: GAN-3 entrena, retiene G y genera imágenes reales. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as tf from '@tensorflow/tfjs'
import { DEFAULT_GAN_CONFIG } from '../src/ml/gan/architecture.ts'
import { loadGanImageCsv } from '../src/ml/gan/imageDataset.ts'
import { trainGanModel } from '../src/ml/gan/trainEngine.ts'
import { DEFAULT_GAN_TRAIN_OPTIONS } from '../src/ml/gan/trainingTypes.ts'
import { summarizeGanGeneratedBatch } from '../src/ml/gan/generation.ts'

const fixture = readFileSync(new URL('./fixtures/gan1_imagenes_demo.csv', import.meta.url), 'utf8')
const input = () => loadGanImageCsv(new File([fixture], 'gan3.csv', { type: 'text/csv' }))

test('GAN-3: G conserva los pesos tras dos épocas, genera 4 y 8 imágenes y se puede liberar', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const dataset = await input()
  const events = []
  let trained = null
  await trainGanModel(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
    (event) => events.push(event), () => false, new AbortController().signal, 'main',
    (runtime) => { trained = runtime })
  assert.equal(events.at(-1)?.type, 'completed', events.at(-1)?.message)
  assert.ok(trained, 'Los pesos entrenados de G deben quedar disponibles')
  try {
    const one = await trained.generate(4)
    const two = await trained.generate(8)
    assert.equal(one.dimension, 8)
    assert.equal(one.count, 4)
    assert.equal(one.pixels.length, 4 * 64)
    assert.equal(two.pixels.length, 8 * 64)
    const summary = summarizeGanGeneratedBatch(two)
    assert.ok(summary.meanIntensity >= 0 && summary.meanIntensity <= 255)
    assert.ok(summary.meanPairwiseDistance >= 0 && summary.meanPairwiseDistance <= 255)
    assert.ok([...one.pixels].some((pixel) => pixel !== one.pixels[0]), 'La salida debe tener valores distintos entre píxeles')
    assert.notDeepEqual([...one.pixels], [...two.pixels.slice(0, 4 * 64)], 'Cada generación recibe ruido nuevo')
    await assert.rejects(trained.generate(5), /4, 8 o 16/)
  } finally {
    trained.dispose()
  }
  await assert.rejects(trained.generate(4), /liberado/)
})

test('GAN-3: cancelar entrenamiento nunca entrega un generador', async () => {
  const dataset = await input()
  let stopped = false
  let trained = null
  const events = []
  await trainGanModel(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
    (event) => { events.push(event); if (event.type === 'batch') stopped = true }, () => stopped,
    new AbortController().signal, 'main', (runtime) => { trained = runtime })
  assert.equal(events.at(-1)?.type, 'cancelled')
  assert.equal(trained, null)
})
