import { transformRow } from '../preprocessing/prepare.ts'
import type { PreparationManifest } from '../preprocessing/types.ts'

/** Reutiliza estrictamente las estadísticas y vocabularios ajustados solo con train. */
export function preparePredictionInput(values: Record<string, string>, manifest: PreparationManifest): number[] {
  const columns = manifest.transformers.map((transformer) => transformer.column)
  const row = columns.map((column) => values[column] ?? '')
  return transformRow(row, columns, manifest)
}

export type PredictionView =
  | { problemType: 'binary'; label: string; probabilityPositive: number; threshold: number }
  | { problemType: 'regression'; value: number }

/** No convierte una salida de regresión en una clasificación ni redondea el resultado numérico. */
export function interpretPrediction(value: number, manifest: PreparationManifest): PredictionView {
  if (!Number.isFinite(value)) throw new Error('La predicción no es finita.')
  if (manifest.problemType === 'regression') return { problemType: 'regression', value }
  if (!manifest.targetLabels || value < 0 || value > 1) {
    throw new Error('La salida binaria no es una probabilidad válida.')
  }
  const threshold = 0.5
  return {
    problemType: 'binary',
    label: manifest.targetLabels[value >= threshold ? 1 : 0],
    probabilityPositive: value,
    threshold,
  }
}
