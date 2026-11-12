/** GAN-3: contrato local de inferencia del generador. Nunca contiene el CSV original. */
import type { GanDimension } from './architecture.ts'

export type GanSampleCount = 4 | 8 | 16

export interface GanGeneratedBatch {
  dimension: GanDimension
  count: GanSampleCount
  /** Píxeles consecutivos en gris [0,255], únicamente de muestras generadas. */
  pixels: Uint8Array
}

export interface GanGenerationDiagnostics {
  /** Media de intensidad de las muestras, escala [0,255]. */
  meanIntensity: number
  /** Distancia absoluta media entre pares de muestras; solo diagnóstico descriptivo. */
  meanPairwiseDistance: number
  minimumPixel: number
  maximumPixel: number
}

export function validateGanSampleCount(value: number): asserts value is GanSampleCount {
  if (value !== 4 && value !== 8 && value !== 16) {
    throw new Error('GAN-3 permite generar 4, 8 o 16 imágenes.')
  }
}

/** No aceptar imágenes truncadas, NaN ni tamaños incompatibles con el modelo. */
export function validateGanGeneratedBatch(batch: GanGeneratedBatch): void {
  validateGanSampleCount(batch.count)
  if (batch.dimension !== 8 && batch.dimension !== 28) throw new Error('Resolución GAN inválida.')
  if (!(batch.pixels instanceof Uint8Array) || batch.pixels.length !== batch.count * batch.dimension ** 2) {
    throw new Error('La salida del generador no coincide con las dimensiones de imagen.')
  }
}

/** Resumen de los píxeles generados; NO equivale a FID, IS ni prueba de realismo. */
export function summarizeGanGeneratedBatch(batch: GanGeneratedBatch): GanGenerationDiagnostics {
  validateGanGeneratedBatch(batch)
  const area = batch.dimension ** 2
  let sum = 0
  let minimumPixel = 255
  let maximumPixel = 0
  for (const pixel of batch.pixels) {
    sum += pixel
    minimumPixel = Math.min(minimumPixel, pixel)
    maximumPixel = Math.max(maximumPixel, pixel)
  }
  let distanceSum = 0
  let comparisons = 0
  for (let left = 0; left < batch.count; left++) {
    for (let right = left + 1; right < batch.count; right++) {
      for (let pixel = 0; pixel < area; pixel++) {
        distanceSum += Math.abs(batch.pixels[left * area + pixel] - batch.pixels[right * area + pixel])
      }
      comparisons += area
    }
  }
  return {
    meanIntensity: sum / batch.pixels.length,
    meanPairwiseDistance: comparisons ? distanceSum / comparisons : 0,
    minimumPixel,
    maximumPixel,
  }
}
