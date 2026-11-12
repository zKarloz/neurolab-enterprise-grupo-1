/** Integración real: ejecutar en VSCode con @tensorflow/tfjs instalado (CPU). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as tf from '@tensorflow/tfjs'
import { DEFAULT_GAN_CONFIG } from '../src/ml/gan/architecture.ts'
import { loadGanImageCsv } from '../src/ml/gan/imageDataset.ts'
import { trainGanModel } from '../src/ml/gan/trainEngine.ts'
import { DEFAULT_GAN_TRAIN_OPTIONS } from '../src/ml/gan/trainingTypes.ts'
import { loadGanGenerator } from '../src/ml/gan/modelPersistence.ts'
import { parseModelJson } from '../src/ml/models/manifest.ts'

const fixture = readFileSync(new URL('./fixtures/gan1_imagenes_demo.csv', import.meta.url), 'utf8')
const manifest = { family: 'gan', kind: 'gan_grayscale_csv_v1', dimension: 8,
  channels: 1, pixelRange: 'zero_to_255', normalization: 'tanh_minus1_plus1',
  latentSize: 32, unconditional: true, trainedImages: 120, seedMode: 'unseeded' }

test('GAN-4C: entrena G, exporta pesos, restaura, genera 4/8 imágenes y libera', async () => {
  await tf.setBackend('cpu'); await tf.ready()
  const dataset = await loadGanImageCsv(new File([fixture], 'gan4c.csv', {type: 'text/csv'}))
  let trained = null
  const events = []
  await trainGanModel(dataset, DEFAULT_GAN_CONFIG, DEFAULT_GAN_TRAIN_OPTIONS,
    (event) => events.push(event), () => false, new AbortController().signal, 'main',
    (generator) => { trained = generator })
  assert.equal(events.at(-1)?.type, 'completed', events.at(-1)?.message)
  assert.ok(trained)
  let bundle
  try {
    bundle = await trained.exportModel()
    const json = parseModelJson(bundle.modelJson, bundle.weightData)
    assert.equal(json.weightsManifest.length, 1)
    assert.ok(!bundle.modelJson.includes('discriminator'), 'No se debe exportar D')
  } finally { trained.dispose() }
  const restored = await loadGanGenerator(bundle, manifest)
  try {
    assert.equal((await restored.generate(4)).pixels.length, 4 * 64)
    assert.equal((await restored.generate(8)).pixels.length, 8 * 64)
    await assert.rejects(restored.generate(3), /4, 8 o 16/)
  } finally { restored.dispose() }
  await assert.rejects(restored.generate(4), /liberado/)
  await assert.rejects(loadGanGenerator(bundle, { ...manifest, dimension: 28 }), /topología/)
})
