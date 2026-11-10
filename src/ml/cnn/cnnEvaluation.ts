/**
 * Métricas de clasificación multiclase y partición 70/15/15 reproducible.
 * Las funciones no dependen de TensorFlow y nunca mezclan test con entrenamiento.
 */
export interface CnnClassMetrics {
  label: string
  support: number
  precision: number
  recall: number
  f1: number
}

export interface CnnTestSample {
  /** Índice original dentro de la muestra local seleccionada. */
  index: number
  actual: number
  predicted: number
  confidence: number
  pixels: Uint8Array
  probabilities: number[]
}

export interface CnnEvaluation {
  classNames: string[]
  sampleCount: number
  loss: number
  accuracy: number
  macroPrecision: number
  macroRecall: number
  macroF1: number
  /** Matriz[clase real][clase predicha]. */
  matrix: number[][]
  classes: CnnClassMetrics[]
  examples: CnnTestSample[]
}

function seededShuffle(items: number[], random: () => number) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

/**
 * Estratifica los ejemplos por clase: aproximadamente 70 % train,
 * 15 % validación y 15 % test. Cada clase debe aparecer en train y test.
 * Una clase con solo dos elementos no puede tener los tres subconjuntos.
 */
export function splitCnnHoldoutIndices(labels: Uint8Array, classes: number, seed = 42) {
  if (!Number.isInteger(classes) || classes < 2 || classes > 10 || !Number.isInteger(seed)) {
    throw new Error('Cantidad de clases o semilla inválidas.')
  }
  let state = (seed >>> 0) || 1
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return (state >>> 0) / 4294967296
  }
  const train: number[] = []
  const validation: number[] = []
  const test: number[] = []
  for (let label = 0; label < classes; label++) {
    const group: number[] = []
    labels.forEach((value, index) => {
      if (value >= classes) throw new Error(`Etiqueta fuera de rango en fila ${index + 1}.`)
      if (value === label) group.push(index)
    })
    if (group.length < 2) throw new Error(`La clase ${label} necesita al menos dos imágenes.`)
    seededShuffle(group, random)
    const testCount = Math.max(1, Math.floor(group.length * 0.15))
    const validationCount = group.length >= 3 ? Math.max(1, Math.floor(group.length * 0.15)) : 0
    test.push(...group.slice(0, testCount))
    validation.push(...group.slice(testCount, testCount + validationCount))
    train.push(...group.slice(testCount + validationCount))
  }
  if (!train.length || !validation.length || !test.length) {
    throw new Error('No hay suficientes ejemplos por clase para separar entrenamiento, validación y test.')
  }
  seededShuffle(train, random)
  seededShuffle(validation, random)
  seededShuffle(test, random)
  return { train, validation, test }
}

/**
 * Cálculo sobre probabilidades reales de softmax, sin puntuaciones simuladas.
 * Cuando precision/recall no están definidas por división entre cero, usa 0.
 */
export function computeCnnEvaluation(labels: string[], actual: number[], probabilityRows: number[][]) {
  if (labels.length < 2 || labels.length > 10 || actual.length === 0 || actual.length !== probabilityRows.length) {
    throw new Error('Predicciones o clases incompatibles con el conjunto de test.')
  }
  const size = labels.length
  const matrix = Array.from({ length: size }, () => Array<number>(size).fill(0))
  let hits = 0
  let loss = 0
  const predictions: { predicted: number; confidence: number }[] = []
  actual.forEach((real, index) => {
    const row = probabilityRows[index]
    if (!Number.isInteger(real) || real < 0 || real >= size || row.length !== size || row.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) {
      throw new Error(`Resultado de inferencia inválido en muestra ${index + 1}.`)
    }
    if (Math.abs(row.reduce((sum, n) => sum + n, 0) - 1) > 0.02) throw new Error('Softmax devolvió probabilidades incoherentes.')
    let predicted = 0
    row.forEach((value, i) => { if (value > row[predicted]) predicted = i })
    if (real === predicted) hits++
    matrix[real][predicted]++
    loss -= Math.log(Math.max(1e-7, row[real]))
    predictions.push({ predicted, confidence: row[predicted] })
  })
  const classes = labels.map((label, index) => {
    const tp = matrix[index][index]
    const support = matrix[index].reduce((sum, n) => sum + n, 0)
    const predictedAs = matrix.reduce((sum, row) => sum + row[index], 0)
    const precision = predictedAs ? tp / predictedAs : 0
    const recall = support ? tp / support : 0
    return { label, support, precision, recall, f1: (precision + recall) ? 2 * precision * recall / (precision + recall) : 0 }
  })
  const mean = (key: 'precision' | 'recall' | 'f1') => classes.reduce((sum, m) => sum + m[key], 0) / size
  return {
    matrix, classes, predictions,
    sampleCount: actual.length, loss: loss / actual.length, accuracy: hits / actual.length,
    macroPrecision: mean('precision'), macroRecall: mean('recall'), macroF1: mean('f1'),
  }
}
