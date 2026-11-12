import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('RNN-2: el motor usa TensorFlow.js SimpleRNN/LSTM con tensores temporales', () => {
  const engine = read('src/ml/rnn/trainEngine.ts')
  assert.match(engine, /tf\.layers\.lstm\(/)
  assert.match(engine, /tf\.layers\.simpleRNN\(/)
  assert.match(engine, /tf\.tensor3d\(/)
  assert.match(engine, /prepared\.train/)
  assert.match(engine, /prepared\.validation/)
  assert.doesNotMatch(engine, /prepared\.test\.x|prepared\.test\.y/)
  assert.match(engine, /\.dispose\(\)/)
})

test('RNN-2: Worker separado con fallback solo anterior a entrenamiento iniciado', () => {
  const session = read('src/ml/rnn/trainingSession.ts')
  const worker = read('src/workers/rnn.worker.ts')
  assert.match(session, /new Worker\(new URL/)
  assert.match(session, /if \(!delivered\) runMain\(\)/)
  assert.match(session, /abort\?\.abort\(\)/)
  assert.match(worker, /type === 'cancel'/)
})

test('RNN-2: el ingeniero autorizado tiene controles; no aparecen RPC ni resultados simulados', () => {
  const page = read('src/features/rnn/RnnPage.tsx')
  const panel = read('src/features/rnn/RnnTrainingPanel.tsx')
  assert.match(page, /membership\?\.role === 'engineer' && project\?\.status === 'active'/)
  assert.match(page, /trainingSession\.current\?\.dispose/)
  assert.match(page, /RnnTrainingPanel/)
  assert.match(panel, /<RnnMetricsChart/)
  assert.doesNotMatch(page, /\.rpc\(|\.insert\(|\.update\(/)
  assert.doesNotMatch(panel, /Math\.random\(/)
})
