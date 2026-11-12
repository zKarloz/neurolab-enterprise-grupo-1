/** GAN-3: resumen descriptivo de las muestras (sin métricas de realismo ficticias). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeGanGeneratedBatch, validateGanGeneratedBatch, validateGanSampleCount } from '../src/ml/gan/generation.ts'

test('GAN-3: tamaños admitidos, dimensiones y longitud exacta del buffer', () => {
  for (const count of [4, 8, 16]) validateGanSampleCount(count)
  for (const count of [0, 1, 2, 32, 100, NaN, Infinity]) {
    assert.throws(() => validateGanSampleCount(count), /4, 8 o 16/)
  }
  validateGanGeneratedBatch({ count: 4, dimension: 8, pixels: new Uint8Array(4 * 64) })
  validateGanGeneratedBatch({ count: 8, dimension: 28, pixels: new Uint8Array(8 * 784) })
  assert.throws(() => validateGanGeneratedBatch({ count: 8, dimension: 8, pixels: new Uint8Array(8 * 63) }), /dimensiones/)
  assert.throws(() => validateGanGeneratedBatch({ count: 8, dimension: 9, pixels: new Uint8Array(8 * 81) }), /Resolución/)
})

test('GAN-3: brillo, rango y diferencia absoluta media se calculan desde los píxeles reales', () => {
  const pixels = new Uint8Array(4 * 64)
  pixels.fill(0, 0, 64)
  pixels.fill(255, 64, 128)
  pixels.fill(0, 128, 192)
  pixels.fill(255, 192, 256)
  const result = summarizeGanGeneratedBatch({ count: 4, dimension: 8, pixels })
  assert.equal(result.meanIntensity, 127.5)
  assert.equal(result.minimumPixel, 0)
  assert.equal(result.maximumPixel, 255)
  // Seis pares posibles: cuatro distan 255 y dos distan 0.
  assert.ok(Math.abs(result.meanPairwiseDistance - 170) < 1e-9)
})

test('GAN-3: cuatro imágenes idénticas no se presentan como diversidad alta', () => {
  const result = summarizeGanGeneratedBatch({ count: 4, dimension: 8, pixels: new Uint8Array(4 * 64).fill(128) })
  assert.equal(result.meanPairwiseDistance, 0)
  assert.equal(result.meanIntensity, 128)
})
