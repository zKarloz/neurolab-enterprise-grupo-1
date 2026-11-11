/**
 * Runtime real CNN-4C: sin red ni Supabase; usa TensorFlow.js CPU.
 * Ejecutar DESPUÉS de npm ci: node --experimental-strip-types --test tests/cnn4c.runtime.test.mjs
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import * as tf from '@tensorflow/tfjs'
import { serializeDenseModel } from '../src/ml/models/artifacts.ts'
import { loadCnnPredictor, parseCnnPreprocessingManifest } from '../src/ml/cnn/modelPersistence.ts'

const manifest = {
  family: 'cnn', kind: 'cnn_image_csv_v1', width: 8, height: 8, channels: 1,
  classNames: ['0', '1', '2'], normalization: 'divide_by_255', seed: 42,
  sampleCount: 120, split: { strategy: 'stratified_70_15_15_v1', trainCount: 84, validationCount: 18, testCount: 18 },
}

test('Manifiesto rechaza datos de otra familia, clases duplicadas y particiones imposibles', () => {
  assert.equal(parseCnnPreprocessingManifest(manifest).width, 8)
  assert.throws(() => parseCnnPreprocessingManifest({ ...manifest, family: 'feedforward' }), /CNN/)
  assert.throws(() => parseCnnPreprocessingManifest({ ...manifest, classNames: ['0', '0'] }), /CNN/)
  assert.throws(() => parseCnnPreprocessingManifest({ ...manifest, split: { ...manifest.split, testCount: 0 } }), /CNN/)
})

test('Guardar/recuperar Conv2D y obtener probabilidades iguales sin CSV', async () => {
  await tf.setBackend('cpu'); await tf.ready()
  const original = tf.sequential()
  original.add(tf.layers.conv2d({ inputShape: [8, 8, 1], filters: 2, kernelSize: [3, 3], activation: 'relu', padding: 'same' }))
  original.add(tf.layers.flatten())
  original.add(tf.layers.dense({ units: 3, activation: 'softmax' }))
  const pixels = Uint8Array.from({ length: 64 }, (_, i) => (i * 17) % 256)
  const input = tf.tensor4d(Float32Array.from(pixels, (n) => n / 255), [1, 8, 8, 1])
  let restored
  try {
    const baselineTensor = original.predict(input)
    const baseline = Array.from(await baselineTensor.data()); baselineTensor.dispose()
    const bundle = await serializeDenseModel(original)
    assert.ok(bundle.weightData.byteLength > 0)
    restored = await loadCnnPredictor(bundle, manifest)
    const result = await restored.predict(pixels)
    assert.equal(result.length, 3)
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(result[i] - baseline[i]) < 1e-5)
    await assert.rejects(restored.predict(new Uint8Array(9)), /dimensiones/)
    restored.dispose()
    await assert.rejects(restored.predict(pixels), /liberada/)
  } finally { restored?.dispose(); input.dispose(); original.dispose() }
})
