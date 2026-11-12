import type { TestEvaluation } from './metrics.ts'
import type { CnnStoredEvaluation } from './cnnStoredEvaluation.ts'
import { isRnnStoredEvaluation, type RnnStoredEvaluation } from './rnnStoredEvaluation.ts'
import { isGanStoredEvaluation, type GanStoredEvaluation } from './ganStoredEvaluation.ts'
import type { EpochMetrics } from '../training/types.ts'

export interface ComparisonRow { metric: string; first: number | null; second: number | null }

/** Solo se comparan problemas del mismo tipo; nunca se inventan evaluaciones ausentes. */
export function compareTestMetrics(first: TestEvaluation | CnnStoredEvaluation | RnnStoredEvaluation | GanStoredEvaluation | null, second: TestEvaluation | CnnStoredEvaluation | RnnStoredEvaluation | GanStoredEvaluation | null): ComparisonRow[] {
  if (!first || !second) return []
  // Las pérdidas adversariales y el resumen descriptivo nunca se comparan como métricas test.
  if (isGanStoredEvaluation(first) || isGanStoredEvaluation(second)) return []
  if (first.problemType !== second.problemType) throw new Error('No se pueden comparar métricas de tipos de problema distintos.')
  // Los formatos RNN no son equivalentes a Feedforward/CNN aunque compartan tarea.
  if (isRnnStoredEvaluation(first) !== isRnnStoredEvaluation(second)) return []
  if (isRnnStoredEvaluation(first) && isRnnStoredEvaluation(second)) {
    if (first.problemType === 'regression' && second.problemType === 'regression') return [
      { metric: 'MSE test', first: first.mse, second: second.mse },
      { metric: 'RMSE test', first: first.rmse, second: second.rmse },
      { metric: 'MAE test', first: first.mae, second: second.mae },
      { metric: 'R² test', first: first.r2, second: second.r2 },
    ]
    if (first.problemType !== 'regression' && second.problemType !== 'regression') {
      // Dos clasificaciones RNN solo se comparan con etiquetas idénticas y mismo orden.
      if (JSON.stringify(first.classNames) !== JSON.stringify(second.classNames)) return []
      return [
        { metric: 'Accuracy test', first: first.accuracy, second: second.accuracy },
        { metric: 'Precisión macro', first: first.macroPrecision, second: second.macroPrecision },
        { metric: 'Recall macro', first: first.macroRecall, second: second.macroRecall },
        { metric: 'F1 macro', first: first.macroF1, second: second.macroF1 },
      ]
    }
    return []
  }
  if (!isRnnStoredEvaluation(first) && !isRnnStoredEvaluation(second) && first.problemType === 'binary' && second.problemType === 'binary') {
    return [
      { metric: 'Pérdida test (BCE)', first: first.loss, second: second.loss },
      { metric: 'Exactitud', first: first.accuracy, second: second.accuracy },
      { metric: 'Precisión', first: first.precision, second: second.precision },
      { metric: 'Recall', first: first.recall, second: second.recall },
      { metric: 'F1', first: first.f1, second: second.f1 },
    ]
  }
  if (!isRnnStoredEvaluation(first) && !isRnnStoredEvaluation(second) && first.problemType === 'regression' && second.problemType === 'regression') {
    return [
      { metric: 'MSE test', first: first.mse, second: second.mse },
      { metric: 'RMSE test', first: first.rmse, second: second.rmse },
      { metric: 'MAE test', first: first.mae, second: second.mae },
      { metric: 'R² test', first: first.r2, second: second.r2 },
    ]
  }
  if (!isRnnStoredEvaluation(first) && !isRnnStoredEvaluation(second) && first.problemType === 'multiclass' && second.problemType === 'multiclass') {
    // Las métricas macro son comparables solo si la clase representa el mismo concepto.
    if (JSON.stringify(first.classNames) !== JSON.stringify(second.classNames)) return []
    return [
      { metric: 'Loss test (categorical crossentropy)', first: first.loss, second: second.loss },
      { metric: 'Accuracy test', first: first.accuracy, second: second.accuracy },
      { metric: 'Precisión macro', first: first.macroPrecision, second: second.macroPrecision },
      { metric: 'Recall macro', first: first.macroRecall, second: second.macroRecall },
      { metric: 'F1 macro', first: first.macroF1, second: second.macroF1 },
    ]
  }
  return []
}

/** Une pérdidas de validación solo donde existe una época registrada de verdad. */
export function buildValidationComparison(first: EpochMetrics[], second: EpochMetrics[]): Array<{
  epoch: number; first: number | null; second: number | null
}> {
  const a = new Map(first.map((item) => [item.epoch, item.validationLoss]))
  const b = new Map(second.map((item) => [item.epoch, item.validationLoss]))
  const epochs = new Set([...a.keys(), ...b.keys()])
  return [...epochs].sort((x, y) => x - y).map((epoch) => ({
    epoch, first: a.get(epoch) ?? null, second: b.get(epoch) ?? null,
  }))
}
