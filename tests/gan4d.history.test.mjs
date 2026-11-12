/** Contratos puros GAN-4D: reconstrucción fiel y sin datos de píxeles. */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseGanStoredEvaluation, assembleGanHistoryEpochs, isGanStoredEvaluation,
  formatGanReportSummary, ganReportColumns,
} from '../src/ml/evaluation/ganStoredEvaluation.ts'

const summary = {
  family: 'gan', kind: 'descriptive_only', sampleCount: 8, dimension: 8,
  meanIntensity: 72, meanPairwiseDistance: 22.3,
  minimumPixel: 0, maximumPixel: 248,
}
const epoch = (n) => [
  { epoch: n, split: 'train', metric_name: 'generator_loss', metric_value: 0.7 },
  { epoch: n, split: 'train', metric_name: 'discriminator_loss', metric_value: 1.3 },
  { epoch: n, split: 'train', metric_name: 'd_real', metric_value: 0.54 },
  { epoch: n, split: 'train', metric_name: 'd_fake', metric_value: 0.49 },
]

test('GAN-4D: evalúa el resumen agregado exacto de la RPC 016', () => {
  assert.equal(isGanStoredEvaluation(summary), true)
  assert.deepEqual(parseGanStoredEvaluation(summary), summary)
  assert.deepEqual(ganReportColumns(summary), [8, 8, 72, 22.3, 0, 248])
  assert.match(formatGanReportSummary(summary), /8 imágenes 8×8/)
})

test('GAN-4D: rechaza píxeles, imágenes, campos extra y formatos de supervisión', () => {
  for (const value of [null, [], { ...summary, pixels: [0] }, { ...summary, images: [] },
    { ...summary, kind: 'test' }, { ...summary, meanIntensity: Infinity },
    { ...summary, sampleCount: 12 }, { ...summary, minimumPixel: 249 },
    { ...summary, meanPairwiseDistance: -1 }, { ...summary, maximumPixel: 256 },
    { ...summary, dimension: 64 }, { family: 'rnn' }]) {
    assert.throws(() => parseGanStoredEvaluation(value))
  }
  assert.deepEqual(ganReportColumns(null), ['', '', '', '', '', ''])
  assert.equal(formatGanReportSummary(undefined), 'Sin resumen descriptivo')
})

test('GAN-4D: reconstruye las cuatro métricas reales por época, sin inventar validación', () => {
  const output = assembleGanHistoryEpochs([...epoch(2), ...epoch(1)])
  assert.equal(output.length, 2)
  assert.deepEqual(output[0], { epoch: 1, generatorLoss: 0.7,
    discriminatorLoss: 1.3, realScore: 0.54, fakeScore: 0.49 })
  assert.equal('validationLoss' in output[0], false)
})

test('GAN-4D: soporta 100 épocas, 400 registros, sin truncamiento lógico', () => {
  const input = Array.from({ length: 100 }, (_, i) => epoch(i + 1)).flat()
  assert.equal(input.length, 400)
  const output = assembleGanHistoryEpochs(input)
  assert.equal(output.length, 100)
  assert.equal(output.at(-1).epoch, 100)
})

test('GAN-4D: rechaza época incompleta, repetida, fuera de orden y métricas inválidas', () => {
  for (const input of [epoch(1).slice(0, 3), [...epoch(1), epoch(1)[0]], epoch(2),
    [...epoch(1), ...epoch(3)], [{ ...epoch(1)[0], split: 'validation' }],
    [...epoch(1).slice(0, 3), { ...epoch(1)[3], metric_value: Infinity }],
    [...epoch(1).slice(0, 3), { ...epoch(1)[3], metric_value: -0.1 }]]) {
    assert.throws(() => assembleGanHistoryEpochs(input))
  }
})
