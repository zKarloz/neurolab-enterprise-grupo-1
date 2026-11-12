import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rnnRunPayload, rnnEvaluationSummary } from '../src/ml/rnn/persistencePayload.ts'
import { prepareRnnTrainingData } from '../src/ml/rnn/trainingData.ts'
import { familyForReportRun, reportRunsByFamily } from '../src/ml/evaluation/families.ts'
const read = (filename) => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')

test('RNN-4B: familia RNN se obtiene de FK, no de problem_type', () => {
  const runs = [
    { family: 'feedforward', problem_type: 'regression' },
    { family: 'rnn', problem_type: 'regression' },
    { family: 'cnn', problem_type: 'multiclass' },
    { family: 'rnn', problem_type: 'multiclass' },
  ]
  assert.equal(familyForReportRun(runs[1]), 'rnn')
  assert.deepEqual(reportRunsByFamily(runs, 'feedforward'), [runs[0]])
  assert.deepEqual(reportRunsByFamily(runs, 'rnn'), [runs[1], runs[3]])
  assert.deepEqual(reportRunsByFamily(runs, 'all'), runs)
  assert.match(read('src/services/reporting.ts'), /architectures!inner\(family\)/)
  assert.match(read('src/services/evaluationPersistence.ts'), /\.in\('architectures\.family', \['feedforward', 'cnn', 'rnn'\]\)/)
  assert.match(read('src/services/trainingPersistence.ts'), /\.eq\('architectures\.family', 'feedforward'\)/)
})

test('RNN-4B: UI crea run antes del Worker; ejecución y evaluación se confirman en orden', () => {
  const page = read('src/features/rnn/RnnPage.tsx')
  const service = read('src/services/rnnPersistence.ts')
  assert.ok(page.indexOf('await createRnnRun(') < page.indexOf('trainingSession.current = startRnnTraining('))
  for (const name of ['createRnnRun', 'recordRnnRuntime', 'recordRnnEpoch', 'recordRnnEvaluation', 'finishRnnRun']) {
    assert.match(page, new RegExp(name))
  }
  assert.match(page, /sha256LocalFile\(file/)
  assert.match(page, /queue\.evaluation\(problemType, event\.result\)/)
  assert.match(page, /syncState === 'confirmed'/)
  for (const rpc of ['create_rnn_training_run','record_rnn_training_epoch','record_rnn_test_evaluation','finish_training_run']) {
    assert.ok(service.includes(`'${rpc}'`))
  }
  assert.doesNotMatch(service, /\.insert\(|\.update\(|\.upload\(/)
})

test('RNN-4B: test agregado no contiene serie, observaciones individuales ni ejemplos', () => {
  const data = read('tests/fixtures/rnn2_temporal_demo.csv').trim().split(/\r?\n/).map((line) => line.split(','))
  const table = { columns: data[0], rows: data.slice(1) }
  const options = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target',
    features: ['temperatura','consumo'], steps: 4, problemType: 'regression' }
  const prepared = prepareRnnTrainingData(table, options)
  const payload = rnnRunPayload('project', 'temporal.csv', 9000, 'a'.repeat(64), table, options,
    {kind:'simpleRNN',layers:1,units:8,denseUnits:0}, { epochs:2,batchSize:8,learningRate:0.001 }, prepared)
  assert.equal(payload.p_preprocessing_json.split.testCount,18)
  const summary = rnnEvaluationSummary('regression', {kind:'regression',count:18,
    mse:1,rmse:1,mae:0.5,r2:null,examples:[{seriesId:'PRIVADA',targetTime:7,actual:1,predicted:3}]})
  assert.doesNotMatch(JSON.stringify({payload,summary}), /PRIVADA|"examples"|"targets"|"rows"|"pixels"/)
})

test('RNN-4B: pantalla conserva tabla paginada, y reportes muestran familia real', () => {
  assert.match(read('src/features/rnn/RnnEvaluationPanel.tsx'), /<Pagination page=/)
  assert.match(read('src/features/reports/ProjectReportPage.tsx'), /familyForReportRun/)
  assert.match(read('src/features/reports/FormalReportDocument.tsx'), /familyForReportRun/)
  assert.match(read('src/features/rnn/RnnTrainingPanel.tsx'), /locked/)
  assert.match(read('supabase/tests/FASE_7_RNN4B_VERIFICACION.sql'), /where a\.family = 'rnn'/)
})
