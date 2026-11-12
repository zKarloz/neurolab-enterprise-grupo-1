/** GAN-4A: los documentos que pasarán a PostgreSQL son estrictamente agregados. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { ganRunPayload, ganEpochPayload, ganGenerationSummaryPayload } from '../src/ml/gan/persistencePayload.ts'

const projectId = 'eb66a49d-e8ad-4b83-b00a-142bdb02d03b'
const sha256 = 'a'.repeat(64)
const dataset = { name:'digits_0.csv', dimension:8, count:178,
  pixels:new Uint8Array(178*64), originalScale:16, hadLabels:true, truncated:false }
const model = {latentSize:32, generatorUnits:64, discriminatorUnits:64}
const opts = { epochs:100, batchSize:16, learningRate:0.0002 }

const run = (overrides = {}) => ganRunPayload(projectId,
  {name:'digits_0.csv', byteSize:27800, sha256}, dataset, model,
  {...opts, ...overrides})

test('GAN-4A: metadatos coherentes con GAN-3 y 100 épocas, familia generativa', () => {
  const payload = run()
  assert.equal(payload.p_seed,0)
  assert.equal(payload.p_schema_json.imageCount,178)
  assert.equal(payload.p_schema_json.originalScale,16)
  assert.equal(payload.p_schema_json.pixelCount,64)
  assert.equal(payload.p_preprocessing_json.family,'gan')
  assert.equal(payload.p_preprocessing_json.seedMode,'unseeded')
  assert.equal(payload.p_preprocessing_json.unconditional,true)
  assert.equal(payload.p_architecture_config.kind,'dense_unconditional_v1')
  assert.equal(payload.p_hyperparameters_json.epochs,100)
  assert.equal(payload.p_hyperparameters_json.noiseDistribution,'normal_unseeded')
})

test('GAN-4A: no transporta píxeles/CSV/ruido ni imágenes en metadatos', () => {
  const text = JSON.stringify(run()).toLowerCase()
  for (const key of ['"pixels"','"rows"','"images"','"examples"','"generated"','"labels"','"samples"','"noise"']) {
    assert.equal(text.includes(key),false,`Campo privado no permitido: ${key}`)
  }
  assert.ok(text.length < 4000)
})

test('GAN-4A: normalización y tamaños se reflejan sin inventar una semilla reproducible', () => {
  const payload = ganRunPayload(projectId, {name:'digits.csv',byteSize:200000,sha256},
    {...dataset,dimension:28,count:120,pixels:new Uint8Array(120*784),originalScale:255},
    {...model,latentSize:64},{...opts,epochs:50})
  assert.equal(payload.p_schema_json.pixelCount,784)
  assert.equal(payload.p_preprocessing_json.normalization,'tanh_minus1_plus1')
  assert.equal(payload.p_hyperparameters_json.epochs,50)
  assert.equal(payload.p_seed,0)
})

test('GAN-4A: rechaza errores de hash, proyecto y opciones de entrenamiento', () => {
  assert.throws(() => ganRunPayload('no-uuid',{name:'x.csv',byteSize:100,sha256},dataset,model,opts))
  assert.throws(() => ganRunPayload(projectId,{name:'x.csv',byteSize:100,sha256:'x'},dataset,model,opts))
  assert.throws(() => run({epochs:101}),/épocas/i)
  assert.throws(() => ganRunPayload(projectId,{name:'x.csv',byteSize:100,sha256},
    {...dataset,count:99},model,opts))
})

test('GAN-4A: métricas reales por época conservan nombres del servidor', () => {
  assert.deepEqual(ganEpochPayload(projectId, {epoch:2,generatorLoss:0.71,
    discriminatorLoss:1.32,realScore:0.54,fakeScore:0.49}), {
    p_run_id:projectId,p_epoch:2,p_generator_loss:0.71,p_discriminator_loss:1.32,
    p_real_score:0.54,p_fake_score:0.49,
  })
})

test('GAN-4A: resumen 8x8 se calcula desde 4 muestras pero no transmite ninguna', () => {
  const pixels = new Uint8Array(4*64)
  pixels.fill(100,0,64); pixels.fill(150,64,128); pixels.fill(50,128,192); pixels.fill(200,192,256)
  const result = ganGenerationSummaryPayload(projectId,{count:4,dimension:8,pixels})
  assert.equal(result.p_metrics.family,'gan')
  assert.equal(result.p_metrics.kind,'descriptive_only')
  assert.equal(result.p_metrics.sampleCount,4)
  assert.equal(result.p_metrics.meanIntensity,125)
  assert.equal(result.p_metrics.minimumPixel,50)
  assert.equal(result.p_metrics.maximumPixel,200)
  assert.equal(result.p_metrics.meanPairwiseDistance>0,true)
  assert.equal('pixels' in result.p_metrics,false)
  assert.equal('images' in result.p_metrics,false)
})
