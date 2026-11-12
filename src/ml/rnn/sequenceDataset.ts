import type { RawTable } from '../preprocessing/types.ts'
import type { RnnProblemType } from './architecture.ts'

/** Contrato de entrada local. Ningún registro se transmite a Supabase en RNN-1. */
export interface RnnDatasetOptions {
  seriesColumn: string
  timeColumn: string
  targetColumn: string
  features: string[]
  steps: 4 | 8 | 16 | 32
  problemType: RnnProblemType
}

export interface RnnWindowPreview {
  seriesId: string
  fromTime: number
  toTime: number
  predictedTime: number
  target: string
  values: number[][]
}

export interface RnnDatasetSummary {
  rowCount: number
  seriesCount: number
  windowCount: number
  skippedShortSeries: number
  steps: number
  featureNames: string[]
  classes: string[]
  exampleWindows: RnnWindowPreview[]
}

const numberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/
const MAX_WINDOWS = 20_000

function finiteNumber(value: string, description: string): number {
  const normalized = value.trim()
  if (!numberPattern.test(normalized)) throw new Error(`${description}: se requiere un número decimal válido.`)
  const number = Number(normalized)
  if (!Number.isFinite(number)) throw new Error(`${description}: el valor no es finito.`)
  return number
}

/**
 * Solo analiza y obtiene tres vistas previas. La etiqueta pertenece al paso
 * siguiente al último dato de entrada, sin incluirla como predictor.
 * La partición temporal o por serie se implementará en RNN-2.
 */
export function describeSequenceDataset(table: RawTable, options: RnnDatasetOptions): RnnDatasetSummary {
  const { columns, rows } = table
  if (!rows.length) throw new Error('El CSV no contiene filas.')
  const special = [options.seriesColumn, options.timeColumn, options.targetColumn]
  if (special.some((name) => !columns.includes(name)) || new Set(special).size !== 3) {
    throw new Error('Serie, tiempo y objetivo deben ser columnas existentes y diferentes.')
  }
  if (![4, 8, 16, 32].includes(options.steps)) throw new Error('Longitud temporal fuera de rango (4, 8, 16 o 32).')
  if (!options.features.length || options.features.length > 16 || new Set(options.features).size !== options.features.length ||
      options.features.some((name) => !columns.includes(name) || special.includes(name))) {
    throw new Error('Selecciona entre 1 y 16 variables distintas, excluyendo serie, tiempo y objetivo.')
  }
  if (!['regression', 'binary', 'multiclass'].includes(options.problemType)) throw new Error('Tipo de problema no admitido.')
  if (rows.length > 50_000) throw new Error('El dataset supera las 50 000 filas admitidas.')

  const si = columns.indexOf(options.seriesColumn)
  const ti = columns.indexOf(options.timeColumn)
  const yi = columns.indexOf(options.targetColumn)
  const featureIndices = options.features.map((feature) => columns.indexOf(feature))
  type Observation = { time: number; values: number[]; target: string; sourceRow: number }
  const grouped = new Map<string, Observation[]>()
  rows.forEach((row, i) => {
    if (row.length !== columns.length) throw new Error(`Fila ${i + 2}: columnas incompatibles con la cabecera.`)
    const series = row[si]?.trim()
    if (!series) throw new Error(`Fila ${i + 2}: identificador de serie vacío.`)
    const time = finiteNumber(row[ti], `Fila ${i + 2}, tiempo`)
    const values = featureIndices.map((column) => finiteNumber(row[column], `Fila ${i + 2}, ${columns[column]}`))
    const target = row[yi]?.trim()
    if (!target) throw new Error(`Fila ${i + 2}: objetivo vacío.`)
    if (options.problemType === 'regression') finiteNumber(target, `Fila ${i + 2}, objetivo`)
    const observation = { time, values, target, sourceRow: i + 2 }
    const group = grouped.get(series) ?? []
    group.push(observation)
    grouped.set(series, group)
  })

  let windowCount = 0
  let skippedShortSeries = 0
  const exampleWindows: RnnWindowPreview[] = []
  const labels = new Set<string>()
  for (const [seriesId, sequence] of grouped) {
    // Orden independiente del orden físico de las filas del archivo.
    sequence.sort((a, b) => a.time - b.time)
    for (let j = 1; j < sequence.length; j += 1) {
      if (sequence[j - 1].time === sequence[j].time) {
        throw new Error(`Serie ${seriesId}: tiempo duplicado ${sequence[j].time} (fila ${sequence[j].sourceRow}).`)
      }
    }
    const count = Math.max(0, sequence.length - options.steps)
    if (!count) skippedShortSeries += 1
    windowCount += count
    if (windowCount > MAX_WINDOWS) throw new Error('Se superan las 20 000 ventanas permitidas. Reduce el CSV o amplía la longitud.')
    for (let start = 0; start < count; start += 1) {
      const predicted = sequence[start + options.steps]
      labels.add(predicted.target)
      if (exampleWindows.length < 3) {
        const window = sequence.slice(start, start + options.steps)
        exampleWindows.push({
          seriesId,
          fromTime: window[0].time,
          toTime: window[window.length - 1].time,
          predictedTime: predicted.time,
          target: predicted.target,
          values: window.map(({ values }) => [...values]),
        })
      }
    }
  }
  if (!windowCount) throw new Error(`No hay ventanas: cada serie requiere al menos ${options.steps + 1} registros ordenados.`)
  const classes = options.problemType === 'regression' ? [] : Array.from(labels).sort((a, b) => a.localeCompare(b, 'es'))
  if (options.problemType === 'binary' && classes.length !== 2) throw new Error('La clasificación binaria requiere exactamente dos clases en las etiquetas futuras.')
  if (options.problemType === 'multiclass' && (classes.length < 3 || classes.length > 10)) throw new Error('La multiclase requiere entre 3 y 10 etiquetas diferentes.')

  return {
    rowCount: rows.length,
    seriesCount: grouped.size,
    windowCount,
    skippedShortSeries,
    steps: options.steps,
    featureNames: [...options.features],
    classes,
    exampleWindows,
  }
}
