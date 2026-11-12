import test from 'node:test'
import assert from 'node:assert/strict'
import { describeGan, denseParameters, DEFAULT_GAN_CONFIG } from '../src/ml/gan/architecture.ts'

test('GAN-1: parámetros Dense y total de ambas redes para 8x8', () => {
  assert.equal(denseParameters(32, 64), 2112)
  const description = describeGan(DEFAULT_GAN_CONFIG, 8)
  assert.deepEqual(description.errors, [])
  assert.equal(description.generator.totalParameters, 10432)
  assert.equal(description.discriminator.totalParameters, 6273)
  assert.equal(description.totalParameters, 16705)
  assert.equal(description.generator.layers.at(-1).shape, '[8, 8, 1]')
  assert.equal(description.discriminator.layers.at(-1).shape, '[1]')
})

test('GAN-1: 28x28 tiene 784 píxeles con tanh y sigmoid distintos', () => {
  const description = describeGan(DEFAULT_GAN_CONFIG, 28)
  assert.equal(description.imagePixels, 784)
  assert.equal(description.generator.totalParameters, 57232)
  assert.equal(description.discriminator.totalParameters, 52353)
  assert.match(description.generator.layers.at(-1).name, /tanh/)
  assert.match(description.discriminator.layers.at(-1).name, /sigmoid/)
})

test('GAN-1: rechaza formas y unidades fuera del contrato, sin crear un modelo', () => {
  assert.ok(describeGan(DEFAULT_GAN_CONFIG, 10).errors.length)
  assert.ok(describeGan({ ...DEFAULT_GAN_CONFIG, latentSize: 12 }, 8).errors.length)
  assert.ok(describeGan({ ...DEFAULT_GAN_CONFIG, generatorUnits: 4096 }, 28).errors.length)
  assert.throws(() => denseParameters(0, 16))
})
