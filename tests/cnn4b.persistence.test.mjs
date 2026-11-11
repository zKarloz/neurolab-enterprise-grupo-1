/** Pruebas puras: no consumen créditos de Supabase ni crean datos ficticios en BD. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { IncrementalSha256, sha256LocalFile } from '../src/ml/cnn/sha256Stream.ts'
import { cnnRunPayload, cnnEvaluationSummary } from '../src/ml/cnn/persistencePayload.ts'
import { createCnnPersistenceQueue } from '../src/ml/cnn/persistenceQueue.ts'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('SHA-256 incremental coincide con Node para bloques, chunks y longitud vacía', () => {
  for (const length of [0, 1, 3, 55, 56, 63, 64, 65, 127, 128, 257, 4096, 70001]) {
    const bytes = randomBytes(length)
    const sha = new IncrementalSha256()
    for (let offset = 0; offset < length; offset += 17) sha.update(bytes.subarray(offset, offset + 17))
    assert.equal(sha.digestHex(), createHash('sha256').update(bytes).digest('hex'))
    assert.throws(() => sha.digestHex(), /finaliz/)
  }
})

test('SHA-256 lee un archivo entero por stream aunque exista una muestra limitada', async () => {
  const bytes = randomBytes(122334)
  const file = new File([bytes], 'dataset.csv', { type: 'text/csv' })
  assert.equal(await sha256LocalFile(file), createHash('sha256').update(bytes).digest('hex'))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(sha256LocalFile(file, controller.signal), /cancelad/)
})

test('Payload CNN solo incluye agregados, huella completa y split 70/15/15 reproducible', () => {
  const count = 120
  const dataset = {
    name: 'digits.csv', width: 8, height: 8, channels: 1, count,
    classNames: ['0','1','2'], originalScale: 16, truncated: false,
    labels: Uint8Array.from({ length: count }, (_, i) => i % 3), pixels: new Uint8Array(64 * count),
  }
  const config = { blocks: [{ id: 'block-1', filters: 16, kernel: 3, padding: 'same', pool: true }], denseUnits: 64 }
  const options = { samples: 100, epochs: 2, batchSize: 16, learningRate: 0.001 }
  const a = cnnRunPayload('proyecto', dataset, 2222, 'a'.repeat(64), config, options)
  const b = cnnRunPayload('proyecto', dataset, 2222, 'a'.repeat(64), config, options)
  assert.deepEqual(a, b)
  assert.equal(a.p_row_count, 120)
  assert.equal(a.p_byte_size, 2222)
  assert.equal(a.p_file_hash, 'a'.repeat(64))
  assert.equal(Object.values(a.p_preprocessing_json.split).filter(Number.isInteger).reduce((x,y) => x+y,0),100)
  for (const forbidden of ['pixels','labels','examples','probabilities','testIndices']) {
    assert.equal(JSON.stringify(a).includes(`"${forbidden}"`), false)
  }
  assert.equal(a.p_schema_json.classNames.length, 3)
})

test('La evaluación enviada omite ejemplos y probabilidades por fila', () => {
  const report = { classNames: ['cero','uno'], sampleCount:2, loss:.2, accuracy:1,
    macroPrecision:1, macroRecall:1, macroF1:1, matrix:[[1,0],[0,1]],
    examples: [{pixels:new Uint8Array([23]),probabilities:[.9,.1]}],
    classes: [{label:'cero', support:1, precision:1,recall:1,f1:1}],
  }
  const summary = cnnEvaluationSummary(report)
  assert.equal(summary.problemType,'multiclass')
  assert.equal(Object.hasOwn(summary,'examples'),false)
  assert.equal(Object.hasOwn(summary,'classes'),false)
  assert.equal(JSON.stringify(summary).includes('pixels'),false)
})

test('La cola confirma runtime→época→evaluación→fin sin superar una RPC fallida', async () => {
  const calls = [], confirms = [], errors = []
  const adapter = {
    runtime: async () => { calls.push('runtime') },
    epoch: async (_id,m) => { calls.push(`epoch${m.epoch}`) },
    evaluation: async () => { calls.push('evaluation') },
    finish: async (_id,s) => { calls.push(s) },
  }
  const notes = { epochConfirmed: n => confirms.push(n), evaluationConfirmed: () => confirms.push('evaluation'),
    finishedConfirmed: s => confirms.push(s), failed: e => errors.push(e) }
  const q = createCnnPersistenceQueue('x',adapter,notes)
  const metrics = { epoch:1, loss:.2, validationLoss:.3, accuracy:.8, validationAccuracy:.7 }
  q.runtime('cpu','worker','4.22.0'); q.runtime('cpu','worker','4.22.0')
  q.epoch(metrics); q.evaluation({}); q.finish('completed'); q.finish('completed')
  await q.idle()
  assert.deepEqual(calls, ['runtime','epoch1','evaluation','completed'])
  assert.deepEqual(confirms, [1,'evaluation','completed']); assert.deepEqual(errors,[])

  calls.length=0; confirms.length=0
  const broken = createCnnPersistenceQueue('x', { ...adapter, epoch: async () => {throw Error('Red interrumpida')}},notes)
  broken.runtime('cpu','worker','4.22.0'); broken.epoch(metrics); broken.evaluation({}); broken.finish('completed')
  await broken.idle()
  assert.deepEqual(calls,['runtime'])
  assert.equal(errors.at(-1),'Red interrumpida')
  assert.equal(broken.hasFailed,true)
})

test('CNN-4B conserva servicios y RPC de Feedforward sin modificar SQL', () => {
  const page = source('../src/features/cnn/CnnPage.tsx')
  const service = source('../src/services/cnnPersistence.ts')
  const engine = source('../src/ml/cnn/trainEngine.ts')
  assert.ok(page.indexOf('await createCnnRun') < page.indexOf('session.current = startCnnTraining'))
  for (const rpc of ['create_cnn_training_run','record_cnn_training_epoch','record_cnn_test_evaluation','finish_training_run']) {
    assert.match(service,new RegExp(rpc))
  }
  assert.match(engine, /context: environment, tfjsVersion: tf\.version\.tfjs/)
  assert.match(page, /sha256LocalFile\(file, controller.signal\)/)
  assert.match(source('../src/services/trainingPersistence.ts'), /create_training_run/)
  assert.match(source('../src/services/evaluationPersistence.ts'), /record_test_evaluation/)
})
