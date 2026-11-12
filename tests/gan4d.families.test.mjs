/** GAN-4D: no mezclar familias, tareas ni resoluciones. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  familyForReportRun, reportRunsByFamily, compatibleHistoryRuns,
  familyLabel, problemLabel,
} from '../src/ml/evaluation/families.ts'
import { compareTestMetrics } from '../src/ml/evaluation/comparison.ts'

const gan = (ganDimension) => ({ family: 'gan', problem_type: 'generative', ganDimension })

test('GAN-4D: familia real y etiqueta generativa, sin suponer regresión', () => {
  assert.equal(familyLabel('gan'), 'GAN')
  assert.equal(problemLabel('generative'), 'Generación no condicional')
  assert.equal(familyForReportRun({ family: 'gan', problem_type: 'generative' }), 'gan')
  assert.equal(familyForReportRun({ problem_type: 'generative' }), 'gan')
  const runs = [gan(8), { family: 'rnn', problem_type: 'regression' }, { family: 'cnn', problem_type: 'multiclass' }]
  assert.deepEqual(reportRunsByFamily(runs, 'gan'), [gan(8)])
  assert.equal(reportRunsByFamily(runs, 'all').length, 3)
})

test('GAN-4D: comparaciones GAN requieren tarea generativa y misma dimensión', () => {
  assert.equal(compatibleHistoryRuns(gan(8), gan(8)), true)
  assert.equal(compatibleHistoryRuns(gan(28), gan(28)), true)
  assert.equal(compatibleHistoryRuns(gan(8), gan(28)), false)
  assert.equal(compatibleHistoryRuns(gan(8), gan(null)), false)
  assert.equal(compatibleHistoryRuns(gan(8), { family: 'rnn', problem_type: 'generative' }), false)
  assert.equal(compatibleHistoryRuns({ family: 'feedforward', problem_type: 'regression' },
    { family: 'feedforward', problem_type: 'regression' }), true)
})

test('GAN-4D: resumen GAN nunca se interpreta como un resultado test supervisado', () => {
  const summary = { family: 'gan', kind: 'descriptive_only', sampleCount: 8, dimension: 8,
    meanIntensity: 72, meanPairwiseDistance: 22.3, minimumPixel: 0, maximumPixel: 248 }
  assert.deepEqual(compareTestMetrics(summary, summary), [])
})
