/// <reference lib="webworker" />
/** Worker CNN-3: conserva pesos entre final de entrenamiento y predicciones. */
import { trainCnnModel, type TrainedCnnRuntime } from '../ml/cnn/trainEngine.ts'
import type { CnnWorkerCommand, CnnTrainingEvent } from '../ml/cnn/trainingTypes.ts'

declare const self: DedicatedWorkerGlobalScope
let active = false
let stop = false
let abort: AbortController | null = null
let runtime: TrainedCnnRuntime | null = null

self.onmessage = (event: MessageEvent<CnnWorkerCommand>) => {
  const command = event.data
  if (command.type === 'cancel') {
    if (active) { stop = true; abort?.abort() }
    return
  }
  if (command.type === 'predict') {
    const { requestId, pixels } = command
    if (active || !runtime) {
      self.postMessage({ type: 'prediction-error', requestId, message: 'El modelo todavía no está listo.' } satisfies CnnTrainingEvent)
      return
    }
    void runtime.predict(pixels)
      .then((probabilities) => self.postMessage({ type: 'prediction', requestId, probabilities } satisfies CnnTrainingEvent))
      .catch((error: unknown) => self.postMessage({ type: 'prediction-error', requestId, message: error instanceof Error ? error.message : 'No se pudo predecir.' } satisfies CnnTrainingEvent))
    return
  }
  if (active) return
  runtime?.dispose(); runtime = null
  active = true
  stop = false
  abort = new AbortController()
  void trainCnnModel(command.config, command.options,
    (message: CnnTrainingEvent) => self.postMessage(message),
    () => stop, abort.signal, 'worker', command.dataset)
    .then((model) => {
      runtime = model
    })
    .catch((error: unknown) => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Error al iniciar CNN.' } satisfies CnnTrainingEvent))
    .finally(() => { active = false; abort = null })
}
