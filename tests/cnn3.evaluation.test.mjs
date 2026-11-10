import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCnnEvaluation, splitCnnHoldoutIndices } from '../src/ml/cnn/cnnEvaluation.ts'
import { checkCnnPredictionFile } from '../src/ml/cnn/cnnImageInput.ts'

function labelsFixture(count = 20, classes = 5) {
  return Uint8Array.from({ length: count * classes }, (_, index) => index % classes)
}

test('partición estratificada 70/15/15 es reproducible y no presenta fugas', () => {
  const labels = labelsFixture(20, 5)
  const a = splitCnnHoldoutIndices(labels, 5, 42)
  const b = splitCnnHoldoutIndices(labels, 5, 42)
  assert.deepEqual(a, b)
  assert.equal(a.train.length + a.validation.length + a.test.length, labels.length)
  assert.equal(new Set([...a.train, ...a.validation, ...a.test]).size, labels.length)
  for (const section of [a.train, a.validation, a.test]) {
    for (let classId = 0; classId < 5; classId++) {
      assert.ok(section.some((index) => labels[index] === classId), `La clase ${classId} falta en la sección`)
    }
  }
})

test('con 2 ejemplos por clase, ambos aparecen en train/test; sin inventar validación', () => {
  assert.throws(() => splitCnnHoldoutIndices(new Uint8Array([0,0,1,1]), 2), /validación/i)
  const labels = Uint8Array.from([0,0,1,1,1,1,1])
  const split = splitCnnHoldoutIndices(labels, 2)
  assert.equal(split.train.length + split.validation.length + split.test.length, labels.length)
  assert.equal(new Set([...split.train, ...split.validation, ...split.test]).size, labels.length)
})

test('matriz de confusión usa filas reales y columnas predichas', () => {
  const result = computeCnnEvaluation(['perro','lobo'], [0,0,1,1], [[0.9,0.1],[0.2,0.8],[0.3,0.7],[0.8,0.2]])
  assert.deepEqual(result.matrix, [[1,1],[1,1]])
  assert.equal(result.accuracy, 0.5)
  assert.equal(result.classes[0].precision, 0.5)
  assert.equal(result.classes[1].recall, 0.5)
  assert.equal(result.macroF1, 0.5)
  assert.equal(result.sampleCount, 4)
  assert.ok(result.loss > 0)
})

test('en clasificación perfecta, precision/recall/F1 y accuracy son 1', () => {
  const result = computeCnnEvaluation(['0','1','2'], [0,1,2], [[1,0,0],[0,1,0],[0,0,1]])
  assert.equal(result.accuracy, 1)
  assert.equal(result.macroPrecision, 1)
  assert.equal(result.macroRecall, 1)
  assert.equal(result.macroF1, 1)
  assert.deepEqual(result.matrix, [[1,0,0],[0,1,0],[0,0,1]])
})

test('soporte por clase y predicción inexistente no producen NaN', () => {
  const result = computeCnnEvaluation(['a','b'], [0,0,1], [[1,0],[1,0],[1,0]])
  assert.equal(result.classes[1].precision, 0)
  assert.equal(result.classes[1].recall, 0)
  assert.equal(result.classes[1].f1, 0)
  assert.deepEqual(result.classes.map((item) => item.support), [2,1])
})

test('probabilidades alteradas o dimensiones incoherentes se rechazan', () => {
  assert.throws(() => computeCnnEvaluation(['0','1'], [0], [[0.2,0.2]]), /incoherentes/i)
  assert.throws(() => computeCnnEvaluation(['0','1'], [2], [[0.9,0.1]]), /inválido/i)
  assert.throws(() => computeCnnEvaluation(['0','1'], [0,1], [[0.9,0.1]]), /incompatibles/i)
})

test('se rechazan etiquetas fuera del intervalo y clases sin dos muestras', () => {
  assert.throws(() => splitCnnHoldoutIndices(new Uint8Array([0,0,2,2]), 2), /fuera de rango/i)
  assert.throws(() => splitCnnHoldoutIndices(new Uint8Array([0,0,1]), 2), /al menos dos/i)
})

test('predicción de imagen solo permite PNG/JPG/WebP de hasta 5 MiB', () => {
  assert.doesNotThrow(() => checkCnnPredictionFile({ name: 'prueba.png', type: 'image/png', size: 100 }))
  assert.doesNotThrow(() => checkCnnPredictionFile({ name: 'prueba.webp', type: 'image/webp', size: 5000 }))
  assert.throws(() => checkCnnPredictionFile({ name: 'invasor.svg', type: 'image/svg+xml', size: 1 }), /PNG, JPG o WebP/i)
  assert.throws(() => checkCnnPredictionFile({ name: 'enorme.png', type: 'image/png', size: 6 * 1024 * 1024 }), /5 MiB/i)
})
