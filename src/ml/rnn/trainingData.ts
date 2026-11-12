/** RNN-2: ventanas supervisadas, partición causal y normalizadores exclusivos de train. */
import type { RawTable } from '../preprocessing/types.ts'
import type { RnnProblemType } from './architecture.ts'
import { describeSequenceDataset, type RnnDatasetOptions } from './sequenceDataset.ts'

export const RNN_MAX_TRAIN_WINDOWS = 2_000

export interface RnnPartition {
  count: number
  /** Secuencias [muestra, paso, variable], en orden row-major. */
  x: Float32Array
  /** Objetivos [muestra, salida], codificados para TensorFlow.js. */
  y: Float32Array
  targets: { seriesId: string; startTime: number; targetTime: number }[]
}
export interface RnnPreparedData {
  shape: { steps: number; features: number; classes: number; problemType: RnnProblemType }
  classNames: string[]
  normalization: { means: number[]; scales: number[]; targetMean: number; targetScale: number }
  train: RnnPartition
  validation: RnnPartition
  /** Reservado: NUNCA pasa a model.fit ni a validationData. */
  test: RnnPartition
}

type Observation = { time: number; features: number[]; target: string }
type Window = { seriesId: string; startTime: number; targetTime: number; values: number[][]; label: string }

/** División con purga de `steps` ventanas entre particiones.
 * Así ninguna observación original (ni entrada ni objetivo) aparece en dos
 * particiones. Se sacrifica parte de los datos para evitar fuga por solapamiento.
 */
export function splitRnnWindowCounts(count: number, steps: number) {
  const usable = count - 2 * steps
  if (!Number.isInteger(count) || !Number.isInteger(steps) || steps < 1 || usable < 3) {
    throw new Error('Se necesitan más observaciones para tres particiones con separación temporal.')
  }
  const train = Math.max(1, Math.min(usable - 2, Math.floor(usable * 0.7)))
  const validation = Math.max(1, Math.min(usable - train - 1, Math.floor(usable * 0.15)))
  return { train, validation, test: usable - train - validation, purged: 2 * steps }
}

