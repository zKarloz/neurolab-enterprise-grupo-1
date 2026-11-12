import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { rnnRunPayload, rnnEvaluationSummary } from '../src/ml/rnn/persistencePayload.ts'
import { prepareRnnTrainingData } from '../src/ml/rnn/trainingData.ts'
const csv = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv',import.meta.url),'utf8')
const [head,...lines] = csv.trim().split(/\r?\n/)
const table = { columns:head.split(','), rows:lines.map(line=>line.split(',')) }
const options = { seriesColumn:'series_id',timeColumn:'step',targetColumn:'target',features:['temperatura','consumo'],steps:4,problemType:'regression' }

test('RNN-4A: payload registra solo conteos/nombres/normalización de train y no ventanas crudas', () => {
  const prepared = prepareRnnTrainingData(table,options)
  const payload = rnnRunPayload('project', 'demo.csv', 4096, 'a'.repeat(64),table,options,
    { kind:'lstm',layers:1,units:8,denseUnits:0 }, { epochs:2,batchSize:8,learningRate:0.001 },prepared)
  assert.equal(payload.p_schema_json.seriesCount,2)
  assert.equal(payload.p_schema_json.windowCount,120)
  assert.deepEqual([payload.p_preprocessing_json.split.trainCount,payload.p_preprocessing_json.split.validationCount,payload.p_preprocessing_json.split.testCount],[72,14,18])
  assert.equal(payload.p_preprocessing_json.normalization.means.length,2)
  assert.equal(payload.p_architecture_config.input.problemType,'regression')
  const text=JSON.stringify(payload)
  for (const field of ['examples','pixels','observations','trainX','validationX','testX','samplesRaw','windowValues']) assert.ok(!text.includes(`"${field}"`),field)
})

test('RNN-4A: se eliminan los ejemplos al construir evaluación para Supabase', () => {
  const summary = rnnEvaluationSummary('regression', {kind:'regression',count:18,mse:2,rmse:Math.sqrt(2),mae:1.3,r2:null,
    examples:[{seriesId:'privada',targetTime:10,actual:42,predicted:12}]})
  assert.deepEqual(Object.keys(summary).sort(),['family','problemType','sampleCount','mse','rmse','mae','r2'].sort())
  assert.ok(!JSON.stringify(summary).includes('privada'))
  assert.throws(() => rnnEvaluationSummary('binary',{kind:'regression',count:18,mse:1,rmse:1,mae:1,r2:null,examples:[]}),/inconsistente/)
})
