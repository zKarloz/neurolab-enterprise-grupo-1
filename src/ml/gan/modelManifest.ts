/** GAN-4C: contrato puro para validar el manifiesto guardado por la RPC GAN-4A. */
import type { GanDimension, GanLatentDimension } from './architecture.ts'

/** Misma forma que p_preprocessing_json del run GAN-4A. */
export interface GanPreprocessingManifest {
  family: 'gan'
  kind: 'gan_grayscale_csv_v1'
  dimension: GanDimension
  channels: 1
  pixelRange: 'zero_to_255'
  normalization: 'tanh_minus1_plus1'
  latentSize: GanLatentDimension
  unconditional: true
  trainedImages: number
  seedMode: 'unseeded'
}

/** Comprobación pura del manifiesto: antes de reservar tensores o buffers. */
export function parseGanPreprocessingManifest(value: unknown): GanPreprocessingManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Manifiesto GAN ausente.')
  const item = value as Record<string, unknown>
  if (item.family !== 'gan' || item.kind !== 'gan_grayscale_csv_v1' ||
    ![8, 28].includes(item.dimension as number) || item.channels !== 1 ||
    item.pixelRange !== 'zero_to_255' || item.normalization !== 'tanh_minus1_plus1' ||
    ![16, 32, 64].includes(item.latentSize as number) || item.unconditional !== true ||
    !Number.isSafeInteger(item.trainedImages) || (item.trainedImages as number) < 100 ||
    (item.trainedImages as number) > 2000 || item.seedMode !== 'unseeded') {
    throw new Error('Manifiesto GAN inválido o incompatible con este generador.')
  }
  return value as GanPreprocessingManifest
}

export function isGanManifest(value: unknown): value is GanPreprocessingManifest {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    (value as { family?: unknown }).family === 'gan'
}

