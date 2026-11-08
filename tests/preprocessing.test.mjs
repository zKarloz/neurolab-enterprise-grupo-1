import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareDataset, transformRow } from '../src/ml/preprocessing/prepare.ts'

function regressionTable(n = 25) {
  return {
    columns: ['edad', 'ciudad', 'objetivo'],
    rows: Array.from({ length: n }, (_, index) => [String(index + 10), index % 2 ? 'Lima' : 'Cusco', String(index * 0.5)]),
  }
}

test('particiones reproducibles para misma semilla, disjuntas y completas', () => {
  const table = regressionTable()
  const first = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 42 })
  const second = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 42 })
  assert.deepEqual(first.train.rowIndices, second.train.rowIndices)
  const all = [...first.train.rowIndices, ...first.validation.rowIndices, ...first.test.rowIndices]
  assert.equal(new Set(all).size, table.rows.length)
  assert.equal(all.length, table.rows.length)
  assert.ok(first.train.x.every((row) => row.length === first.manifest.featureNames.length))
})

test('diferente semilla cambia la partición', () => {
  const table = regressionTable(45)
  const one = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 42 })
  const two = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 99 })
  assert.notDeepEqual(one.train.rowIndices, two.train.rowIndices)
})

test('escalado se ajusta únicamente con train (sin fuga de validación/test)', () => {
  const table = regressionTable(35)
  // Insertar un outlier en un índice que queda fuera del train para esta semilla.
  const baseline = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 42 })
  const outsider = baseline.test.rowIndices[0]
  table.rows[outsider][0] = '1000000'
  const result = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression', seed: 42 })
  const age = result.manifest.transformers.find((t) => t.column === 'edad')
  const expectedMean = result.train.rowIndices.reduce((sum, i) => sum + Number(table.rows[i][0]), 0) / result.train.rowIndices.length
  assert.equal(age.mean, expectedMean)
  assert.ok(age.mean < 1000)
  assert.ok(result.test.x.some((row) => row[0] > 1000))
})

test('categorías desconocidas usan el canal reservado y no cambian vocabulario', () => {
  const table = regressionTable(30)
  const result = prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression' })
  const city = result.manifest.transformers.find((t) => t.column === 'ciudad')
  assert.equal(city.kind, 'categorical')
  assert.deepEqual(city.categories, ['Cusco', 'Lima'])
  const unknown = transformRow(['29', 'Arequipa', '3'], table.columns, result.manifest)
  assert.equal(unknown.slice(1).at(-1), 1)
  assert.deepEqual(city.categories, ['Cusco', 'Lima'])
})

test('binaria estratificada: train/validation/test tienen ambas clases', () => {
  const table = { columns: ['x', 'target'], rows: Array.from({ length: 24 }, (_, i) => [String(i), i % 2 ? 'sí' : 'no']) }
  const prepared = prepareDataset(table, { targetColumn: 'target', problemType: 'binary' })
  for (const split of [prepared.train, prepared.validation, prepared.test]) {
    assert.deepEqual(new Set(split.y), new Set([0, 1]))
  }
  assert.deepEqual(prepared.manifest.targetLabels, ['no', 'sí'])
})

test('objetivo no numérico para regresión se rechaza', () => {
  const table = regressionTable()
  table.rows[4][2] = 'desconocido'
  assert.throws(() => prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression' }), /no numérico/)
})

test('columnas duplicadas o falta de objetivo se rechazan', () => {
  const table = regressionTable()
  table.columns[1] = 'edad'
  assert.throws(() => prepareDataset(table, { targetColumn: 'objetivo', problemType: 'regression' }), /únicos/)
  assert.throws(() => prepareDataset(regressionTable(), { targetColumn: 'falta', problemType: 'regression' }), /objetivo/)
})

test('la clasificación binaria rechaza tres clases y estratos insuficientes', () => {
  const table = { columns: ['x', 'target'], rows: Array.from({ length: 12 }, (_, i) => [String(i), ['A', 'B', 'C'][i % 3]]) }
  assert.throws(() => prepareDataset(table, { targetColumn: 'target', problemType: 'binary' }), /dos clases/)
  const rare = { columns: ['x', 'target'], rows: Array.from({ length: 15 }, (_, i) => [String(i), i < 2 ? 'A' : 'B']) }
  assert.throws(() => prepareDataset(rare, { targetColumn: 'target', problemType: 'binary' }), /3 filas/)
})

test('impone límite provisional al número de categorías', () => {
  const table = { columns: ['text', 'target'], rows: Array.from({ length: 90 }, (_, i) => [`CAT_${i}`, String(i)]) }
  assert.throws(() => prepareDataset(table, { targetColumn: 'target', problemType: 'regression' }), /categorías/)
})
