/** Cálculo puro y comprobable de métricas del conjunto de prueba; no ajusta el modelo. */
export type BinaryTestEvaluation = {
  problemType: 'binary'
  samples: number
  loss: number
  accuracy: number
  precision: number
  recall: number
  f1: number
  threshold: number
  confusion: { tp: number; tn: number; fp: number; fn: number }
}

export type RegressionTestEvaluation = {
  problemType: 'regression'
  samples: number
  mse: number
  rmse: number
  mae: number
  r2: number | null
}

export type TestEvaluation = BinaryTestEvaluation | RegressionTestEvaluation

function validatePairs(actual: readonly number[], predicted: readonly number[]): void {
  if (actual.length === 0 || actual.length !== predicted.length) {
    throw new Error('La evaluación requiere predicciones y objetivos del mismo tamaño no vacío.')
  }
  if (actual.some((value) => !Number.isFinite(value)) || predicted.some((value) => !Number.isFinite(value))) {
    throw new Error('La evaluación contiene valores no finitos.')
  }
}

/** Se utiliza 0.5 como umbral fijo; test jamás selecciona el umbral ni reajusta parámetros. */
export function evaluateBinary(actual: readonly number[], probabilities: readonly number[], threshold = 0.5): BinaryTestEvaluation {
  validatePairs(actual, probabilities)
  if (!(threshold > 0 && threshold < 1)) throw new Error('Umbral de clasificación inválido.')
  if (actual.some((label) => label !== 0 && label !== 1)) throw new Error('Las etiquetas binarias deben ser 0 o 1.')
  if (probabilities.some((value) => value < 0 || value > 1)) throw new Error('Las predicciones binarias deben ser probabilidades entre 0 y 1.')

  const confusion = { tp: 0, tn: 0, fp: 0, fn: 0 }
  let loss = 0
  const epsilon = 1e-7
  actual.forEach((target, index) => {
    const probability = probabilities[index]
    const predicted = probability >= threshold ? 1 : 0
    if (target === 1 && predicted === 1) confusion.tp++
    else if (target === 0 && predicted === 0) confusion.tn++
    else if (target === 0) confusion.fp++
    else confusion.fn++
    const p = Math.max(epsilon, Math.min(1 - epsilon, probability))
    loss -= target * Math.log(p) + (1 - target) * Math.log(1 - p)
  })
  const samples = actual.length
  const precision = confusion.tp + confusion.fp > 0 ? confusion.tp / (confusion.tp + confusion.fp) : 0
  const recall = confusion.tp + confusion.fn > 0 ? confusion.tp / (confusion.tp + confusion.fn) : 0
  return {
    problemType: 'binary', samples, loss: loss / samples,
    accuracy: (confusion.tp + confusion.tn) / samples, precision, recall,
    f1: precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0,
    threshold, confusion,
  }
}

/** R² es indefinido cuando la variable objetivo del test no tiene variación. */
export function evaluateRegression(actual: readonly number[], predicted: readonly number[]): RegressionTestEvaluation {
  validatePairs(actual, predicted)
  const samples = actual.length
  const mean = actual.reduce((sum, value) => sum + value, 0) / samples
  let sumSquaredError = 0
  let sumAbsoluteError = 0
  let sumSquaredTotal = 0
  actual.forEach((target, index) => {
    const difference = predicted[index] - target
    sumSquaredError += difference ** 2
    sumAbsoluteError += Math.abs(difference)
    sumSquaredTotal += (target - mean) ** 2
  })
  const mse = sumSquaredError / samples
  const mae = sumAbsoluteError / samples
  const r2 = sumSquaredTotal > 0 ? 1 - sumSquaredError / sumSquaredTotal : null
  if (![mse, mae, r2].filter((v) => v !== null).every(Number.isFinite)) {
    throw new Error('La evaluación produjo una métrica no finita.')
  }
  return { problemType: 'regression', samples, mse, rmse: Math.sqrt(mse), mae, r2 }
}
