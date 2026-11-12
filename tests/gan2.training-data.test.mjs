import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadGanImageCsv } from '../src/ml/gan/imageDataset.ts'
import { DEFAULT_GAN_CONFIG } from '../src/ml/gan/architecture.ts'
import { makeGanRealBatch, shuffledGanIndices, validateGanTrainingData } from '../src/ml/gan/trainingData.ts'
import { validateGanEpochMetrics, validateGanTrainOptions, DEFAULT_GAN_TRAIN_OPTIONS } from '../src/ml/gan/trainingTypes.ts'

const fixture = readFileSync(new URL('./fixtures/gan1_imagenes_demo.csv', import.meta.url), 'utf8')
const datasetPromise = loadGanImageCsv(new File([fixture], 'demo.csv', { type: 'text/csv' }))

test('GAN-2: la normalización usa píxeles reales y produce [-1,1] sin etiquetas', async () => {
  const dataset = await datasetPromise
  validateGanTrainingData(dataset, DEFAULT_GAN_CONFIG)
  const batch = makeGanRealBatch(dataset, [0, 1, 119])
  assert.equal(batch.length, 3 * 64)
  for (let i = 0; i < batch.length; i++) {
    assert.ok(batch[i] >= -1 && batch[i] <= 1)
  }
  assert.ok(batch.some((pixel) => pixel === -1))
  assert.ok(batch.some((pixel) => pixel === 1))
  assert.equal(dataset.count, 120)
  assert.equal(dataset.pixels.length, 120 * 64)
})

test('GAN-2: minibatches solo aceptan índices y tamaños válidos', async () => {
  const dataset = await datasetPromise
  assert.throws(() => makeGanRealBatch(dataset, []), /Batch/)
  assert.throws(() => makeGanRealBatch(dataset, [-1]), /Índice/)
  assert.throws(() => makeGanRealBatch(dataset, [120]), /Índice/)
  assert.throws(() => makeGanRealBatch(dataset, Array(65).fill(0)), /Batch/)
  assert.throws(() => validateGanTrainingData({ ...dataset, pixels: new Uint8Array(20) }, DEFAULT_GAN_CONFIG), /Forma/)
  assert.throws(() => validateGanTrainingData(dataset, { ...DEFAULT_GAN_CONFIG, generatorUnits: 1 }), /rango/)
})

test('GAN-2: barajado conserva todos los índices sin repeticiones', () => {
  const indices = shuffledGanIndices(120)
  assert.equal(indices.length, 120)
  assert.deepEqual([...indices].sort((a, b) => a - b), Array.from({ length: 120 }, (_, i) => i))
  assert.throws(() => shuffledGanIndices(99), /Cantidad/)
})

test('GAN-2: opciones válidas y rechazo de métricas no finitas o simuladas', () => {
  validateGanTrainOptions(DEFAULT_GAN_TRAIN_OPTIONS)
  // GAN-3 amplió el límite a 100; 50 debe aceptarse y 101 rechazarse.
  validateGanTrainOptions({ ...DEFAULT_GAN_TRAIN_OPTIONS, epochs: 50 })
  validateGanTrainOptions({ ...DEFAULT_GAN_TRAIN_OPTIONS, epochs: 100 })
  assert.throws(() => validateGanTrainOptions({ ...DEFAULT_GAN_TRAIN_OPTIONS, epochs: 101 }), /épocas/i)
  assert.throws(() => validateGanTrainOptions({ ...DEFAULT_GAN_TRAIN_OPTIONS, batchSize: 1 }), /batch/)
  const metrics = { epoch: 1, generatorLoss: 0.8, discriminatorLoss: 1.3, realScore: 0.5, fakeScore: 0.4 }
  assert.deepEqual(validateGanEpochMetrics(metrics), metrics)
  assert.throws(() => validateGanEpochMetrics({ ...metrics, generatorLoss: Number.NaN }), /no finita/)
  assert.throws(() => validateGanEpochMetrics({ ...metrics, fakeScore: 1.2 }), /fuera de rango/)
})
