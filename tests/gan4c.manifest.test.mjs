/** Contratos puros del manifiesto GAN: no requieren TensorFlow.js. */
import test from 'node:test'
import assert from 'node:assert/strict'
import { isGanManifest, parseGanPreprocessingManifest } from '../src/ml/gan/modelManifest.ts'

const valid = {
  family: 'gan', kind: 'gan_grayscale_csv_v1', dimension: 8,
  channels: 1, pixelRange: 'zero_to_255', normalization: 'tanh_minus1_plus1',
  latentSize: 32, unconditional: true, trainedImages: 178, seedMode: 'unseeded',
}

test('GAN-4C: manifiesto original de GAN-4A se reconoce por familia real', () => {
  assert.equal(isGanManifest(valid), true)
  assert.deepEqual(parseGanPreprocessingManifest(valid), valid)
  assert.equal(isGanManifest({ family: 'rnn' }), false)
})

test('GAN-4C: acepta 28x28 y los tres tamaños de ruido admitidos', () => {
  for (const latentSize of [16, 32, 64]) assert.equal(parseGanPreprocessingManifest({ ...valid, dimension: 28, latentSize }).dimension, 28)
})

test('GAN-4C: rechaza canales, escala y rango incompatibles', () => {
  for (const invalid of [
    { channels: 3 }, { dimension: 32 }, { normalization: 'divide_by_255' },
    { pixelRange: 'minus1_to1' }, { unconditional: false }, { latentSize: 128 },
    { trainedImages: 99 }, { trainedImages: 2001 }, { seedMode: 'fixed' },
    { kind: 'rnn_temporal_csv_v1' }, { family: 'cnn' },
  ]) assert.throws(() => parseGanPreprocessingManifest({ ...valid, ...invalid }), /incompatible/)
})

test('GAN-4C: no se aceptan null, arrays ni metadatos no objetos', () => {
  for (const bad of [null, [], 12, 'gan']) assert.throws(() => parseGanPreprocessingManifest(bad))
})
