import type { EpochMetrics } from '../training/types.ts'
import type { ProblemType } from '../preprocessing/types.ts'

export type MetricRow = { epoch: number; split: string; metric_name: string; metric_value: number }

/** Reconstrucción estricta desde registros reales. No interpola épocas faltantes. */
export function assembleHistoryMetrics(rows: MetricRow[], problemType: ProblemType): EpochMetrics[] {
  const byEpoch = new Map<number, { epoch: number; loss?: number; validationLoss?: number; metric?: number; validationMetric?: number }>()
  for (const row of rows) {
    if (!Number.isSafeInteger(row.epoch) || row.epoch < 1 || !Number.isFinite(row.metric_value)) continue
    const value = byEpoch.get(row.epoch) ?? { epoch: row.epoch }
    if (row.metric_name === 'loss') {
      if (row.split === 'train') value.loss = row.metric_value
      if (row.split === 'validation') value.validationLoss = row.metric_value
    }
    const expected = problemType === 'binary' ? 'accuracy' : 'mae'
    if (row.metric_name === expected) {
      if (row.split === 'train') value.metric = row.metric_value
      if (row.split === 'validation') value.validationMetric = row.metric_value
    }
    byEpoch.set(row.epoch, value)
  }
  const totalEpochs = Math.max(0, ...byEpoch.keys())
  return [...byEpoch.values()]
    .filter((value) => value.loss !== undefined && value.validationLoss !== undefined)
    .sort((a, b) => a.epoch - b.epoch)
    .map((value) => ({
      epoch: value.epoch, totalEpochs, loss: value.loss!, validationLoss: value.validationLoss!,
      metric: value.metric ?? null, validationMetric: value.validationMetric ?? null,
    }))
}
