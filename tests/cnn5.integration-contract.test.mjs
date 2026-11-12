/** CNN-5: regresión de contratos sin conexiones, cuentas o Storage real. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { familyForProblem, compatibleForComparison, reportRunsByFamily } from '../src/ml/evaluation/families.ts'
import { parseCnnStoredEvaluation } from '../src/ml/evaluation/cnnStoredEvaluation.ts'
import { cnnEvaluationSummary } from '../src/ml/cnn/persistencePayload.ts'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('No se confunden familias ni clases al comparar y exportar', () => {
  assert.equal(familyForProblem('binary'), 'feedforward')
  assert.equal(familyForProblem('regression'), 'feedforward')
  assert.equal(familyForProblem('multiclass'), 'cnn')
  assert.equal(compatibleForComparison('multiclass', 'binary'), false)
  assert.equal(compatibleForComparison('multiclass', 'regression'), false)
  assert.equal(compatibleForComparison('multiclass', 'multiclass'), true)
  assert.equal(compatibleForComparison('binary', 'regression'), false)
  const items = [
    { id: 'uno', problem_type: 'binary' },
    { id: 'dos', problem_type: 'multiclass' },
    { id: 'tres', problem_type: 'regression' },
  ]
  assert.deepEqual(reportRunsByFamily(items, 'cnn').map((x) => x.id), ['dos'])
  assert.deepEqual(reportRunsByFamily(items, 'feedforward').map((x) => x.id), ['uno', 'tres'])
  assert.equal(reportRunsByFamily(items, 'all').length, 3)
  assert.equal(items.length, 3)
})

test('Resultados CNN almacenados se validan y no contienen ejemplos individuales', () => {
  const evaluation = {
    classNames: ['cero', 'uno'], sampleCount: 4, loss: 0.4,
    accuracy: 0.75, macroPrecision: 0.833333, macroRecall: 0.75,
    macroF1: 0.733333, matrix: [[2, 0], [1, 1]],
    examples: [{ pixels: [1, 2], probabilities: [0.2, 0.8] }],
  }
  const summary = cnnEvaluationSummary(evaluation)
  assert.equal(summary.problemType, 'multiclass')
  assert.equal(JSON.stringify(summary).includes('pixels'), false)
  assert.equal(JSON.stringify(summary).includes('examples'), false)
  assert.equal(JSON.stringify(summary).includes('probabilities'), false)
  assert.equal(parseCnnStoredEvaluation(summary).sampleCount, 4)
  assert.throws(() => parseCnnStoredEvaluation({ ...summary, matrix: [[4, 0], [1, 1]] }), /matriz|tamaño|confusión/i)
})

test('La publicación usa Storage privado, hash, versión y confirmación remota', () => {
  const registry = read('src/services/modelRegistry.ts')
  const cnnPage = read('src/features/cnn/CnnPage.tsx')
  const model = read('src/ml/cnn/modelPersistence.ts')
  assert.match(registry, /MODEL_BUCKET = 'model-artifacts'/)
  assert.match(registry, /upsert: false/)
  assert.match(registry, /publish_model_version/)
  assert.match(registry, /manifestHash !== version\.manifest_sha256/)
  assert.match(registry, /weightsHash !== version\.weights_sha256/)
  assert.match(cnnPage, /syncState !== 'confirmed'/)
  assert.match(cnnPage, /!evaluationSaved/)
  assert.match(model, /parseCnnPreprocessingManifest/)
  assert.match(model, /model\.inputs\[0\]/)
  assert.match(model, /model\.outputs\[0\]/)
  assert.match(model, /model\.dispose\(\)/)
})

test('Historial y reportes preservan Feedforward, paginación y datos reales', () => {
  const history = read('src/services/evaluationPersistence.ts')
  const trained = read('src/services/trainingPersistence.ts')
  const models = read('src/features/models/ModelRegistryPage.tsx')
  const report = read('src/features/reports/ProjectReportPage.tsx')
  assert.match(history, /\.range\(start, start \+ HISTORY_PAGE_SIZE - 1\)/)
  assert.match(history, /query\.eq\('architectures\.family', family\)/)
  assert.match(history, /\['feedforward', 'cnn', 'rnn'\]/)
  assert.match(trained, /create_training_run/)
  assert.match(models, /loadDensePredictor/)
  assert.match(models, /loadCnnPredictor/)
  assert.match(report, /reportRunsByFamily/)
  assert.match(report, /macroF1/)
  assert.doesNotMatch(report, /storage\.from\(/)
})

test('La migración 013 mantiene autorización por rol de proyecto y evita escrituras directas', () => {
  const sql = read('supabase/migrations/202611100013_fix_cnn_json_precedence.sql')
  const baseSql = read('supabase/migrations/202611100012_cnn_multiclass.sql')
  assert.match(sql, /private\.can_train_in_project\(p_project_id\)/)
  assert.match(sql, /security definer set search_path = ''/)
  assert.match(sql, /v_actor uuid := \(select auth\.uid\(\)\)/)
  assert.match(sql, /grant execute on function public\.create_cnn_training_run/)
  assert.match(baseSql, /record_cnn_training_epoch/)
  assert.match(baseSql, /record_cnn_test_evaluation/)
  assert.match(baseSql, /private\.can_train_in_project\(v_run\.project_id\)/)
  assert.match(baseSql, /v_run\.created_by is distinct from \(select auth\.uid\(\)\)/)
  assert.doesNotMatch(sql, /\bdisable row level security\b/i)
})
