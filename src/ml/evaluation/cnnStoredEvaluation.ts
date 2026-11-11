/** Lectura estricta de métricas CNN agregadas; jamás reconstruye imágenes de test. */
export interface CnnStoredEvaluation {
  problemType: 'multiclass'
  classNames: string[]
  sampleCount: number
  loss: number
  accuracy: number
  macroPrecision: number
  macroRecall: number
  macroF1: number
  matrix: number[][]
}

export interface CnnStoredClass {
  label: string
  support: number
  precision: number
  recall: number
  f1: number
}

export function parseCnnStoredEvaluation(input: unknown): CnnStoredEvaluation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Evaluación CNN almacenada inválida.')
  const data = input as Record<string, unknown>
  const names = data.classNames
  if (data.problemType !== 'multiclass' || !Array.isArray(names) || names.length < 2 || names.length > 10 ||
    !names.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100) ||
    new Set(names).size !== names.length) throw new Error('Clases de evaluación CNN incompatibles.')
  const size = names.length
  const sampleCount = data.sampleCount
  const matrix = data.matrix
  if (typeof sampleCount !== 'number' || !Number.isSafeInteger(sampleCount) || sampleCount < 1 ||
    !Array.isArray(matrix) || matrix.length !== size ||
    !matrix.every((row) => Array.isArray(row) && row.length === size && row.every((cell) => Number.isSafeInteger(cell) && cell >= 0)) ||
    matrix.flat().reduce((sum: number, cell: number) => sum + cell, 0) !== sampleCount) {
    throw new Error('La matriz de confusión CNN no coincide con el tamaño de test.')
  }
  for (const name of ['loss', 'accuracy', 'macroPrecision', 'macroRecall', 'macroF1'] as const) {
    const value = data[name]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (name !== 'loss' && value > 1)) {
      throw new Error(`Métrica CNN guardada inválida: ${name}.`)
    }
  }
  return data as unknown as CnnStoredEvaluation
}

/** Recupera precisión/recall/F1 por clase únicamente a partir de la matriz persistida. */
export function cnnStoredClassMetrics(evaluation: CnnStoredEvaluation): CnnStoredClass[] {
  return evaluation.classNames.map((label, index) => {
    const tp = evaluation.matrix[index][index]
    const support = evaluation.matrix[index].reduce((sum, n) => sum + n, 0)
    const predicted = evaluation.matrix.reduce((sum, row) => sum + row[index], 0)
    const precision = predicted ? tp / predicted : 0
    const recall = support ? tp / support : 0
    return { label, support, precision, recall, f1: precision + recall ? 2 * precision * recall / (precision + recall) : 0 }
  })
}
