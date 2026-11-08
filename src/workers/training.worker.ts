/// <reference lib="webworker" />
import { trainDenseModel } from '../ml/training/trainCore.ts'
import type { DensePredictor, TrainingEvent, TrainingWorkerCommand } from '../ml/training/types.ts'

declare const self: DedicatedWorkerGlobalScope
let running = false
let stopRequested = false
let predictor: DensePredictor | null = null

/** Atiende órdenes por tipo: nunca se leen datos de entrenamiento en una orden de predicción. */
self.onmessage = (message: MessageEvent<TrainingWorkerCommand>) => {
  const command = message.data

  switch (command.type) {
    case 'cancel': {
      // Se solicita detener el entrenamiento en la siguiente comprobación cooperativa.
      if (running) stopRequested = true
      return
    }
    case 'predict': {
      const { requestId, features } = command
      if (!predictor || running) {
        self.postMessage({
          type: 'prediction-error', requestId,
          message: 'Aún no existe un modelo entrenado disponible.',
        } satisfies TrainingEvent)
        return
      }

      void predictor.predict(features)
        .then((value) => self.postMessage({ type: 'prediction', requestId, value } satisfies TrainingEvent))
        .catch((cause: unknown) => self.postMessage({
          type: 'prediction-error', requestId,
          message: cause instanceof Error ? cause.message : 'No se pudo calcular la predicción.',
        } satisfies TrainingEvent))
      return
    }
    case 'export': {
      const { requestId } = command
      if (!predictor || running) {
        self.postMessage({ type: 'artifacts-error', requestId, message: 'No hay modelo completo disponible.' } satisfies TrainingEvent)
        return
      }
      void predictor.exportArtifacts()
        .then((bundle) => self.postMessage({ type: 'artifacts', requestId, bundle } satisfies TrainingEvent))
        .catch((cause: unknown) => self.postMessage({ type: 'artifacts-error', requestId,
          message: cause instanceof Error ? cause.message : 'No se pudo exportar el modelo.' } satisfies TrainingEvent))
      return
    }
    case 'start': {
      if (running) return
      // El modelo anterior se libera antes de iniciar un entrenamiento nuevo.
      predictor?.dispose()
      predictor = null
      running = true
      stopRequested = false

      const emit = (event: TrainingEvent) => self.postMessage(event)
      void trainDenseModel(
        command.dataset, command.config, 'worker', emit,
        () => stopRequested, (ready) => { predictor = ready },
      )
        .catch((cause: unknown) => emit({
          type: 'error',
          message: cause instanceof Error ? cause.message : 'Error desconocido al entrenar.',
        }))
        .finally(() => { running = false })
      return
    }
  }
}
