/**
 * Sesión de entrenamiento temporal. Usa Worker para mantener responsiva la UI;
 * hace fallback solo cuando el Worker falla antes de comenzar. No reintenta
 * sesiones parcialmente ejecutadas (evita resultados duplicados).
 */
import type { CnnConfig } from './architecture.ts'
import type { LocalImageDataset } from './localImageCsv.ts'
import type { CnnTrainingEvent, CnnTrainOptions, CnnWorkerCommand } from './trainingTypes.ts'

export interface CnnSession { cancel: () => void; dispose: () => void }

export function startCnnTraining(
  config: CnnConfig, options: CnnTrainOptions, onEvent: (event: CnnTrainingEvent) => void, dataset: LocalImageDataset,
): CnnSession {
  let worker: Worker | null = null
  let abort: AbortController | null = null
  let disposed = false
  let stopped = false
  let delivered = false
  let finished = false
  let runningMain = false
  const emit = (event: CnnTrainingEvent) => {
    if (disposed || finished) return
    delivered = true
    onEvent(event)
    if (event.type === 'cancelled' || event.type === 'completed' || event.type === 'error') {
      finished = true
      worker?.terminate()
      worker = null
    }
  }
  const runMain = () => {
    if (runningMain || disposed || finished) return
    runningMain = true
    abort = new AbortController()
    void import('./trainEngine.ts')
      .then(({ trainCnnModel }) => trainCnnModel(config, options, emit, () => stopped || disposed, abort!.signal, 'main', dataset))
      .catch((error: unknown) => emit({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo ejecutar TensorFlow.js.' }))
  }
  try {
    if (typeof Worker === 'undefined') runMain()
    else {
      worker = new Worker(new URL('../../workers/cnn.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (message: MessageEvent<CnnTrainingEvent>) => emit(message.data)
      worker.onerror = () => {
        worker?.terminate(); worker = null
        if (!delivered) runMain()
        else emit({ type: 'error', message: 'El Worker se interrumpió. No se reintentó para evitar entrenamientos duplicados.' })
      }
      worker.onmessageerror = () => {
        worker?.terminate(); worker = null
        if (!delivered) runMain()
        else emit({ type: 'error', message: 'No se pudo interpretar la respuesta del Worker.' })
      }
      worker.postMessage({ type: 'start', config, options, dataset } satisfies CnnWorkerCommand)
    }
  } catch {
    worker?.terminate(); worker = null
    runMain()
  }
  return {
    cancel: () => {
      if (finished || disposed) return
      stopped = true
      abort?.abort()
      if (worker) {
        try { worker.postMessage({ type: 'cancel' } satisfies CnnWorkerCommand) }
        catch { worker.terminate(); worker = null; emit({ type: 'cancelled' }) }
      }
    },
    dispose: () => {
      disposed = true
      stopped = true
      abort?.abort()
      worker?.terminate()
      worker = null
    },
  }
}
