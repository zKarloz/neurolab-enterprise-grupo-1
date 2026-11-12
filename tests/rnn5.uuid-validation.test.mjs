/**
 * RNN-5: regresión del validador de UUID del script de cinco identidades.
 * Se comprueba el patrón real del script sin leer credenciales ni conectar a Supabase.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync(new URL('../scripts/test-rnn5-live.mjs', import.meta.url), 'utf8')
const uuidLine = script.split('\n').find((line) => line.includes('[0-9a-f]{8}') && line.includes('.test(value)'))
assert.ok(uuidLine, 'Debe encontrarse el validador UUID utilizado por RNN-5')
const literal = uuidLine.match(/(\/\^.*\$\/i)\.test\(value\)/)?.[1]
assert.ok(literal, 'El script debe usar un patrón UUID completo')
const uuidPattern = new RegExp(literal.slice(1, -2), 'i')

test('RNN-5: reconoce UUID válido con cinco grupos (8-4-4-4-12)', () => {
  assert.equal(uuidPattern.test('123e4567-e89b-42d3-a456-426614174000'), true)
  assert.equal(uuidPattern.test('ABCDEF01-1234-5678-9ABC-0123456789AB'), true)
})

test('RNN-5: rechaza el formato incorrecto de cuatro grupos', () => {
  assert.equal(uuidPattern.test('123e4567-e89b-42d3-426614174000'), false)
  assert.equal(uuidPattern.test('123e4567-e89b-42d3-a456-42661417400'), false)
  assert.equal(uuidPattern.test('123e4567-e89b-42d3-a456-4266141740000'), false)
  assert.equal(uuidPattern.test('no-es-un-uuid'), false)
})
