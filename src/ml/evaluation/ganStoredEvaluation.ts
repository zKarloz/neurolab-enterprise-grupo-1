/** GAN-4D: reconstituye SOLO el resumen descriptivo guardado en Supabase.
 * No es FID, accuracy ni una evaluación de realismo o rendimiento en test.
 */
import type { GanEpochMetrics } from '../gan/trainingTypes.ts'

export interface GanStoredEvaluation {
  family: 'gan'
  kind: 'descriptive_only'
  sampleCount: 4 | 8 | 16
  dimension: 8 | 28
  meanIntensity: number
  meanPairwiseDistance: number
  minimumPixel: number
  maximumPixel: number
}

export type GanMetricRow = { epoch: number; split: string; metric_name: string; metric_value: number }

const METRICS = ['generator_loss', 'discriminator_loss', 'd_real', 'd_fake'] as const
const FIELDS = ['family', 'kind', 'sampleCount', 'dimension', 'meanIntensity',
  'meanPairwiseDistance', 'minimumPixel', 'maximumPixel'] as const

/** Reconoce el formato GAN sin confundirlo con evaluaciones supervisadas. */
export function isGanStoredEvaluation(value: unknown): value is GanStoredEvaluation {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && 'family' in value && value.family === 'gan')
}

function finite(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Resumen GAN inválido: ${label}.`)
  }
  return value
}

/** Acepta el contrato exacto de la RPC 016 y rechaza campos con píxeles individuales. */
export function parseGanStoredEvaluation(value: unknown): GanStoredEvaluation {
  if (!isGanStoredEvaluation(value)) throw new Error('La evaluación no es un resumen GAN.')
  const item = value as unknown as Record<string, unknown>
  if (item.kind !== 'descriptive_only' || Object.keys(item).some((key) => !FIELDS.includes(key as typeof FIELDS[number]))) {
    throw new Error('Resumen GAN con formato o campos no permitidos.')
  }
  if (item.sampleCount !== 4 && item.sampleCount !== 8 && item.sampleCount !== 16) {
    throw new Error('Cantidad de imágenes del resumen GAN inválida.')
  }
  if (item.dimension !== 8 && item.dimension !== 28) throw new Error('Dimensión GAN inválida.')
  const meanIntensity = finite(item.meanIntensity, 'meanIntensity', 0, 255)
  const meanPairwiseDistance = finite(item.meanPairwiseDistance, 'meanPairwiseDistance', 0, 255)
  const minimumPixel = finite(item.minimumPixel, 'minimumPixel', 0, 255)
  const maximumPixel = finite(item.maximumPixel, 'maximumPixel', 0, 255)
  if (!Number.isInteger(minimumPixel) || !Number.isInteger(maximumPixel)
    || minimumPixel > maximumPixel || meanIntensity < minimumPixel || meanIntensity > maximumPixel) {
    throw new Error('El rango de píxeles GAN no concuerda con el brillo medio.')
  }
  return {
    family: 'gan', kind: 'descriptive_only', sampleCount: item.sampleCount,
    dimension: item.dimension, meanIntensity, meanPairwiseDistance, minimumPixel, maximumPixel,
  }
}

/** Exige las cuatro métricas reales de cada época, sin inventar ceros ni interpolar.
 * Las cuatro están guardadas como split=train, con los nombres de la migración 016.
 */
export function assembleGanHistoryEpochs(rows: GanMetricRow[]): GanEpochMetrics[] {
  const epochs = new Map<number, Map<string, number>>()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.epoch) || row.epoch < 1 || row.epoch > 100 || row.split !== 'train'
      || !METRICS.includes(row.metric_name as typeof METRICS[number]) || !Number.isFinite(row.metric_value)) {
      throw new Error('Métrica GAN histórica desconocida o inválida.')
    }
    const values = epochs.get(row.epoch) ?? new Map<string, number>()
    if (values.has(row.metric_name)) throw new Error('Métrica GAN histórica duplicada.')
    values.set(row.metric_name, row.metric_value)
    epochs.set(row.epoch, values)
  }
  const ordered = [...epochs.entries()].sort(([a], [b]) => a - b)
  return ordered.map(([epoch, values], index) => {
    if (epoch !== index + 1 || METRICS.some((name) => !values.has(name))) {
      throw new Error('El historial GAN contiene épocas incompletas o discontinuas.')
    }
    const generatorLoss = values.get('generator_loss')!
    const discriminatorLoss = values.get('discriminator_loss')!
    const realScore = values.get('d_real')!
    const fakeScore = values.get('d_fake')!
    if (generatorLoss < 0 || discriminatorLoss < 0 || realScore < 0 || realScore > 1 || fakeScore < 0 || fakeScore > 1) {
      throw new Error('Métricas adversariales fuera de rango.')
    }
    return { epoch, generatorLoss, discriminatorLoss, realScore, fakeScore }
  })
}

/** Una etiqueta común y coherente para pantalla, CSV y PDF. */
export function formatGanReportSummary(raw: unknown): string {
  if (raw === null || raw === undefined) return 'Sin resumen descriptivo'
  try {
    const item = parseGanStoredEvaluation(raw)
    return `Descriptivo: ${item.sampleCount} imágenes ${item.dimension}×${item.dimension} · brillo ${item.meanIntensity.toFixed(2)} · distancia ${item.meanPairwiseDistance.toFixed(2)}`
  } catch {
    return 'Resumen GAN inválido'
  }
}

/** Columnas opcionales GAN del CSV, vacías para otras familias. */
export function ganReportColumns(raw: unknown): Array<number | ''> {
  try {
    const item = parseGanStoredEvaluation(raw)
    return [item.sampleCount, item.dimension, item.meanIntensity, item.meanPairwiseDistance, item.minimumPixel, item.maximumPixel]
  } catch {
    return ['', '', '', '', '', '']
  }
}
