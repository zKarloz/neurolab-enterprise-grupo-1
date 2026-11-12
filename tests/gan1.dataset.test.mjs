import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadGanImageCsv, selectGanExamples } from '../src/ml/gan/imageDataset.ts'

const fixture = readFileSync(new URL('./fixtures/gan1_imagenes_demo.csv', import.meta.url), 'utf8')
const makeFile = (text, name = 'demo.csv') => new File([text], name, { type: 'text/csv' })

test('GAN-1: CSV demo 120 imágenes 8x8, etiquetas ignoradas, escala Digits', async () => {
  const dataset = await loadGanImageCsv(makeFile(fixture))
  assert.equal(dataset.count, 120)
  assert.equal(dataset.dimension, 8)
  assert.equal(dataset.originalScale, 16)
  assert.equal(dataset.hadLabels, true)
  assert.equal(dataset.pixels.length, 120 * 64)
  assert.equal(selectGanExamples(dataset).length, 8)
  assert.ok(dataset.pixels.some((p) => p === 255))
})

test('GAN-1: acepta imagen sin label y conserva escala 0..255', async () => {
  const lines = fixture.trimEnd().split('\n')
  const noLabels = lines.map((line) => line.split(',').slice(1).join(','))
  const dataset = await loadGanImageCsv(makeFile(noLabels.join('\n')+'\n'))
  assert.equal(dataset.hadLabels, false)
  assert.equal(dataset.count, 120)
  assert.equal(dataset.dimension, 8)
})

test('GAN-1: CSV numérico sin cabecera se interpreta correctamente', async () => {
  const lines = fixture.trimEnd().split('\n').slice(1)
  const dataset = await loadGanImageCsv(makeFile(lines.join('\n')+'\n'))
  assert.equal(dataset.hadLabels, true)
  assert.equal(dataset.count, 120)
})

test('GAN-1: acepta 28x28 como 784 píxeles', async () => {
  const header = Array.from({ length: 784 }, (_, i) => `pixel_${i}`).join(',')
  const row = Array.from({ length: 784 }, (_, i) => i % 256).join(',')
  const dataset = await loadGanImageCsv(makeFile([header, ...Array(100).fill(row)].join('\n')+'\n'))
  assert.equal(dataset.dimension, 28)
  assert.equal(dataset.originalScale, 255)
  assert.equal(dataset.pixels.length, 100 * 784)
})

test('GAN-1: rechaza menos de 100 imágenes y píxeles fuera de rango', async () => {
  const lines = fixture.trimEnd().split('\n')
  await assert.rejects(loadGanImageCsv(makeFile(lines.slice(0, 20).join('\n'))), /al menos 100/)
  const corrupted = [...lines]
  corrupted[7] = corrupted[7].replace(/,\d+$/, ',999')
  await assert.rejects(loadGanImageCsv(makeFile(corrupted.join('\n'))), /inválido/)
})

test('GAN-1: limita filas y cancela con AbortSignal antes de leer', async () => {
  const dataset = await loadGanImageCsv(makeFile(fixture), undefined, 100)
  assert.equal(dataset.count, 100)
  assert.equal(dataset.truncated, true)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(loadGanImageCsv(makeFile(fixture), controller.signal), /cancelada/)
})

test('GAN-1: bloquea archivos ajenos y cantidades de vista previa inválidas', async () => {
  await assert.rejects(loadGanImageCsv(makeFile(fixture, 'demo.txt')), /CSV/)
  const dataset = await loadGanImageCsv(makeFile(fixture))
  assert.throws(() => selectGanExamples(dataset, 17))
})
