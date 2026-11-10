import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeMnistTraining, splitMnistIndices } from '../src/ml/cnn/mnistTraining.ts'
import { validateCnnTrainOptions, readCnnEpochMetrics, DEFAULT_CNN_TRAIN_OPTIONS } from '../src/ml/cnn/trainingTypes.ts'
import { MNIST_PIXELS } from '../src/ml/cnn/mnistPreview.ts'

function generateIdx(n=500) {
  const images=new Uint8Array(16 + n * MNIST_PIXELS)
  const labels=new Uint8Array(8 + n)
  const im=new DataView(images.buffer), lb=new DataView(labels.buffer)
  im.setUint32(0,2051);im.setUint32(4,60000);im.setUint32(8,28);im.setUint32(12,28)
  lb.setUint32(0,2049);lb.setUint32(4,60000)
  for (let i=0;i<n;i++){ images[16+i*MNIST_PIXELS]=i%256; labels[8+i]=i%10 }
  return {images,labels}
}
test('IDX MNIST auténtico convierte muestra limitada sin copiar pixeles',()=>{
  const {images,labels}=generateIdx()
  const batch=decodeMnistTraining(images,labels,500)
  assert.equal(batch.count,500)
  assert.equal(batch.pixels.length,500*MNIST_PIXELS)
  assert.equal(batch.labels.length,500)
  assert.equal(batch.labels[17],7)
  assert.equal(batch.pixels[51*MNIST_PIXELS],51)
  assert.equal(batch.pixels.buffer,images.buffer)
})
test('IDX inválido, tamaños inesperados y etiquetas no válidas abortan',()=>{
  const {images,labels}=generateIdx()
  assert.throws(()=>decodeMnistTraining(images,labels,400),/no permitido/)
  assert.throws(()=>decodeMnistTraining(images.subarray(0,images.length-1),labels,500),/incompletos/)
  labels[8]=11
  assert.throws(()=>decodeMnistTraining(images,labels,500),/Etiqueta/)
  labels[8]=0
  images[0]=123
  assert.throws(()=>decodeMnistTraining(images,labels,500),/Cabeceras/)
})
test('Separación estratificada reproducible: sin cruces, todas las clases y 80/20',()=>{
  const {labels}=generateIdx()
  const chosen=labels.subarray(8)
  const first=splitMnistIndices(chosen,42)
  const second=splitMnistIndices(chosen,42)
  assert.deepEqual(first,second)
  assert.equal(first.train.length,400)
  assert.equal(first.validation.length,100)
  assert.equal(new Set([...first.train,...first.validation]).size,500)
  for (let digit=0;digit<10;digit++) {
    assert.equal(first.validation.filter(index=>chosen[index]===digit).length,10)
    assert.equal(first.train.filter(index=>chosen[index]===digit).length,40)
  }
})
test('No se puede entrenar con un dataset sin alguna clase',()=>{
  const labels=new Uint8Array(500)
  assert.throws(()=>splitMnistIndices(labels),/clase 1/)
})
test('Hiperparámetros restringidos a muestras y tiempos seguros',()=>{
  assert.doesNotThrow(()=>validateCnnTrainOptions(DEFAULT_CNN_TRAIN_OPTIONS))
  assert.throws(()=>validateCnnTrainOptions({...DEFAULT_CNN_TRAIN_OPTIONS,samples:60000}),/muestras|imágenes/)
  assert.throws(()=>validateCnnTrainOptions({...DEFAULT_CNN_TRAIN_OPTIONS,epochs:200}),/Épocas/)
  assert.throws(()=>validateCnnTrainOptions({...DEFAULT_CNN_TRAIN_OPTIONS,batchSize:500}),/Batch/)
  assert.throws(()=>validateCnnTrainOptions({...DEFAULT_CNN_TRAIN_OPTIONS,learningRate:1}),/Learning/)
})
test('Métricas deben ser finitas y tener entrenamiento y validación reales',()=>{
  assert.deepEqual(readCnnEpochMetrics(1,{loss:0.3,acc:0.9,val_loss:0.4,val_acc:0.85}),{epoch:1,loss:0.3,accuracy:0.9,validationLoss:0.4,validationAccuracy:0.85})
  assert.throws(()=>readCnnEpochMetrics(2,{loss:0.3,acc:0.9}),/métricas/)
  assert.throws(()=>readCnnEpochMetrics(2,{loss:Infinity,acc:0.9,val_loss:0.2,val_acc:0.8}),/métricas/)
})
test('Contrato CNN-2 implementa progreso, cancelación y liberación explícitos',async()=>{
  const {readFile}=await import('node:fs/promises')
  const base=new URL('../src/ml/cnn/',import.meta.url)
  const engine=await readFile(new URL('trainEngine.ts',base),'utf8')
  const worker=await readFile(new URL('../../workers/cnn.worker.ts',base),'utf8')
  const session=await readFile(new URL('cnnSession.ts',base),'utf8')
  assert.match(engine,/model\.fit\(/)
  assert.match(engine,/model\.dispose\(\)/)
  assert.match(engine,/validationData:/)
  assert.match(engine,/stopTraining/)
  assert.match(worker,/abort\?\.abort\(\)/)
  assert.match(session,/worker\.terminate\(\)/)
})
