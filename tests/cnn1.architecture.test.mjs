import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultCnnConfig, describeCnn, resizeCnnBlocks } from '../src/ml/cnn/architecture.ts'

test('MNIST: 2 bloques generan dimensiones esperadas y 105866 parámetros', () => {
  const d = describeCnn(defaultCnnConfig())
  assert.deepEqual(d.errors, [])
  assert.deepEqual(d.layers.map(x => x.shape), ['28 × 28 × 1', '28 × 28 × 16', '14 × 14 × 16', '14 × 14 × 32', '7 × 7 × 32', '1568', '64', '10 clases'])
  assert.equal(d.parameterCount, 105866)
})

test('El contador de bloques respeta límites y conserva datos de los existentes', () => {
  const base = defaultCnnConfig()
  const three = resizeCnnBlocks(base, 3)
  assert.equal(three.blocks.length, 3)
  assert.deepEqual(three.blocks[0], base.blocks[0])
  assert.equal(resizeCnnBlocks(three, 1).blocks.length, 1)
  assert.throws(() => resizeCnnBlocks(base, 0))
  assert.throws(() => resizeCnnBlocks(base, 4))
})

test('Padding valid reduce dimensiones y rechaza kernels imposibles', () => {
  const base = defaultCnnConfig()
  const d = describeCnn({ ...base, blocks: [{ ...base.blocks[0], padding:'valid' }] })
  assert.equal(d.layers[1].shape, '26 × 26 × 16')
  assert.equal(d.layers[2].shape, '13 × 13 × 16')
  const bad = describeCnn(resizeCnnBlocks(base, 3), { width: 2, height: 2, channels: 1, classes: 2 })
  assert.ok(bad.errors.length)
})

test('Sin pooling, el límite de parámetros evita una arquitectura pesada', () => {
  const base = resizeCnnBlocks(defaultCnnConfig(), 3)
  const large = { blocks: base.blocks.map(x => ({ ...x, pool: false, filters: 64, kernel: 5, padding: 'same' })), denseUnits: 128 }
  assert.match(describeCnn(large).errors.join(' '), /2 millones/)
})

test('Todos los bloques incluyen nombre y parámetros desglosados', () => {
  const d = describeCnn(defaultCnnConfig())
  assert.equal(d.layers.reduce((sum, l) => sum + l.parameters, 0), d.parameterCount)
  assert.equal(d.layers.at(-1).name, 'Salida')
})
