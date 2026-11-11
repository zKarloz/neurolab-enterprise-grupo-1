import test from 'node:test'
import assert from 'node:assert/strict'
import { familyForProblem, compatibleForComparison, reportRunsByFamily, familyForReportProblem } from '../src/ml/evaluation/families.ts'
import { assembleHistoryMetrics } from '../src/ml/evaluation/history.ts'
import { parseCnnStoredEvaluation, cnnStoredClassMetrics } from '../src/ml/evaluation/cnnStoredEvaluation.ts'
import { compareTestMetrics } from '../src/ml/evaluation/comparison.ts'

test('CNN multiclase y Feedforward no se mezclan; filtros no alteran fuente', () => {
  assert.equal(familyForProblem('multiclass'), 'cnn')
  assert.equal(familyForReportProblem('regression'), 'feedforward')
  assert.equal(familyForReportProblem('rnn_future'), null)
  const items = [{problem_type:'binary'}, {problem_type:'multiclass'}, {problem_type:'regression'}]
  assert.equal(reportRunsByFamily(items,'all').length,3)
  assert.deepEqual(reportRunsByFamily(items,'cnn'),[items[1]])
  assert.deepEqual(reportRunsByFamily(items,'feedforward'),[items[0],items[2]])
  assert.equal(compatibleForComparison('multiclass','binary'),false)
  assert.equal(compatibleForComparison('binary','regression'),false)
  assert.equal(compatibleForComparison('multiclass','multiclass'),true)
})

test('historiza cuatro métricas por época CNN sin interpolación ni ceros artificiales', () => {
  const metrics = [
    {epoch:1,split:'train',metric_name:'loss',metric_value:2.2},
    {epoch:1,split:'validation',metric_name:'loss',metric_value:2.3},
    {epoch:1,split:'train',metric_name:'accuracy',metric_value:0.32},
    {epoch:1,split:'validation',metric_name:'accuracy',metric_value:0.29},
    {epoch:3,split:'train',metric_name:'loss',metric_value:1.8},
    {epoch:3,split:'validation',metric_name:'loss',metric_value:1.9},
  ]
  const epochs=assembleHistoryMetrics(metrics,'multiclass')
  assert.deepEqual(epochs.map(e=>e.epoch),[1,3])
  assert.equal(epochs[0].metric,0.32)
  assert.equal(epochs[0].validationMetric,0.29)
  assert.equal(epochs[1].metric,null)
  assert.equal(epochs[1].validationMetric,null)
})

test('lee matriz agregada y reconstruye métricas por clase sin datos individuales', () => {
  const saved = {problemType:'multiclass',classNames:['0','1'],sampleCount:4,
    loss:0.5,accuracy:0.75,macroPrecision:0.8333333333,macroRecall:0.75,macroF1:0.7333333333,
    matrix:[[2,0],[1,1]]}
  const data = parseCnnStoredEvaluation(saved)
  assert.equal(cnnStoredClassMetrics(data)[0].precision,2/3)
  assert.equal(cnnStoredClassMetrics(data)[1].recall,0.5)
  assert.deepEqual(compareTestMetrics(data,data).map(m=>m.metric),[
    'Loss test (categorical crossentropy)','Accuracy test','Precisión macro','Recall macro','F1 macro'])
  assert.deepEqual(compareTestMetrics(data,{...data,classNames:['1','0']}),[])
  assert.throws(()=>parseCnnStoredEvaluation({...saved,matrix:[[2,0],[1,10]]}),/matriz/)
  assert.throws(()=>parseCnnStoredEvaluation({...saved,examples:[{}],accuracy:NaN}),/Métrica/)
})
