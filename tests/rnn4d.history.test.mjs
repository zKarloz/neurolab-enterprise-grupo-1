import test from 'node:test'
import assert from 'node:assert/strict'
import { compatibleHistoryRuns, reportRunsByFamily } from '../src/ml/evaluation/families.ts'
import { parseRnnStoredEvaluation } from '../src/ml/evaluation/rnnStoredEvaluation.ts'
import { compareTestMetrics } from '../src/ml/evaluation/comparison.ts'
import { assembleHistoryMetrics } from '../src/ml/evaluation/history.ts'

const regression = { family: 'rnn', problemType: 'regression', sampleCount: 18,
  mse: 4, rmse: 2, mae: 1.6, r2: null }
const classification = { family: 'rnn', problemType: 'binary', sampleCount: 4,
  classNames: ['no', 'sí'], accuracy: .75, macroPrecision: .833333,
  macroRecall: .75, macroF1: .73333, matrix: [[2, 0], [1, 1]] }

test('RNN-4D: distingue RNN y Feedforward en regresión por familia real', () => {
  const runs = [
    { family: 'feedforward', problem_type: 'regression' },
    { family: 'rnn', problem_type: 'regression' },
    { family: 'cnn', problem_type: 'multiclass' },
    { family: 'rnn', problem_type: 'multiclass' },
  ]
  assert.deepEqual(reportRunsByFamily(runs, 'rnn'), [runs[1], runs[3]])
  assert.deepEqual(reportRunsByFamily(runs, 'all'), runs)
  assert.equal(compatibleHistoryRuns(runs[0], runs[1]), false)
  assert.equal(compatibleHistoryRuns(runs[1], { ...runs[1] }), true)
  assert.equal(compatibleHistoryRuns(runs[2], runs[3]), false)
  assert.equal(compatibleHistoryRuns(runs[1], runs[3]), false)
})

test('RNN-4D: regresión agregada conserva conteo y R² indefinido', () => {
  const parsed = parseRnnStoredEvaluation(regression)
  assert.deepEqual(parsed, regression)
  assert.deepEqual(compareTestMetrics(parsed, { ...parsed, mae: 1.2 }).map((row) => row.metric),
    ['MSE test', 'RMSE test', 'MAE test', 'R² test'])
  assert.equal(compareTestMetrics(parsed, parsed)[3].first, null)
  assert.throws(() => parseRnnStoredEvaluation({ ...regression, sampleCount: 0 }), /Cantidad/)
  assert.throws(() => parseRnnStoredEvaluation({ ...regression, mse: NaN }), /mse/)
  assert.throws(() => parseRnnStoredEvaluation({ ...regression, rmse: 3 }), /RMSE/)
  assert.throws(() => parseRnnStoredEvaluation({ ...regression, examples: [{ seriesId: 'privada' }] }), /individuales/)
})

test('RNN-4D: matriz binaria estricta y comparación por etiquetas idénticas', () => {
  const parsed = parseRnnStoredEvaluation(classification)
  assert.equal(parsed.sampleCount, 4)
  assert.equal(parsed.matrix[1][0], 1)
  assert.deepEqual(compareTestMetrics(parsed, parsed).map((row) => row.metric),
    ['Accuracy test', 'Precisión macro', 'Recall macro', 'F1 macro'])
  assert.deepEqual(compareTestMetrics(parsed, { ...parsed, classNames: ['sí', 'no'] }), [])
  assert.throws(() => parseRnnStoredEvaluation({ ...classification, matrix: [[2, 0], [1, 2]] }), /matriz/)
  assert.throws(() => parseRnnStoredEvaluation({ ...classification, accuracy: 1 }), /Accuracy/)
  assert.throws(() => parseRnnStoredEvaluation({ ...classification, classNames: ['no', 'no'] }), /Clases/)
})

test('RNN-4D: multiclase con conteo real, sin fingir loss en test', () => {
  const matrix = [[2, 0, 0], [0, 1, 0], [1, 0, 2]]
  const summary = { family: 'rnn', problemType: 'multiclass', sampleCount: 6,
    classNames: ['A', 'B', 'C'], accuracy: 5 / 6,
    macroPrecision: .8, macroRecall: .9, macroF1: .83, matrix }
  const parsed = parseRnnStoredEvaluation(summary)
  assert.equal(parsed.problemType, 'multiclass')
  assert.equal(compareTestMetrics(parsed, parsed).length, 4)
  assert.deepEqual(compareTestMetrics(parsed, { problemType: 'multiclass', sampleCount: 6,
    classNames: ['A', 'B', 'C'], loss: 0.1, accuracy: 5 / 6,
    macroPrecision: .8, macroRecall: .9, macroF1: .83, matrix }), [])
})

test('RNN-4D: épocas guardadas usan MAE/accuracy según tarea sin rellenar vacíos', () => {
  const rows = [
    { epoch: 1, split: 'train', metric_name: 'loss', metric_value: .7 },
    { epoch: 1, split: 'validation', metric_name: 'loss', metric_value: 1.7 },
    { epoch: 1, split: 'train', metric_name: 'mae', metric_value: .5 },
    { epoch: 1, split: 'validation', metric_name: 'mae', metric_value: 1.2 },
    { epoch: 2, split: 'train', metric_name: 'loss', metric_value: .6 },
    { epoch: 2, split: 'validation', metric_name: 'loss', metric_value: 1.5 },
  ]
  const epochs = assembleHistoryMetrics(rows, 'regression')
  assert.deepEqual(epochs.map((item) => item.epoch), [1, 2])
  assert.equal(epochs[0].metric, .5)
  assert.equal(epochs[0].validationMetric, 1.2)
  assert.equal(epochs[1].metric, null)
})
