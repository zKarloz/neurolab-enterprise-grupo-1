import test from 'node:test'
import assert from 'node:assert/strict'
import { parseModelJson, MAX_MODEL_JSON_BYTES } from '../src/ml/models/manifest.ts'

const weightData = new Uint8Array(16).buffer
const valid = { modelTopology: { class_name: 'Sequential', config: [] },
  weightsManifest: [{ paths: ['weights.bin'], weights: [{ name: 'dense/kernel', shape: [2,2], dtype: 'float32' }] }] }

test('manifest TF.js Layers acepta archivo de pesos local único', () => {
  assert.equal(parseModelJson(JSON.stringify(valid), weightData).weightsManifest[0].paths[0], 'weights.bin')
})
test('rechaza manifest con ruta remota que podría escapar del bucket', () => {
  assert.throws(() => parseModelJson(JSON.stringify({ ...valid, weightsManifest: [{ ...valid.weightsManifest[0], paths: ['https://evil.example/weights.bin'] }] }), weightData), /manifiesto/i)
})
test('rechaza shards extras, archivos vacíos y topologías malformadas', () => {
  assert.throws(() => parseModelJson(JSON.stringify({ ...valid, weightsManifest: [...valid.weightsManifest, ...valid.weightsManifest] }), weightData))
  assert.throws(() => parseModelJson(JSON.stringify(valid), new ArrayBuffer(0)))
  assert.throws(() => parseModelJson(JSON.stringify({ modelTopology: 0, weightsManifest: valid.weightsManifest }), weightData))
  assert.throws(() => parseModelJson('x'.repeat(MAX_MODEL_JSON_BYTES+1),weightData))
})
