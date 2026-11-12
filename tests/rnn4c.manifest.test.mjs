import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareRnnTrainingData } from '../src/ml/rnn/trainingData.ts'
import { rnnRunPayload } from '../src/ml/rnn/persistencePayload.ts'
import {
  parseRnnPreprocessingManifest, isRnnManifest, parseRnnManualWindow,
  normalizeRnnRestoredWindow, decodeRnnRestoredOutput,
} from '../src/ml/rnn/modelManifest.ts'

const lines = readFileSync(new URL('./fixtures/rnn2_temporal_demo.csv', import.meta.url), 'utf8').trim().split(/\r?\n/)
const table = { columns: lines[0].split(','), rows: lines.slice(1).map((line) => line.split(',')) }
const dataset = { seriesColumn: 'series_id', timeColumn: 'step', targetColumn: 'target',
  features: ['temperatura', 'consumo'], steps: 4, problemType: 'regression' }
const prepared = prepareRnnTrainingData(table, dataset)
const payload = rnnRunPayload('project-id', 'demo.csv', 10000, 'a'.repeat(64), table, dataset,
  { kind: 'simpleRNN', layers: 1, units: 8, denseUnits: 0 }, { epochs: 2, batchSize: 8, learningRate: 0.001 }, prepared)
const stored = payload.p_preprocessing_json

test('RNN-4C: el manifiesto persistido por RNN-4B basta para restaurar preprocesamiento sin CSV', () => {
  const manifest = parseRnnPreprocessingManifest(stored)
  assert.ok(isRnnManifest(manifest))
  assert.equal(manifest.steps, 4)
  assert.deepEqual(manifest.features, dataset.features)
  assert.equal(manifest.split.testCount, 18)
  assert.equal(manifest.problemType, 'regression')
  assert.equal(JSON.stringify(manifest).includes('sensor_A'), false)
  assert.equal(JSON.stringify(manifest).includes('examples'), false)
})

test('RNN-4C: ventana 4 × 2 mantiene el orden temporal, sin leer target', () => {
  const manifest = parseRnnPreprocessingManifest(stored)
  const matrix = [[10, 100], [11, 102], [12, 104], [13, 106]]
  const parsed = parseRnnManualWindow('10,100\n11,102\n12,104\n13,106', manifest)
  assert.deepEqual(parsed, matrix)
  const normal = normalizeRnnRestoredWindow(parsed, manifest)
  assert.equal(normal.length, 8)
  assert.ok(normal.every(Number.isFinite))
  assert.ok(Math.abs(normal[0] - (10 - manifest.normalization.means[0]) / manifest.normalization.scales[0]) < 1e-5)
  assert.ok(Math.abs(normal[1] - (100 - manifest.normalization.means[1]) / manifest.normalization.scales[1]) < 1e-5)
})

test('RNN-4C: rechaza ventanas incompletas, celdas extra, target accidental y valores no finitos', () => {
  const m = parseRnnPreprocessingManifest(stored)
  for (const text of ['1,2\n3,4', '1,2,3\n4,5,6\n7,8,9\n10,11,12',
    '1,2\n3,4\n5,6\nNaN,8', '1,2\n3,4\n5,6\nInfinity,7']) {
    assert.throws(() => parseRnnManualWindow(text, m))
  }
  assert.throws(() => normalizeRnnRestoredWindow([[1,2],[3,4],[5,6],[7, Infinity]], m))
})

test('RNN-4C: el manifiesto rechaza familias falsas, escalas inválidas, columnas repetidas y splits corruptos', () => {
  const bad = [
    { ...stored, family: 'feedforward' },
    { ...stored, steps: 99 },
    { ...stored, features: ['temperatura', 'temperatura'] },
    { ...stored, normalization: { ...stored.normalization, scales: [1, 0] } },
    { ...stored, normalization: { ...stored.normalization, means: [1, NaN] } },
    { ...stored, split: { ...stored.split, testCount: -1 } },
    { ...stored, classNames: ['clase'] },
  ]
  for (const input of bad) assert.throws(() => parseRnnPreprocessingManifest(input))
})

test('RNN-4C: predicción regresión vuelve a escala original y rechaza salidas corruptas', () => {
  const manifest = parseRnnPreprocessingManifest(stored)
  const result = decodeRnnRestoredOutput([0], manifest)
  assert.equal(result.value, manifest.normalization.targetMean)
  assert.throws(() => decodeRnnRestoredOutput([NaN], manifest))
  assert.throws(() => decodeRnnRestoredOutput([0, 1], manifest))
})

test('RNN-4C: decodifica binary/multiclass con sus clases reales', () => {
  const common = { ...stored, normalization: { ...stored.normalization, targetMean: 0, targetScale: 1 } }
  const binary = parseRnnPreprocessingManifest({ ...common, problemType: 'binary', classNames: ['no', 'sí'] })
  const multiclass = parseRnnPreprocessingManifest({ ...common, problemType: 'multiclass', classNames: ['A', 'B', 'C'] })
  assert.equal(decodeRnnRestoredOutput([0.8], binary).value, 'sí')
  assert.equal(decodeRnnRestoredOutput([0.1, 0.2, 0.7], multiclass).value, 'C')
  assert.throws(() => decodeRnnRestoredOutput([1.3], binary))
  assert.throws(() => decodeRnnRestoredOutput([0.2, 0.2, 0.2], multiclass))
})
