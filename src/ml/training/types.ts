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
/** El modelo entrenado existe solo en memoria, nunca en PostgreSQL hasta Fase 5. */
export interface DensePredictor {
  predict: (features: number[]) => Promise<number>
  dispose: () => void
}

export type TrainingEvent =
  | { type: 'initializing'; context: RuntimeContext }
  | { type: 'backend'; backend: BackendName; context: RuntimeContext; tfjsVersion: string }
  | { type: 'epoch'; metrics: EpochMetrics }
  | { type: 'evaluation'; evaluation: TestEvaluation }
  | { type: 'completed'; summary: TrainingSummary }
  | { type: 'cancelled'; epochsCompleted: number }
  | { type: 'error'; message: string }
  | { type: 'prediction'; requestId: number; value: number }
  | { type: 'prediction-error'; requestId: number; message: string }
export type TrainingWorkerCommand =
  | { type: 'start'; dataset: PreparedDataset; config: DenseTrainConfig }
  | { type: 'cancel' }
  | { type: 'predict'; requestId: number; features: number[] }
