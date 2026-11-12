/** Evaluación RNN-3: solo test retenido, sin reajustar parámetros ni escaladores. */
import type { RnnPreparedData } from './trainingData.ts'

export type RnnTestEvaluation =
  | { kind: 'regression'; count: number; mse: number; rmse: number; mae: number; r2: number | null;
      examples: RnnTestExample[] }
  | { kind: 'classification'; count: number; accuracy: number; macroPrecision: number; macroRecall: number;
      macroF1: number; classes: string[]; confusion: number[][]; examples: RnnTestExample[] }

export interface RnnTestExample {
  seriesId: string
  targetTime: number
  actual: string | number
  predicted: string | number
}

/** Comprueba que no se hayan perdido ni creado salidas durante model.predict(). */
export function summarizeRnnTest(prepared: RnnPreparedData, predictionValues: ArrayLike<number>): RnnTestEvaluation {
  const { test, shape, normalization, classNames } = prepared
  const n = test.count
  const width = shape.problemType === 'multiclass' ? classNames.length : 1
  if (n <= 0 || predictionValues.length !== n * width || Array.from(predictionValues).some((v) => !Number.isFinite(v))) {
    throw new Error('El modelo no devolvió predicciones finitas para todo el test temporal.')
  }
  // RNN-4A: conservar los resultados de TODO el test solamente en memoria local.
  // Ninguna fila se envía al servidor ni se incluye en los resúmenes persistentes.
  const examples: RnnTestExample[] = []
  if (shape.problemType === 'regression') {
    let squared = 0; let absolute = 0; let total = 0
    const actuals: number[] = []
    for (let i = 0; i < n; i++) {
      const actual = test.y[i] * normalization.targetScale + normalization.targetMean
      const predicted = predictionValues[i] * normalization.targetScale + normalization.targetMean
      if (!Number.isFinite(actual) || !Number.isFinite(predicted)) throw new Error('Valor RNN no finito después de desnormalizar.')
      actuals.push(actual); total += actual
      squared += (actual - predicted) ** 2; absolute += Math.abs(actual - predicted)
      examples.push({ seriesId: test.targets[i].seriesId, targetTime: test.targets[i].targetTime, actual, predicted })
    }
    const mean = total / n
    const ssTot = actuals.reduce((sum, value) => sum + (value - mean) ** 2, 0)
    return { kind: 'regression', count: n, mse: squared / n, rmse: Math.sqrt(squared / n), mae: absolute / n,
      r2: ssTot <= 1e-12 ? null : 1 - squared / ssTot, examples }
  }
  const count = classNames.length
  if (count !== shape.classes || (shape.problemType === 'binary' && count !== 2)) throw new Error('Etiquetas incompatibles con el modelo RNN.')
  const confusion = Array.from({ length: count }, () => Array<number>(count).fill(0))
  let correct = 0
  for (let i = 0; i < n; i++) {
    const actual = shape.problemType === 'binary' ? Math.round(test.y[i]) :
      Array.from(test.y.slice(i * count, (i + 1) * count)).indexOf(1)
    if (actual < 0 || actual >= count) throw new Error('Etiqueta test inválida.')
    const predicted = shape.problemType === 'binary' ? (predictionValues[i] >= 0.5 ? 1 : 0) :
      Array.from({ length: count }, (_, c) => c).reduce((best, index) =>
        predictionValues[i * count + index] > predictionValues[i * count + best] ? index : best, 0)
    confusion[actual][predicted] += 1
    if (predicted === actual) correct++
    examples.push({ seriesId: test.targets[i].seriesId,
      targetTime: test.targets[i].targetTime, actual: classNames[actual], predicted: classNames[predicted] })
  }
  let precisionTotal = 0; let recallTotal = 0; let f1Total = 0
  for (let c = 0; c < count; c++) {
    const tp = confusion[c][c]
    const row = confusion[c].reduce((sum, v) => sum + v, 0)
    const column = confusion.reduce((sum, line) => sum + line[c], 0)
    const precision = column ? tp / column : 0
    const recall = row ? tp / row : 0
    precisionTotal += precision; recallTotal += recall
    f1Total += precision + recall ? 2 * precision * recall / (precision + recall) : 0
  }
  return { kind: 'classification', count: n, accuracy: correct / n, macroPrecision: precisionTotal / count,
    macroRecall: recallTotal / count, macroF1: f1Total / count, classes: [...classNames], confusion, examples }
}
