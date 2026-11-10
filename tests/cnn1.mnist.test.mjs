import test from 'node:test'
import assert from 'node:assert/strict'
import { gzipSync } from 'node:zlib'
import { decodeMnistPreview, readGzipPrefix, selectMnistGallery, MNIST_PIXELS } from '../src/ml/cnn/mnistPreview.ts'

function idx(count) {
  const images = new Uint8Array(16 + count * MNIST_PIXELS)
  const labels = new Uint8Array(8 + count)
  const im = new DataView(images.buffer)
  const la = new DataView(labels.buffer)
  im.setUint32(0, 2051); im.setUint32(4, count); im.setUint32(8, 28); im.setUint32(12, 28)
  la.setUint32(0, 2049); la.setUint32(4, count)
  for (let i=0;i<count;i++) { labels[8+i]=i%10; images[16 + i * MNIST_PIXELS] = i % 256 }
  return {images,labels}
}

test('IDX conserva píxeles, etiquetas y frecuencias de la muestra', () => {
  const { images,labels } = idx(30)
  const p = decodeMnistPreview(images,labels,30)
  assert.equal(p.inspected,30)
  assert.deepEqual(p.distribution,[3,3,3,3,3,3,3,3,3,3])
  assert.equal(p.samples[11].pixels[0],11)
  assert.equal(p.samples[11].pixels.length, MNIST_PIXELS)
  assert.equal(selectMnistGallery(p,1).length,10)
})

test('IDX rechazado cuando es ilegible o tiene una etiqueta inválida', () => {
  const {images,labels}=idx(2)
  assert.throws(()=>decodeMnistPreview(images,labels,3), /incompletos/)
  labels[8] = 11
  assert.throws(()=>decodeMnistPreview(images,labels,2), /inválida/)
  labels[8] = 0
  images[0] = 20
  assert.throws(()=>decodeMnistPreview(images,labels,2), /incompatible/)
})

test('Descompresión gzip por prefijo lee solo los bytes solicitados', async () => {
  const original=Uint8Array.from({length:50_000}, (_,i)=>i%251)
  const gz=gzipSync(original)
  const fetchMock=async()=>new Response(gz,{status:200})
  const prefix=await readGzipPrefix('https://example.test/mnist.gz', 500, undefined,fetchMock)
  assert.deepEqual(prefix, original.subarray(0,500))
})

test('Descompresión detecta archivos truncados', async () => {
  const gz=gzipSync(new Uint8Array(10))
  await assert.rejects(()=>readGzipPrefix('https://example.test/mnist.gz',100,undefined,async()=>new Response(gz)),/antes de lo esperado/)
})