export function prepareRnnTrainingData(table: RawTable, options: RnnDatasetOptions): RnnPreparedData {
  const summary = describeSequenceDataset(table, options)
  if (summary.windowCount > RNN_MAX_TRAIN_WINDOWS) {
    throw new Error(`RNN-2 admite hasta ${RNN_MAX_TRAIN_WINDOWS} ventanas. Reduce filas o aumenta la longitud temporal.`)
  }
  const seriesIndex = table.columns.indexOf(options.seriesColumn)
  const timeIndex = table.columns.indexOf(options.timeColumn)
  const targetIndex = table.columns.indexOf(options.targetColumn)
  const featureIndexes = options.features.map((name) => table.columns.indexOf(name))
  const grouped = new Map<string, Observation[]>()
  for (const row of table.rows) {
    const seriesId = row[seriesIndex].trim()
    const group = grouped.get(seriesId) ?? []
    group.push({ time: Number(row[timeIndex]), features: featureIndexes.map((i) => Number(row[i])), target: row[targetIndex].trim() })
    grouped.set(seriesId, group)
  }
  const partitions: { train: Window[]; validation: Window[]; test: Window[] } = { train: [], validation: [], test: [] }
  for (const [seriesId, observations] of grouped) {
    observations.sort((a, b) => a.time - b.time)
    const count = observations.length - options.steps
    if (count < 2 * options.steps + 3) continue // La serie se visualiza, pero no admite tres particiones purgadas.
    const sizes = splitRnnWindowCounts(count, options.steps)
    for (let start = 0; start < count; start++) {
      const observation = observations[start + options.steps]
      const item: Window = {
        seriesId, startTime: observations[start].time, targetTime: observation.time, label: observation.target,
        values: observations.slice(start, start + options.steps).map(({ features }) => features),
      }
      if (start < sizes.train) partitions.train.push(item)
      else if (start >= sizes.train + options.steps && start < sizes.train + options.steps + sizes.validation) partitions.validation.push(item)
      else if (start >= sizes.train + options.steps + sizes.validation + options.steps) partitions.test.push(item)
      // Las ventanas entre regiones se purgan deliberadamente.

    }
  }
  if (partitions.train.length < 4 || !partitions.validation.length || !partitions.test.length) {
    throw new Error('No hay suficientes ventanas separadas temporalmente para train/validación/test. Cada serie necesita al menos 3 × pasos + 3 observaciones; amplía el CSV o usa cuatro pasos.')
  }

  // Evitar ajustes de escala con datos de validación o test.
  const features = options.features.length
  const means = Array(features).fill(0) as number[]
  const scales = Array(features).fill(0) as number[]
  const trainObservations = partitions.train.length * options.steps
  for (const window of partitions.train) for (const row of window.values) row.forEach((value, i) => { means[i] += value })
  means.forEach((value, i) => { means[i] = value / trainObservations })
  for (const window of partitions.train) for (const row of window.values) row.forEach((value, i) => { scales[i] += (value - means[i]) ** 2 })
  scales.forEach((value, i) => { scales[i] = Math.max(1e-6, Math.sqrt(value / trainObservations)) })

  const problemType = options.problemType
  // Las etiquetas deben haber aparecido durante train. No aprender clases a partir de test.
  const classNames = problemType === 'regression'
    ? [] : Array.from(new Set(partitions.train.map((window) => window.label))).sort((a, b) => a.localeCompare(b, 'es'))
  if (problemType === 'binary' && classNames.length !== 2 || problemType === 'multiclass' && (classNames.length < 3 || classNames.length > 10)) {
    throw new Error('El conjunto cronológico de entrenamiento no contiene todas las clases necesarias.')
  }
  if (problemType !== 'regression' && summary.classes.some((label) => !classNames.includes(label))) {
    throw new Error('Validación/test contiene una clase ausente del entrenamiento; no es válido ajustar el modelo con esa etiqueta futura.')
  }
  const outputCount = problemType === 'multiclass' ? classNames.length : 1
  const rawTrainTargets = partitions.train.map((window) => Number(window.label))
  const targetMean = problemType === 'regression' ? rawTrainTargets.reduce((a, b) => a + b, 0) / rawTrainTargets.length : 0
  const targetScale = problemType === 'regression'
    ? Math.max(1e-6, Math.sqrt(rawTrainTargets.reduce((a, b) => a + (b - targetMean) ** 2, 0) / rawTrainTargets.length)) : 1
  const makePartition = (windows: Window[]): RnnPartition => {
    const x = new Float32Array(windows.length * options.steps * features)
    const y = new Float32Array(windows.length * outputCount)
    windows.forEach((window, sample) => {
      for (let step = 0; step < options.steps; step++) {
        for (let feature = 0; feature < features; feature++) {
          const value = (window.values[step][feature] - means[feature]) / scales[feature]
          if (!Number.isFinite(value)) throw new Error('El normalizador generó un valor no finito.')
          x[sample * options.steps * features + step * features + feature] = value
        }
      }
      if (problemType === 'regression') y[sample] = (Number(window.label) - targetMean) / targetScale
      else {
        const classIndex = classNames.indexOf(window.label)
        if (classIndex < 0) throw new Error('La etiqueta futura no existe en el conjunto de entrenamiento.')
        if (problemType === 'binary') y[sample] = classIndex
        else y[sample * outputCount + classIndex] = 1
      }
    })
    return { count: windows.length, x, y, targets: windows.map(({ seriesId, startTime, targetTime }) => ({ seriesId, startTime, targetTime })) }
  }
  return {
    shape: { steps: options.steps, features, classes: problemType === 'regression' ? 1 : classNames.length, problemType },
    classNames, normalization: { means, scales, targetMean, targetScale },
    train: makePartition(partitions.train), validation: makePartition(partitions.validation), test: makePartition(partitions.test),
  }
}
