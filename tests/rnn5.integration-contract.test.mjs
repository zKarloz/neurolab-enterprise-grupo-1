/** RNN-5: no cruzar familias ni exponer observaciones temporales persistidas. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { compatibleHistoryRuns, familyForReportRun, reportRunsByFamily } from '../src/ml/evaluation/families.ts'
import { parseRnnStoredEvaluation } from '../src/ml/evaluation/rnnStoredEvaluation.ts'
import { rnnEvaluationSummary } from '../src/ml/rnn/persistencePayload.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('RNN-5: no interpreta regresión RNN como Feedforward al filtrar, comparar y reportar', () => {
  const rnn = { family: 'rnn', problem_type: 'regression' }
  const ff = { family: 'feedforward', problem_type: 'regression' }
  const cnn = { family: 'cnn', problem_type: 'multiclass' }
  assert.equal(compatibleHistoryRuns(rnn, ff), false)
  assert.equal(compatibleHistoryRuns(rnn, { family: 'rnn', problem_type: 'binary' }), false)
  assert.equal(compatibleHistoryRuns(rnn, rnn), true)
  assert.equal(compatibleHistoryRuns(cnn, cnn), true)
  assert.equal(familyForReportRun(rnn), 'rnn')
  assert.deepEqual(reportRunsByFamily([rnn, ff, cnn], 'rnn'), [rnn])
})

test('RNN-5: evaluación agregada serializada sin ventanas ni series', () => {
  const local = { kind: 'regression', count: 18, mse: 4, rmse: 2, mae: 1.5, r2: 0.1,
    examples: [{ seriesId: 'sensor_Secreto', targetTime: 3, actual: 10, predicted: 11 }] }
  const summary = rnnEvaluationSummary('regression', local)
  assert.equal(summary.sampleCount, 18)
  assert.equal(parseRnnStoredEvaluation(summary).rmse, 2)
  assert.doesNotMatch(JSON.stringify(summary), /sensor_Secreto|examples|seriesId|actual|predicted/)
  assert.throws(() => parseRnnStoredEvaluation({ ...summary, examples: local.examples }))
})

test('RNN-5: evaluación agregada binaria/multiclase sin muestras individuales', () => {
  const classification = { kind: 'classification', count: 4, classes: ['A', 'B'],
    accuracy: 0.75, macroPrecision: 0.75, macroRecall: 0.75, macroF1: 0.75,
    confusion: [[2, 0], [1, 1]], examples: [{ actual: 'A', predicted: 'A' }] }
  const summary = rnnEvaluationSummary('binary', classification)
  assert.equal(parseRnnStoredEvaluation(summary).sampleCount, 4)
  assert.equal(JSON.stringify(summary).includes('examples'), false)
  assert.throws(() => parseRnnStoredEvaluation({ ...summary, matrix: [[2, 0], [1, 0]] }))
})

test('RNN-5: tablas privadas e historial separan sesión local de datos almacenados', () => {
  const local = read('src/features/rnn/RnnEvaluationPanel.tsx')
  const persistence = read('src/ml/rnn/persistencePayload.ts')
  const history = read('src/services/evaluationPersistence.ts')
  const registry = read('src/features/models/ModelRegistryPage.tsx')
  assert.match(local, /Pagination/)
  assert.match(persistence, /rnnEvaluationSummary/)
  assert.match(history, /architectures!inner\(family\)/)
  assert.match(history, /parseRnnStoredEvaluation/)
  assert.match(registry, /RnnRestoredPredictionCard/)
  assert.doesNotMatch(persistence, /p_examples|p_windows|p_predictions|p_rows/)
})

test('RNN-5: Worker local exporta sin envíos de ventanas a servicios externos', () => {
  const worker = read('src/workers/rnn.worker.ts')
  const service = read('src/services/rnnPersistence.ts')
  const manifest = read('src/ml/rnn/modelManifest.ts')
  assert.match(worker, /export-model/)
  assert.match(service, /record_rnn_test_evaluation/)
  assert.match(manifest, /parseRnnPreprocessingManifest/)
  assert.doesNotMatch(worker, /\.storage\.from\(|\.rpc\(/)
})
