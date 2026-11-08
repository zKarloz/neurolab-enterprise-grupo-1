import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/ml/preprocessing/readCsv.ts', import.meta.url), 'utf8')

test('CSV de producción evita el Worker interno de PapaParse en Vite 8', () => {
  assert.match(source, /worker:\s*false/)
  assert.doesNotMatch(source, /^\s*worker:\s*true,?/m)
  assert.match(source, /chunkSize:\s*256\s*\*\s*1024/)
})

test('CSV mantiene límites y confirma errores de fila, sin colgar la importación', () => {
  assert.match(source, /MAX_CSV_BYTES\s*=\s*10\s*\*\s*1024\s*\*\s*1024/)
  assert.match(source, /MAX_CSV_ROWS\s*=\s*50_000/)
  assert.match(source, /!Array\.isArray\(results\.data\)/)
  assert.match(source, /parser\.abort\(\)/)
  assert.match(source, /reject\(new Error\(message\)\)/)
})
