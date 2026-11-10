/**
 * CNN-2: lote pequeño de MNIST auténtico para entrenamiento local.
 * No se envían imágenes ni etiquetas a Supabase. La muestra se extrae de IDX/gzip.
 */
import { MNIST_PIXELS, MNIST_TRAIN_IMAGES_URL, MNIST_TRAIN_LABELS_URL, readGzipPrefix } from './mnistPreview.ts'

export const CNN_TRAIN_SIZES = [500, 1000, 2000] as const
export type CnnSampleCount = typeof CNN_TRAIN_SIZES[number]

export interface MnistTrainingBatch {
  pixels: Uint8Array // bytes [0, 255] consecutivos; sin encabezado IDX
  labels: Uint8Array // dígitos [0..9]
  count: number
}

/** Valida cabeceras y longitudes; nunca acepta imágenes o etiquetas truncadas. */
export function decodeMnistTraining(images: Uint8Array, labels: Uint8Array, count: number): MnistTrainingBatch {
  if (!CNN_TRAIN_SIZES.includes(count as CnnSampleCount)) throw new Error('Tamaño de muestra MNIST no permitido.')
  if (images.length !== 16 + count * MNIST_PIXELS || labels.length !== 8 + count) throw new Error('Datos IDX incompletos o de tamaño inesperado.')
  const ih = new DataView(images.buffer, images.byteOffset, images.byteLength)
  const lh = new DataView(labels.buffer, labels.byteOffset, labels.byteLength)
  if (ih.getUint32(0) !== 2051 || lh.getUint32(0) !== 2049 || ih.getUint32(8) !== 28 || ih.getUint32(12) !== 28) {
    throw new Error('Cabeceras IDX incompatibles; se esperaba MNIST 28 × 28.')
  }
  if (ih.getUint32(4) < count || lh.getUint32(4) < count) throw new Error('La fuente MNIST no contiene la muestra solicitada.')
  const labelBytes = labels.subarray(8)
  if (labelBytes.some((value) => value > 9)) throw new Error('Etiqueta MNIST fuera de las 10 clases.')
  return { pixels: images.subarray(16), labels: labelBytes, count }
}

/** Descarga solo 500, 1000 o 2000 ejemplos, sin traer los 60 000 completos. */
export async function loadMnistTraining(count: CnnSampleCount, signal?: AbortSignal): Promise<MnistTrainingBatch> {
  const [images, labels] = await Promise.all([
    readGzipPrefix(MNIST_TRAIN_IMAGES_URL, 16 + count * MNIST_PIXELS, signal),
    readGzipPrefix(MNIST_TRAIN_LABELS_URL, 8 + count, signal),
  ])
  if (signal?.aborted) throw new Error('Descarga cancelada.')
  return decodeMnistTraining(images, labels, count)
}

/** Mezcla pseudoaleatoria reproducible para impedir mezclar entrenamiento y validación. */
function shuffle(indices: number[], random: () => number) {
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
}

/** 80/20 estratificado por dígito y sin índices repetidos en ambas particiones. */
export function splitMnistIndices(labels: Uint8Array, seed = 42): { train: number[]; validation: number[] } {
  if (labels.length < 20 || !Number.isInteger(seed)) throw new Error('La muestra o la semilla no son válidas.')
  let state = (seed >>> 0) || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const train: number[] = []
  const validation: number[] = []
  for (let digit = 0; digit < 10; digit++) {
    const indices: number[] = []
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] > 9) throw new Error('Etiqueta no válida.')
      if (labels[i] === digit) indices.push(i)
    }
    if (indices.length < 2) throw new Error(`No hay suficientes ejemplos de la clase ${digit}.`)
    shuffle(indices, random)
    const count = Math.max(1, Math.floor(indices.length * 0.2))
    validation.push(...indices.slice(0, count))
    train.push(...indices.slice(count))
  }
  shuffle(train, random)
  shuffle(validation, random)
  return { train, validation }
}
