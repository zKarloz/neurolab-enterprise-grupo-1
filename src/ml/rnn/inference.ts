/** Preparación de una ventana futura: solo entradas; jamás lee la columna objetivo. */
import type { RawTable } from '../preprocessing/types.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'
import type { RnnPreparedData } from './trainingData.ts'

export interface RnnInferenceWindow { values: Float32Array; seriesId: string; fromTime: number; toTime: number }
export interface RnnInferenceResult {
  seriesId: string
  fromTime: number
  toTime: number
  problemType: 'regression' | 'binary' | 'multiclass'
  value: number | string
  probabilities?: { label: string; probability: number }[]
}
export function prepareRnnInferenceWindow(
  table: RawTable, options: RnnDatasetOptions, prepared: RnnPreparedData, seriesId: string,
): RnnInferenceWindow {
  const si = table.columns.indexOf(options.seriesColumn)
  const ti = table.columns.indexOf(options.timeColumn)
  const fi = options.features.map((name) => table.columns.indexOf(name))
  if (si < 0 || ti < 0 || fi.some((index) => index < 0)) throw new Error('Las columnas de inferencia han cambiado.')
  const records = table.rows.filter((row) => row[si].trim() === seriesId).map((row) => ({
    time: Number(row[ti]), features: fi.map((index) => Number(row[index])),
  })).sort((a, b) => a.time - b.time)
  if (records.length < options.steps) throw new Error(`La serie necesita ${options.steps} observaciones para predecir.`)
  const newest = records.slice(-options.steps)
  if (newest.some((item) => !Number.isFinite(item.time) || item.features.some((value) => !Number.isFinite(value)))) {
    throw new Error('La ventana contiene datos no numéricos.')
  }
  const values = new Float32Array(options.steps * fi.length)
  newest.forEach((row, step) => row.features.forEach((raw, feature) => {
    const normalized = (raw - prepared.normalization.means[feature]) / prepared.normalization.scales[feature]
    if (!Number.isFinite(normalized)) throw new Error('Normalización no finita en inferencia.')
    values[step * fi.length + feature] = normalized
  }))
  return { values, seriesId, fromTime: newest[0].time, toTime: newest[newest.length - 1].time }
}

export function decodeRnnInference(
  prepared: RnnPreparedData, window: RnnInferenceWindow, output: ArrayLike<number>,
): RnnInferenceResult {
  const { problemType } = prepared.shape
  const expected = problemType === 'multiclass' ? prepared.classNames.length : 1
  if (output.length !== expected || Array.from(output).some((v) => !Number.isFinite(v))) {
    throw new Error('Salida de predicción RNN inválida.')
  }
  if (problemType === 'regression') {
    return { seriesId: window.seriesId, fromTime: window.fromTime, toTime: window.toTime, problemType,
      value: output[0] * prepared.normalization.targetScale + prepared.normalization.targetMean }
  }
  const probabilities = problemType === 'binary'
    ? [{ label: prepared.classNames[0], probability: 1 - output[0] }, { label: prepared.classNames[1], probability: output[0] }]
    : prepared.classNames.map((label, i) => ({ label, probability: output[i] }))
  if (probabilities.some(({ probability }) => probability < -1e-5 || probability > 1 + 1e-5)) throw new Error('Probabilidades RNN fuera de rango.')
  const winner = probabilities.reduce((best, current) => current.probability > best.probability ? current : best)
  return { seriesId: window.seriesId, fromTime: window.fromTime, toTime: window.toTime, problemType,
    value: winner.label, probabilities }
}
