import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('RNN-4C: exporta solo tras completar y confirma persistencia antes de publicar', () => {
  const page = read('src/features/rnn/RnnPage.tsx')
  assert.match(page, /syncState !== 'confirmed'\s*\|\|\s*!evaluationSaved/)
  assert.match(page, /trainingSession\.current\.exportModel\(\)|activeSession\.exportModel\(\)/)
  assert.match(page, /saveModelVersion\(runId, name, bundle\)/)
  assert.match(page, /publishedVersion/)
  assert.match(page, /projectId.*modelos|projectId\}\/modelos/)
})

test('RNN-4C: protocolo Worker exporta pesos transferibles y rechaza RPC desde Worker', () => {
  const worker = read('src/workers/rnn.worker.ts')
  const session = read('src/ml/rnn/trainingSession.ts')
  const engine = read('src/ml/rnn/trainEngine.ts')
  assert.match(worker, /command\.type === 'export-model'/)
  assert.match(worker, /\[bundle\.weightData\]/)
  assert.match(session, /pendingExports/)
  assert.match(session, /rejectPending\('La sesión RNN fue liberada\.'/)
  assert.match(engine, /serializeDenseModel\(readyModel\)/)
  assert.doesNotMatch(worker, /from ['"].*supabase|\.rpc\(/)
})

test('RNN-4C: Modelos privados conserva las tres familias y distinción de predictor', () => {
  const page = read('src/features/models/ModelRegistryPage.tsx')
  const service = read('src/services/modelRegistry.ts')
  for (const family of ["'feedforward'", "'cnn'", "'rnn'"]) assert.ok(page.includes(family))
  for (const method of ['loadRnnPredictor', 'loadCnnPredictor', 'loadDensePredictor', 'RnnRestoredPredictionCard']) assert.ok(page.includes(method))
  assert.match(service, /RnnPreprocessingManifest/)
  assert.match(service, /sha256/)
  assert.doesNotMatch(read('src/features/models/RnnRestoredPredictionCard.tsx'), /\.rpc\(|\.upload\(|\.insert\(/)
})

test('RNN-4C: no hay nueva migración y persiste con F5 + metadatos RNN-4A', () => {
  const sql = read('supabase/tests/FASE_7_RNN4C_VERIFICACION.sql')
  assert.match(sql, /model_versions/)
  assert.match(sql, /preprocessing_manifest/)
  assert.match(sql, /'rnn'/)
  assert.match(read('src/services/modelRegistry.ts'), /reserve_model_upload/)
  assert.match(read('src/services/modelRegistry.ts'), /publish_model_version/)
})
