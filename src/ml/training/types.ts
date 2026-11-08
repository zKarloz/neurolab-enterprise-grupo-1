import type { DenseTrainConfig } from '../networks/config.ts'
import type { PreparedDataset } from '../preprocessing/types.ts'
import type { TestEvaluation } from '../evaluation/metrics.ts'

/** Contrato estructurado entre React y el Web Worker; se transportan solamente datos locales. */
export type RuntimeContext = 'worker' | 'main'
export type BackendName = 'webgl' | 'cpu'
export interface EpochMetrics {
  epoch: number
  totalEpochs: number
  loss: number
  validationLoss: number
  metric: number | null
  validationMetric: number | null
}
export interface TrainingSummary {
  backend: BackendName
  context: RuntimeContext
  tfjsVersion: string
  durationMs: number
  epochsCompleted: number
  final: EpochMetrics
  parameters: number
}
export type TrainingEvent =
  | { type: 'initializing'; context: RuntimeContext }
  | { type: 'backend'; backend: BackendName; context: RuntimeContext; tfjsVersion: string }
  | { type: 'epoch'; metrics: EpochMetrics }
  | { type: 'evaluation'; evaluation: TestEvaluation }
  | { type: 'completed'; summary: TrainingSummary }
  | { type: 'cancelled'; epochsCompleted: number }
  | { type: 'error'; message: string }
export type TrainingWorkerCommand =
  | { type: 'start'; dataset: PreparedDataset; config: DenseTrainConfig }
  | { type: 'cancel' }
