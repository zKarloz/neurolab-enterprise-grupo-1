import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const core = readFileSync('src/ml/training/trainCore.ts', 'utf8')
const session = readFileSync('src/ml/training/browserSession.ts', 'utf8')
const worker = readFileSync('src/workers/training.worker.ts', 'utf8')
const panel = readFileSync('src/features/training/DenseTrainingPanel.tsx', 'utf8')
const history = readFileSync('src/features/evaluation/TrainingHistoryPage.tsx', 'utf8')

test('modelo retenido solo en memoria y liberado mediante dispose', () => {
  assert.match(core, /if \(onReady\)/)
  assert.match(core, /trainedModel\.dispose\(\)/)
  assert.match(core, /if \(!retainedForPrediction\)/)
  assert.match(session, /mainPredictor\?\.dispose\(\)/)
  assert.match(session, /worker\?\.terminate\(\)/)
})

test('Worker devuelve predicción calculada, no un valor fijo', () => {
  assert.match(worker, /predictor\.predict\(features\)/)
  assert.match(worker, /type: 'prediction'/)
  assert.match(core, /await output\.data\(\)/)
  assert.doesNotMatch(worker, /Math\.random\(/)
})

test('comparación usa métricas históricas y el panel reutiliza manifiesto local', () => {
  assert.match(history, /loadHistoryDetail\(run\.id, run\.problem_type\)/)
  assert.match(history, /run\.status !== 'completed'/)
  assert.match(panel, /manifest=\{dataset\.manifest\}/)
})

// Regresión: el sondeo del backend usa un modelo temporal y no debe depender
// del indicador de retención definido únicamente en trainDenseModel().
test('el sondeo del backend libera sus recursos sin usar el estado de inferencia', () => {
  const probe = core.split('async function probeTrainBackend(')[1]?.split('/** La compatibilidad GPU')[0]
  assert.ok(probe, 'No se encontró el sondeo del backend.')
  assert.doesNotMatch(probe, /retainedForPrediction/)
  assert.match(probe, /model\?\.dispose\(\)/)
  assert.match(probe, /optimizer\?\.dispose\(\)/)
})
