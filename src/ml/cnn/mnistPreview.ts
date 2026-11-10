/**
 * NeuroLab CNN-1: vista previa auténtica de MNIST a partir de archivos IDX + gzip.
 * Se descargan únicamente los primeros registros necesarios y se descarta el flujo;
 * no se descargan los 60 000 ejemplos ni se crean tensores durante la vista previa.
 * Fuente: espejo público de CVDF de la base MNIST original.
 */
const ROOT = 'https://storage.googleapis.com/cvdf-datasets/mnist'
export const MNIST_TRAIN_IMAGES_URL = `${ROOT}/train-images-idx3-ubyte.gz`
export const MNIST_TRAIN_LABELS_URL = `${ROOT}/train-labels-idx1-ubyte.gz`
export const MNIST_PREVIEW_LIMIT = 240
export const MNIST_PIXELS = 28 * 28

export interface MnistSample {
  index: number
  label: number
  pixels: Uint8Array
}
export interface MnistPreview {
  samples: MnistSample[]
  distribution: number[]
  inspected: number
}

type FetchLike = typeof fetch

/** Extrae los primeros bytes descomprimidos del stream sin retener el resto. */
export async function readGzipPrefix(url: string, byteCount: number, signal?: AbortSignal, fetcher: FetchLike = fetch): Promise<Uint8Array> {
  if (!Number.isInteger(byteCount) || byteCount <= 0 || byteCount > 2_000_000) throw new Error('Tamaño de vista previa no permitido.')
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no admite descompresión gzip. Utiliza un navegador actualizado.')
  const response = await fetcher(url, { method: 'GET', credentials: 'omit', signal })
  if (!response.ok || !response.body) throw new Error(`No se pudo leer MNIST (HTTP ${response.status}).`)
  const reader = response.body.pipeThrough(new DecompressionStream('gzip')).getReader()
  const result = new Uint8Array(byteCount)
  let offset = 0
  try {
    while (offset < byteCount) {
      const { done, value } = await reader.read()
      if (done) throw new Error('El archivo MNIST terminó antes de lo esperado.')
      const length = Math.min(byteCount - offset, value.length)
      result.set(value.subarray(0, length), offset)
      offset += length
    }
  } finally {
    // No esperar a que se descargue o decodifique el resto del dataset.
    void reader.cancel().catch(() => {})
  }
  return result
}

/** Decodifica solamente imágenes y etiquetas auténticas, con validación del encabezado IDX. */
export function decodeMnistPreview(images: Uint8Array, labels: Uint8Array, count: number): MnistPreview {
  if (!Number.isInteger(count) || count < 1 || count > MNIST_PREVIEW_LIMIT) throw new Error('Cantidad de muestras no admitida.')
  if (images.length < 16 + count * MNIST_PIXELS || labels.length < 8 + count) throw new Error('Archivos IDX incompletos.')
  const imageHeader = new DataView(images.buffer, images.byteOffset, images.byteLength)
  const labelHeader = new DataView(labels.buffer, labels.byteOffset, labels.byteLength)
  if (imageHeader.getUint32(0) !== 2051 || labelHeader.getUint32(0) !== 2049 || imageHeader.getUint32(8) !== 28 || imageHeader.getUint32(12) !== 28) {
    throw new Error('Formato MNIST IDX incompatible.')
  }
  if (imageHeader.getUint32(4) < count || labelHeader.getUint32(4) < count) throw new Error('El archivo MNIST no contiene suficientes ejemplos.')
  const distribution = Array.from({ length: 10 }, () => 0)
  const samples: MnistSample[] = []
  for (let i = 0; i < count; i++) {
    const label = labels[8 + i]
    if (label > 9) throw new Error(`Etiqueta MNIST inválida en posición ${i}.`)
    const start = 16 + i * MNIST_PIXELS
    samples.push({ index: i, label, pixels: images.slice(start, start + MNIST_PIXELS) })
    distribution[label]++
  }
  return { samples, distribution, inspected: count }
}

/** Carga parcial, sin persistencia y sin acceso a Supabase. */
export async function loadMnistPreview(signal?: AbortSignal, count = MNIST_PREVIEW_LIMIT): Promise<MnistPreview> {
  if (!Number.isInteger(count) || count < 1 || count > MNIST_PREVIEW_LIMIT) throw new Error('Cantidad de muestras no admitida.')
  const [images, labels] = await Promise.all([
    readGzipPrefix(MNIST_TRAIN_IMAGES_URL, 16 + count * MNIST_PIXELS, signal),
    readGzipPrefix(MNIST_TRAIN_LABELS_URL, 8 + count, signal),
  ])
  return decodeMnistPreview(images, labels, count)
}

/** Selecciona imágenes por dígito para evitar una galería sesgada hacia las primeras filas. */
export function selectMnistGallery(preview: MnistPreview, perClass = 3): MnistSample[] {
  const seen = Array.from({ length: 10 }, () => 0)
  const chosen: MnistSample[] = []
  for (const sample of preview.samples) {
    if (seen[sample.label] < perClass) {
      chosen.push(sample)
      seen[sample.label]++
    }
  }
  return chosen.sort((a, b) => a.label - b.label || a.index - b.index)
}
