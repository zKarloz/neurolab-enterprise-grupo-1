// Ejecutar después de npm install: serialize -> load (TF.js real) -> comparar predicción.
import test from 'node:test'
import assert from 'node:assert/strict'
import * as tf from '@tensorflow/tfjs'
import { loadDensePredictor, serializeDenseModel } from '../src/ml/models/artifacts.ts'

test('una versión serializada recupera pesos reales con la misma predicción', async () => {
  await tf.setBackend('cpu')
  await tf.ready()
  const model = tf.sequential()
  model.add(tf.layers.dense({ inputShape: [2], units: 3, activation: 'relu' }))
  model.add(tf.layers.dense({ units: 1, activation: 'linear' }))
  model.compile({ optimizer: 'sgd', loss: 'meanSquaredError' })
  const xs = tf.tensor2d([[1,2],[3,4],[5,6]], [3,2])
  const ys = tf.tensor2d([[2],[4],[6]], [3,1])
  let restored
  try {
    await model.fit(xs,ys,{ epochs: 2, batchSize: 1, verbose: 0 })
    const originalTensor = model.predict(tf.tensor2d([[2,3]],[1,2]))
    const original = (await originalTensor.data())[0]
    originalTensor.dispose()
    const bundle = await serializeDenseModel(model)
    assert.ok(bundle.weightData.byteLength > 0)
    assert.match(bundle.modelJson,/weights\.bin/)
    restored = await loadDensePredictor(bundle)
    const second = await restored.predict([2,3])
    assert.ok(Number.isFinite(second))
    assert.ok(Math.abs(original-second)<1e-5, `Se perdió precisión al restaurar: ${original}, ${second}`)
  } finally { restored?.dispose(); model.dispose(); xs.dispose(); ys.dispose() }
})
