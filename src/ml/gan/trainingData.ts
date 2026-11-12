/** GAN-2: validación y normalización local del CSV para la activación tanh. */
import { describeGan, type GanConfig } from './architecture.ts'
import { MAX_GAN_IMAGES, MIN_GAN_IMAGES, type GanImageDataset } from './imageDataset.ts'

export function validateGanTrainingData(dataset: GanImageDataset, config: GanConfig): void {
  const description = describeGan(config, dataset.dimension)
  if (description.errors.length) throw new Error(description.errors.join(' '))
  if (!Number.isSafeInteger(dataset.count) || dataset.count < MIN_GAN_IMAGES || dataset.count > MAX_GAN_IMAGES) {
    throw new Error('La GAN requiere entre 100 y 2 000 imágenes reales.')
  }
  if (!(dataset.pixels instanceof Uint8Array) || dataset.pixels.length !== dataset.count * description.imagePixels) {
    throw new Error('Forma o contenido del CSV incompatible con la arquitectura GAN.')
  }
  if (![16, 255].includes(dataset.originalScale)) throw new Error('Escala original de imágenes no admitida.')
}

/** Recorta el dataset a un minibatch sin asignar tensores globales en memoria. */
export function makeGanRealBatch(dataset: GanImageDataset, imageIndices: readonly number[]): Float32Array {
  const pixelsPerImage = dataset.dimension ** 2
  if (!imageIndices.length || imageIndices.length > 64) throw new Error('Batch GAN fuera de rango.')
  const batch = new Float32Array(imageIndices.length * pixelsPerImage)
  imageIndices.forEach((imageIndex, position) => {
    if (!Number.isSafeInteger(imageIndex) || imageIndex < 0 || imageIndex >= dataset.count) {
      throw new Error('Índice de imagen GAN inválido.')
    }
    const source = imageIndex * pixelsPerImage
    const target = position * pixelsPerImage
    for (let pixel = 0; pixel < pixelsPerImage; pixel++) {
      // imageDataset.pixels ya transformó Digits 0..16 y MNIST 0..255 al rango 0..255.
      batch[target + pixel] = (dataset.pixels[source + pixel] / 127.5) - 1
    }
  })
  return batch
}

/** Barajado por época: una GAN no usa etiquetas ni partición supervisada train/test. */
export function shuffledGanIndices(count: number): number[] {
  if (!Number.isSafeInteger(count) || count < MIN_GAN_IMAGES || count > MAX_GAN_IMAGES) {
    throw new Error('Cantidad de imágenes GAN inválida.')
  }
  const indices = Array.from({ length: count }, (_value, index) => index)
  for (let index = indices.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[indices[index], indices[other]] = [indices[other], indices[index]]
  }
  return indices
}
