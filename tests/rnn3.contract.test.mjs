import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
test('RNN-3: evaluar test solo después de fit y sin alimentar sus entradas a fit', () => {
  const engine = read('src/ml/rnn/trainEngine.ts')
  assert.ok(engine.indexOf('await model.fit(') < engine.indexOf('const testPartition = prepared.test'))
  assert.match(engine, /summarizeRnnTest\(prepared, values\)/)
  assert.match(engine, /testOutput\?\.dispose\(\)/)
  assert.match(engine, /if \(!retained\) model\?\.dispose\(\)/)
})
test('RNN-3: Worker conserva modelo para inferir, y página libera sesión al salir', () => {
  const session = read('src/ml/rnn/trainingSession.ts')
  const worker = read('src/workers/rnn.worker.ts')
  const page = read('src/features/rnn/RnnPage.tsx')
  assert.match(session, /predict: async \(seriesId: string\)/)
  assert.match(session, /worker\?\.terminate\(\)/)
  assert.match(worker, /type === 'predict'/)
  assert.match(worker, /runtime\?\.dispose\(\)/)
  assert.match(page, /trainingSession\.current\?\.dispose\(\)/)
  assert.match(page, /<RnnEvaluationPanel/)
  assert.match(page, /<RnnPredictionPanel/)
  assert.doesNotMatch(page, /\.rpc\(|\.insert\(|\.update\(/)
})
