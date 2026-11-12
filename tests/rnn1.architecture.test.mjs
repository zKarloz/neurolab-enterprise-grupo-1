import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_RNN_CONFIG, describeRnn, recurrentParameters } from '../src/ml/rnn/architecture.ts'

const regression = { steps: 8, features: 2, classes: 1, problemType: 'regression' }

test('RNN-1: LSTM calcula cuatro puertas y salida correcta', () => {
  const diagram = describeRnn(DEFAULT_RNN_CONFIG, regression)
  // LSTM(2 -> 16): 4 * (2 + 16 + 1) * 16 = 1216;
  // Dense(16 -> 16): 272; salida(16 -> 1): 17.
  assert.equal(diagram.parameterCount, 1505)
  assert.equal(diagram.layers[1].shape, '16')
  assert.equal(diagram.layers.at(-1).shape, '1')
  assert.deepEqual(diagram.errors, [])
})

test('RNN-1: capa apilada devuelve secuencia y forma [pasos, unidades]', () => {
  const config = { ...DEFAULT_RNN_CONFIG, kind: 'simpleRNN', layers: 2, units: 8, denseUnits: 0 }
  const diagram = describeRnn(config, { ...regression, problemType: 'multiclass', classes: 3 })
  assert.equal(diagram.layers[1].shape, '8 × 8')
  assert.equal(diagram.layers[2].shape, '8')
  assert.equal(diagram.layers.at(-1).shape, '3')
  assert.equal(diagram.parameterCount, recurrentParameters('simpleRNN', 2, 8) + recurrentParameters('simpleRNN', 8, 8) + 9 * 3)
})

test('RNN-1: rechaza dimensiones, clases y configuración fuera de límites', () => {
  assert.ok(describeRnn(DEFAULT_RNN_CONFIG, { ...regression, steps: 40 }).errors.length)
  assert.ok(describeRnn(DEFAULT_RNN_CONFIG, { ...regression, problemType: 'binary' }).errors.length)
  assert.ok(describeRnn(DEFAULT_RNN_CONFIG, { ...regression, problemType: 'multiclass', classes: 11 }).errors.length)
  assert.ok(describeRnn({ ...DEFAULT_RNN_CONFIG, units: 500 }, regression).errors.length)
})
