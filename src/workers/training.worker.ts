/// <reference lib="webworker" />
import { trainDenseModel } from '../ml/training/trainCore.ts'
import type { TrainingEvent, TrainingWorkerCommand } from '../ml/training/types.ts'

declare const self: DedicatedWorkerGlobalScope
let running = false
let stopRequested = false

/** Una sola ejecución por Worker. La cancelación es cooperativa entre épocas. */
self.onmessage = (message: MessageEvent<TrainingWorkerCommand>) => {
  if (message.data.type === 'cancel') { stopRequested = true; return }
  if (running) return
  running = true
  stopRequested = false
  const emit = (event: TrainingEvent) => self.postMessage(event)
  void trainDenseModel(message.data.dataset, message.data.config, 'worker', emit, () => stopRequested)
    .catch((cause: unknown) => emit({ type: 'error', message: cause instanceof Error ? cause.message : 'Error desconocido al entrenar.' }))
    .finally(() => { running = false })
}
