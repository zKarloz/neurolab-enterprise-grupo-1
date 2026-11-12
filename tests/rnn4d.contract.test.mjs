import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('RNN-4D: historial filtra por JOIN real antes de paginar y muestra 3 familias', () => {
  const service = read('src/services/evaluationPersistence.ts')
  const page = read('src/features/evaluation/TrainingHistoryPage.tsx')
  assert.match(service, /architectures!inner\(family\)/)
  assert.match(service, /\.in\('architectures\.family', \['feedforward', 'cnn', 'rnn'\]\)/)
  assert.match(service, /query\.eq\('architectures\.family', family\)/)
  assert.match(service, /\.range\(start, start \+ HISTORY_PAGE_SIZE - 1\)/)
  assert.doesNotMatch(service, /\.eq\('problem_type', 'multiclass'\)/)
  assert.match(page, /value: 'rnn', label: 'RNN'/)
  assert.match(page, /familyLabel\(run\.family\)/)
  assert.match(page, /compatibleHistoryRuns/)
  assert.match(page, /RnnStoredEvaluationCard/)
})

test('RNN-4D: evaluación histórica según familia, sin inventar regresión feedforward', () => {
  const service = read('src/services/evaluationPersistence.ts')
  const card = read('src/features/evaluation/RnnStoredEvaluationCard.tsx')
  assert.match(service, /parseRnnStoredEvaluation\(raw\)/)
  assert.match(service, /parseCnnStoredEvaluation\(raw\)/)
  assert.match(service, /evaluation\.problemType !== problemType/)
  assert.match(card, /evaluation\.sampleCount/)
  assert.match(card, /evaluation\.matrix/)
  assert.doesNotMatch(card, /storage\.from|\.upload\(|\.rpc\(/)
})

test('RNN-4D: reportes y comparaciones no duplican pantallas ni alteran RLS', () => {
  const report = read('src/features/reports/ProjectReportPage.tsx')
  const pdf = read('src/features/reports/FormalReportDocument.tsx')
  const compare = read('src/features/evaluation/RunComparison.tsx')
  assert.match(report, /value:'rnn',label:'RNN'/)
  assert.match(report, /run\.family === 'rnn'/)
  assert.match(report, /macroF1/)
  assert.match(pdf, /family === 'rnn'/)
  assert.match(compare, /compatibleHistoryRuns/)
  assert.match(read('src/services/reporting.ts'), /architectures!inner\(family\)/)
  assert.doesNotMatch(read('src/services/evaluationPersistence.ts'), /\.insert\(|\.update\(|\.delete\(/)
})
