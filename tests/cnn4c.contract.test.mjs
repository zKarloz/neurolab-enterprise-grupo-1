/** Inspección estructural CNN-4C: sin conexión a Supabase, sin credenciales. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')

test('CNN exporta modelo desde Worker y fallback principal con requestId tipado', () => {
  const session = read('src/ml/cnn/cnnSession.ts')
  const worker = read('src/workers/cnn.worker.ts')
  const engine = read('src/ml/cnn/trainEngine.ts')
  const types = read('src/ml/cnn/trainingTypes.ts')
  assert.match(session, /exportModel:\s*async/)
  assert.match(session, /pendingExports/)
  assert.match(session, /runtime\.exportModel\(\)/)
  assert.match(worker, /command\.type === 'export-model'/)
  assert.match(worker, /\[bundle\.weightData\]/)
  assert.match(engine, /serializeDenseModel\(retained\)/)
  assert.match(types, /model-exported/)
  assert.match(types, /model-export-error/)
})

test('CNN solo publica una versión después de confirmar el run y la evaluación', () => {
  const page = read('src/features/cnn/CnnPage.tsx')
  assert.match(page, /syncState !== 'confirmed'/)
  assert.match(page, /!evaluationSaved/)
  assert.match(page, /saveModelVersion\(runId, name, bundle\)/)
  assert.match(page, /currentSession\.exportModel\(\)/) // detecta si cambia el contrato
  assert.match(read('src/services/modelRegistry.ts'), /upsert:\s*false/)
  assert.match(read('src/services/modelRegistry.ts'), /\.eq\('id', reserved\.id\)\.single\(\)/)
})

test('CNN recuperada usa manifiesto, imagen local, pesos privados, nunca CSV', () => {
  const model = read('src/ml/cnn/modelPersistence.ts')
  const page = read('src/features/models/ModelRegistryPage.tsx')
  const card = read('src/features/models/CnnRestoredPredictionCard.tsx')
  assert.match(model, /tf\.loadLayersModel/)
  assert.match(model, /parseCnnPreprocessingManifest/)
  assert.match(model, /model\.inputs\[0\]/)
  assert.match(model, /tf\.tensor4d/)
  assert.match(page, /isCnnManifest/)
  assert.match(page, /loadDensePredictor/)
  assert.match(page, /loadCnnPredictor/)
  assert.match(card, /prepareCnnPredictionImage/)
  assert.doesNotMatch(model, /storage\.upload|from\('datasets'\)/)
})

test('CNN-4C no requiere migración ni expone bucket público', () => {
  const model = read('src/services/modelRegistry.ts')
  const sql = read('supabase/tests/FASE_7_CNN4C_VERIFICACION.sql')
  assert.match(model, /MODEL_BUCKET = 'model-artifacts'/)
  assert.match(sql, /SOLO LECTURA/)
  assert.doesNotMatch(sql, /\b(insert|update|delete|alter|grant|drop|create)\s+(into|table|function|policy|on|from)\b/i)
})
