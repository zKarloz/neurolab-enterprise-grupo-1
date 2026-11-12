/**
 * RNN-4D: las RPC guardan solo métricas agregadas del test temporal.
 * No se leen ni reconstruyen ventanas, identificadores de serie o predicciones individuales.
 */
export type RnnStoredRegression = {
  family: 'rnn'; problemType: 'regression'; sampleCount: number
  mse: number; rmse: number; mae: number; r2: number | null
}
export type RnnStoredClassification = {
  family: 'rnn'; problemType: 'binary' | 'multiclass'; sampleCount: number
  classNames: string[]; accuracy: number; macroPrecision: number
  macroRecall: number; macroF1: number; matrix: number[][]
}
export type RnnStoredEvaluation = RnnStoredRegression | RnnStoredClassification

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Evaluación RNN almacenada inválida.')
  }
  return value as Record<string, unknown>
}
function finite(value: unknown, key: string, min = -Infinity, max = Infinity): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Métrica RNN almacenada inválida: ${key}.`)
  }
  return value
}

export function isRnnStoredEvaluation(value: unknown): value is RnnStoredEvaluation {
  return Boolean(value && typeof value === 'object' && 'family' in value && value.family === 'rnn')
}

export function parseRnnStoredEvaluation(value: unknown): RnnStoredEvaluation {
  const data = record(value)
  if (data.family !== 'rnn') throw new Error('La evaluación almacenada no corresponde a RNN.')
  const count = data.sampleCount
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    throw new Error('Cantidad de test temporal inválida.')
  }
  // La UI de historial nunca consume contenido individual; rechaza formatos accidentales.
  if (['examples', 'rows', 'seriesId', 'targets', 'predictions', 'pixels'].some((key) => key in data)) {
    throw new Error('La evaluación RNN almacenada contiene datos individuales no permitidos.')
  }
  if (data.problemType === 'regression') {
    const mse = finite(data.mse, 'mse', 0)
    const rmse = finite(data.rmse, 'rmse', 0)
    const mae = finite(data.mae, 'mae', 0)
    if (Math.abs(rmse ** 2 - mse) > Math.max(1e-5, mse * 1e-5)) {
      throw new Error('RMSE RNN no concuerda con MSE.')
    }
    const r2 = data.r2 === null ? null : finite(data.r2, 'r2', -Infinity, 1)
    return { family: 'rnn', problemType: 'regression', sampleCount: count, mse, rmse, mae, r2 }
  }
  if (data.problemType !== 'binary' && data.problemType !== 'multiclass') {
    throw new Error('Tipo de problema RNN no reconocido.')
  }
  const names = data.classNames
  const size = data.problemType === 'binary' ? 2 : null
  if (!Array.isArray(names) || (size !== null ? names.length !== size : names.length < 3 || names.length > 10) ||
      !names.every((name) => typeof name === 'string' && name.trim().length > 0 && name.length <= 100) ||
      new Set(names).size !== names.length) {
    throw new Error('Clases de evaluación RNN incompatibles.')
  }
  const matrix = data.matrix
  if (!Array.isArray(matrix) || matrix.length !== names.length ||
      !matrix.every((row) => Array.isArray(row) && row.length === names.length &&
        row.every((cell) => Number.isSafeInteger(cell) && cell >= 0)) ||
      matrix.flat().reduce((sum: number, cell: number) => sum + cell, 0) !== count) {
    throw new Error('La matriz RNN no corresponde al test agregado.')
  }
  const accuracy = finite(data.accuracy, 'accuracy', 0, 1)
  const macroPrecision = finite(data.macroPrecision, 'macroPrecision', 0, 1)
  const macroRecall = finite(data.macroRecall, 'macroRecall', 0, 1)
  const macroF1 = finite(data.macroF1, 'macroF1', 0, 1)
  const diagonal = matrix.reduce((total: number, row: number[], index: number) => total + row[index], 0)
  if (Math.abs(accuracy - diagonal / count) > 1e-6) {
    throw new Error('Accuracy RNN no concuerda con la matriz de confusión.')
  }
  return { family: 'rnn', problemType: data.problemType, sampleCount: count,
    classNames: [...names], accuracy, macroPrecision, macroRecall, macroF1,
    matrix: matrix.map((row: number[]) => [...row]) }
}
