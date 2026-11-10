/// <reference lib="webworker" />
/** Worker CNN-2: ejecuta entrenamiento CPU fuera del hilo de la interfaz. */
import { trainCnnModel } from '../ml/cnn/trainEngine.ts'
import type { CnnWorkerCommand, CnnTrainingEvent } from '../ml/cnn/trainingTypes.ts'

declare const self: DedicatedWorkerGlobalScope
let active = false
let stop = false
let abort: AbortController | null = null

self.onmessage = (event: MessageEvent<CnnWorkerCommand>) => {
  const command = event.data
  if (command.type === 'cancel') {
    stop = true
    abort?.abort()
    return
  }
  if (active) return
  active = true
  stop = false
  abort = new AbortController()
  const signal = abort.signal
  void trainCnnModel(command.config, command.options,
    (message: CnnTrainingEvent) => self.postMessage(message),
    () => stop, signal, 'worker', command.dataset)
    .catch((error: unknown) => self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Error al iniciar CNN.' } satisfies CnnTrainingEvent))
    .finally(() => { active = false; abort = null })
}
