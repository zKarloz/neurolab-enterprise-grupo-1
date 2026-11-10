import test from 'node:test'
import assert from 'node:assert/strict'
import { loadLocalImageCsv, selectLocalImageGallery, splitLocalImageIndices } from '../src/ml/cnn/localImageCsv.ts'
import { defaultCnnConfig, describeCnn } from '../src/ml/cnn/architecture.ts'

function asCsvFile(text, name = 'digits.csv') {
  const blob = new Blob([text], { type: 'text/csv' })
  return Object.assign(blob, { name })
}

test('digits-8x8 en CSV detecta dimensiones, 10 clases y escala 16', async () => {
  const header = Array.from({ length: 64 }, (_, i) => `pixel_${i}`).join(',') + ',label'
  const rows = Array.from({ length: 179 }, (_, i) => Array.from({length:64}, (_value,k) => k%17).join(',') + ',' + (i%10))
  const dataset = await loadLocalImageCsv(asCsvFile(header + '\n' + rows.join('\n')))
  assert.equal(dataset.count, 179)
  assert.equal(dataset.width, 8)
  assert.equal(dataset.height, 8)
  assert.equal(dataset.originalScale, 16)
  assert.deepEqual(dataset.classNames, Array.from({ length: 10 }, (_, i) => String(i)))
  assert.equal(dataset.pixels.length, dataset.count * 64)
  assert.equal(dataset.labels.length, 179)
  assert.ok(dataset.pixels.some((value) => value === 255))
  const preview = selectLocalImageGallery(dataset, 3)
  assert.equal(preview.length, 30)
  const diagram = describeCnn(defaultCnnConfig(), { width: 8, height: 8, channels: 1, classes: 10 })
  assert.deepEqual(diagram.errors, [])
  assert.match(diagram.layers[0].shape, /^8 × 8 × 1$/)
  const split = splitLocalImageIndices(dataset.labels, 10, 42)
  assert.equal(split.train.length + split.validation.length, 179)
  assert.equal(new Set([...split.train, ...split.validation]).size, 179)
})

test('MNIST formato Kaggle 28x28 con etiqueta al principio', async () => {
  const header = 'label,' + Array.from({ length: 784 }, (_, i) => `pixel${i}`).join(',')
  const rows = Array.from({length: 100}, (_, i) => `${i%10},` + Array.from({length: 784}, (_, k) => k%256).join(','))
  const dataset = await loadLocalImageCsv(asCsvFile(header+'\n'+rows.join('\n')+'\n'))
  assert.equal(dataset.count, 100)
  assert.equal(dataset.width, 28)
  assert.equal(dataset.originalScale, 255)
  assert.equal(dataset.classNames.length, 10)
  const diagram = describeCnn(defaultCnnConfig(), {width:28,height:28,channels:1,classes:10})
  assert.deepEqual(diagram.errors, [])
})

test('los datasets con etiquetas insuficientes fallan sin cargar tensores', async () => {
  const header = Array.from({length:64},(_,i)=>`pixel_${i}`).join(',')+',label'
  const rows = Array.from({length:100}, (_,i) => Array.from({length:64},()=>0).join(',')+','+(i===0?'raro':'comun'))
  await assert.rejects(loadLocalImageCsv(asCsvFile(header+'\n'+rows.join('\n'))), /al menos dos imágenes/i)
})

test('CSV con pixeles no cuadrados se rechaza', async () => {
  await assert.rejects(loadLocalImageCsv(asCsvFile('label,pixel0,pixel1\n0,0,0')), /8×8 o 28×28/i)
})

test('sin filas suficientes se rechaza; no se envía nada por red', async () => {
  const header = 'label,' + Array.from({length:64},(_,i)=>`pixel_${i}`).join(',')
  const row = '0,' + Array.from({length:64},()=>0).join(',')
  await assert.rejects(loadLocalImageCsv(asCsvFile(header+'\n'+row)), /al menos 100/i)
})


test('MNIST sin encabezados se acepta con etiqueta en primera columna', async () => {
  const rows = Array.from({ length: 100 }, (_, i) => `${i%10},` + Array.from({length:784}, (_, k) => k%256).join(','))
  const data = await loadLocalImageCsv(asCsvFile(rows.join('\n'), 'mnist_train.csv'))
  assert.equal(data.count, 100)
  assert.equal(data.width, 28)
  assert.equal(data.classNames.length, 10)
})
