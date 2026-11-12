/** RNN-4C: manifiesto y preprocesamiento puro para modelos secuenciales privados. */
import type { RnnProblemType } from './architecture.ts'

export interface RnnPreprocessingManifest {
  family: 'rnn'
  kind: 'rnn_temporal_csv_v1'
  seriesColumn: string
  timeColumn: string
  targetColumn: string
  features: string[]
  steps: 4 | 8 | 16 | 32
  problemType: RnnProblemType
  classNames: string[]
  normalization: { means: number[]; scales: number[]; targetMean: number; targetScale: number }
  split: { strategy: 'per_series_chronological_purged_v1'; trainCount: number; validationCount: number; testCount: number }
}

export interface RnnRestoredPrediction {
  problemType: RnnProblemType
  value: number | string
  probabilities?: { label: string; probability: number }[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function validColumn(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 128
}
function finiteList(value: unknown, length: number, positive = false): value is number[] {
  return Array.isArray(value) && value.length === length && value.every((n) => typeof n === 'number' &&
    Number.isFinite(n) && (!positive || n > 0))
}

/** Nunca se crean tensores con metadatos manipulados o de una familia diferente. */
export function parseRnnPreprocessingManifest(value: unknown): RnnPreprocessingManifest {
  const manifest = record(value)
  const normalizer = record(manifest?.normalization)
  const split = record(manifest?.split)
  const features = manifest?.features
  const classNames = manifest?.classNames
  const problemType = manifest?.problemType
  const steps = manifest?.steps
  if (!manifest || manifest.family !== 'rnn' || manifest.kind !== 'rnn_temporal_csv_v1' ||
    !validColumn(manifest.seriesColumn) || !validColumn(manifest.timeColumn) || !validColumn(manifest.targetColumn) ||
    new Set([manifest.seriesColumn, manifest.timeColumn, manifest.targetColumn]).size !== 3 ||
    !Array.isArray(features) || features.length < 1 || features.length > 16 || !features.every(validColumn) ||
    new Set(features).size !== features.length ||
    features.some((name) => [manifest.seriesColumn, manifest.timeColumn, manifest.targetColumn].includes(name)) ||
    ![4, 8, 16, 32].includes(steps as number) ||
    !['regression', 'binary', 'multiclass'].includes(problemType as string) ||
    !Array.isArray(classNames) || classNames.some((name) => !validColumn(name)) ||
    new Set(classNames).size !== classNames.length ||
    (problemType === 'regression' && classNames.length !== 0) ||
    (problemType === 'binary' && classNames.length !== 2) ||
    (problemType === 'multiclass' && (classNames.length < 3 || classNames.length > 10)) ||
    !normalizer || !finiteList(normalizer.means, features.length) ||
    !finiteList(normalizer.scales, features.length, true) ||
    typeof normalizer.targetMean !== 'number' || !Number.isFinite(normalizer.targetMean) ||
    typeof normalizer.targetScale !== 'number' || !Number.isFinite(normalizer.targetScale) || normalizer.targetScale <= 0 ||
    !split || split.strategy !== 'per_series_chronological_purged_v1' ||
    ![split.trainCount, split.validationCount, split.testCount].every((n) => Number.isSafeInteger(n) && (n as number) > 0)) {
    throw new Error('Manifiesto de preprocesamiento RNN incompatible o incompleto.')
  }
  return value as RnnPreprocessingManifest
}

export function isRnnManifest(value: unknown): value is RnnPreprocessingManifest {
  return record(value)?.family === 'rnn'
}

/** Entrada CSV manual: exactamente una fila por paso, variables en el orden guardado. */
export function parseRnnManualWindow(text: string, manifest: RnnPreprocessingManifest): number[][] {
  if (text.length > 32_768) throw new Error('La ventana supera el tamaño permitido.')
  const lines = text.trim().split(/\r?\n/)
  if (lines.length !== manifest.steps) throw new Error(`Se requieren exactamente ${manifest.steps} filas temporales.`)
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
  return lines.map((line, row) => {
    const columns = line.split(',').map((part) => part.trim())
    if (columns.length !== manifest.features.length) throw new Error(`Fila ${row + 1}: se requieren ${manifest.features.length} variables.`)
    return columns.map((entry, column) => {
      if (!numeric.test(entry)) throw new Error(`Fila ${row + 1}, ${manifest.features[column]}: escribe un número válido.`)
      const value = Number(entry)
      if (!Number.isFinite(value)) throw new Error(`Fila ${row + 1}: valor no finito.`)
      return value
    })
  })
}

/** Estandariza una ventana nueva usando SOLO las estadísticas de train guardadas. */
export function normalizeRnnRestoredWindow(window: number[][], manifest: RnnPreprocessingManifest): Float32Array {
  if (window.length !== manifest.steps) throw new Error('Longitud de ventana temporal incompatible.')
  const result = new Float32Array(manifest.steps * manifest.features.length)
  window.forEach((row, step) => {
    if (!Array.isArray(row) || row.length !== manifest.features.length) throw new Error(`Fila ${step + 1}: dimensiones inválidas.`)
    row.forEach((value, feature) => {
      if (!Number.isFinite(value)) throw new Error('La ventana contiene valores no finitos.')
      const normalized = (value - manifest.normalization.means[feature]) / manifest.normalization.scales[feature]
      if (!Number.isFinite(normalized) || Math.abs(normalized) > 1e30) throw new Error('El escalado RNN produjo valores inválidos.')
      result[step * manifest.features.length + feature] = normalized
    })
  })
  return result
}

/** Decodifica la predicción en escala original o probabilidad, sin CSV original. */
export function decodeRnnRestoredOutput(output: ArrayLike<number>, manifest: RnnPreprocessingManifest): RnnRestoredPrediction {
  const expected = manifest.problemType === 'multiclass' ? manifest.classNames.length : 1
  const values = Array.from(output)
  if (values.length !== expected || values.some((n) => !Number.isFinite(n))) throw new Error('Salida RNN incompatible con la versión.')
  if (manifest.problemType === 'regression') {
    const decoded = values[0] * manifest.normalization.targetScale + manifest.normalization.targetMean
    if (!Number.isFinite(decoded)) throw new Error('Predicción RNN fuera de rango.')
    return { problemType: 'regression', value: decoded }
  }
  const probabilities = manifest.problemType === 'binary'
    ? [{ label: manifest.classNames[0], probability: 1 - values[0] }, { label: manifest.classNames[1], probability: values[0] }]
    : manifest.classNames.map((label, index) => ({ label, probability: values[index] }))
  if (probabilities.some(({ probability }) => probability < -1e-5 || probability > 1 + 1e-5)) throw new Error('Probabilidades RNN fuera de rango.')
  const total = probabilities.reduce((sum, item) => sum + item.probability, 0)
  if (Math.abs(total - 1) > 1e-3) throw new Error('La suma de probabilidades no es válida.')
  const winner = probabilities.reduce((best, item) => item.probability > best.probability ? item : best)
  return { problemType: manifest.problemType, value: winner.label, probabilities }
}

