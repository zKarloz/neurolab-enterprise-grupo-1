/**
 * Preprocesamiento local de PNG/JPG/WebP para inferencia CNN.
 * Se conservan proporciones, se centra la imagen y se escala a la misma forma
 * de entrada del CSV. Por defecto invierte trazos negros sobre fondo blanco
 * al formato blanco sobre negro típico de Digits/MNIST.
 */
import type { CnnInputShape } from './architecture.ts'

export const MAX_CNN_IMAGE_BYTES = 5 * 1024 * 1024
const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function checkCnnPredictionFile(file: Pick<File, 'size' | 'type' | 'name'>) {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Utiliza PNG, JPG o WebP.')
  if (file.size < 1 || file.size > MAX_CNN_IMAGE_BYTES) throw new Error('La imagen debe tener como máximo 5 MiB.')
}

/** Una única imagen, un canal, valores 0–255; normaliza el motor a [0, 1]. */
export async function prepareCnnPredictionImage(file: File, input: CnnInputShape, invert = true): Promise<Uint8Array> {
  checkCnnPredictionFile(file)
  if (input.channels !== 1 || ![8, 28].includes(input.width) || input.width !== input.height) {
    throw new Error('El modelo actual solo admite imágenes cuadradas de 8×8 o 28×28 en grises.')
  }
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('No fue posible leer la imagen seleccionada.'))
      img.src = url
    })
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 8192 || image.naturalHeight > 8192) {
      throw new Error('Dimensiones de imagen inválidas o excesivas.')
    }
    const canvas = document.createElement('canvas')
    canvas.width = input.width
    canvas.height = input.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('No fue posible procesar la imagen en este navegador.')
    context.fillStyle = invert ? '#ffffff' : '#000000'
    context.fillRect(0, 0, canvas.width, canvas.height)
    const ratio = Math.min(input.width / image.naturalWidth, input.height / image.naturalHeight) * 0.84
    const width = image.naturalWidth * ratio
    const height = image.naturalHeight * ratio
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
    const pixels = new Uint8Array(canvas.width * canvas.height)
    for (let i = 0; i < pixels.length; i++) {
      const offset = i * 4
      const gray = Math.round(0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2])
      pixels[i] = invert ? 255 - gray : gray
    }
    return pixels
  } finally {
    URL.revokeObjectURL(url)
  }
}
