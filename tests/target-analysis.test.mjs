import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeObjective } from '../src/ml/preprocessing/targetAnalysis.ts'

test('objetivo 0/1 numérico recomienda clasificación pero no impide la regresión', () => {
  const table = { columns: ['radio', 'diagnostico'], rows: [['1.3', '0'], ['2.1', '1'], ['4', '1'], ['5', '0']] }
  const result = analyzeObjective(table, 'diagnostico')
  assert.equal(result.distinctValues, 2)
  assert.equal(result.recommended, 'binary')
  assert.equal(result.allNumeric, true)
})

test('progresión continua recomienda regresión', () => {
  const table = { columns: ['imc', 'progresion'], rows: [['1', '25'], ['2', '90'], ['3', '140'], ['4', '346']] }
  assert.equal(analyzeObjective(table, 'progresion').recommended, 'regression')
})

test('dos categorías de texto se preparan como clasificación', () => {
  const table = { columns: ['x', 'clase'], rows: [['1', 'sí'], ['2', 'no'], ['3', 'sí']] }
  assert.equal(analyzeObjective(table, 'clase').recommended, 'binary')
})

test('múltiples categorías no reciben una recomendación engañosa', () => {
  const table = { columns: ['x', 'clase'], rows: [['1', 'A'], ['2', 'B'], ['3', 'C']] }
  assert.equal(analyzeObjective(table, 'clase').recommended, null)
})
