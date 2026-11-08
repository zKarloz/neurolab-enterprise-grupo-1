import type { TestEvaluation } from './metrics.ts'
import type { EpochMetrics } from '../training/types.ts'

export interface ComparisonRow { metric: string; first: number | null; second: number | null }

/** Solo se comparan problemas del mismo tipo; nunca se inventan evaluaciones ausentes. */
export function compareTestMetrics(first: TestEvaluation | null, second: TestEvaluation | null): ComparisonRow[] {
  if (!first || !second) return []
  if (first.problemType !== second.problemType) throw new Error('No se pueden comparar métricas de tipos de problema distintos.')
  if (first.problemType === 'binary' && second.problemType === 'binary') {
    return [
      { metric: 'Pérdida test (BCE)', first: first.loss, second: second.loss },
      { metric: 'Exactitud', first: first.accuracy, second: second.accuracy },
      { metric: 'Precisión', first: first.precision, second: second.precision },
      { metric: 'Recall', first: first.recall, second: second.recall },
      { metric: 'F1', first: first.f1, second: second.f1 },
    ]
  }
  if (first.problemType === 'regression' && second.problemType === 'regression') {
    return [
      { metric: 'MSE test', first: first.mse, second: second.mse },
      { metric: 'RMSE test', first: first.rmse, second: second.rmse },
      { metric: 'MAE test', first: first.mae, second: second.mae },
      { metric: 'R² test', first: first.r2, second: second.r2 },
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
