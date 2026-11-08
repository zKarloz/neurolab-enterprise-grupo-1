import type { DenseTrainConfig } from '../networks/config.ts'
import type { PreparedDataset } from '../preprocessing/types.ts'
import type { TrainingEvent, TrainingWorkerCommand } from './types.ts'

export interface TrainingSession { cancel: () => void; dispose: () => void }

/** Orquestador local sin Supabase ni colas remotas; evita dobles resultados tras un fallo de Worker. */
export function startBrowserTraining(
  dataset: PreparedDataset,
  config: DenseTrainConfig,
  onEvent: (event: TrainingEvent) => void,
): TrainingSession {
  let worker: Worker | null = null
  let disposed = false
  let requestedStop = false
  let started = false
  let completed = false
  let mainFallbackStarted = false
  const emit = (event: TrainingEvent) => {
    if (disposed || completed) return
    if (event.type === 'backend' || event.type === 'epoch') started = true
    onEvent(event)
    if (['completed', 'cancelled', 'error'].includes(event.type)) {
      completed = true
      worker?.terminate()
      worker = null
    }
  }
  const runOnMain = () => {
    if (disposed || completed || mainFallbackStarted) return
    mainFallbackStarted = true
    void import('./trainCore.ts')
      .then(({ trainDenseModel }) => trainDenseModel(dataset, config, 'main', emit, () => requestedStop || disposed))
      .catch((cause: unknown) => emit({ type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo entrenar en este navegador.' }))
  }
  try {
    if (typeof Worker === 'undefined') {
      runOnMain()
    } else {
      // Esta forma literal de new Worker/new URL es necesaria para que Vite incluya el bundle del Worker.
      worker = new Worker(new URL('../../workers/training.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (message: MessageEvent<TrainingEvent>) => emit(message.data)
      worker.onerror = () => {
        if (disposed || completed) return
        worker?.terminate()
        worker = null
        if (!started) runOnMain()
        else emit({ type: 'error', message: 'El Worker se interrumpió durante el entrenamiento. No se reinició para evitar resultados duplicados.' })
      }
      worker.onmessageerror = () => {
        worker?.terminate()
        worker = null
        if (!started) runOnMain()
        else emit({ type: 'error', message: 'No se pudo interpretar el mensaje del Worker.' })
      }
      worker.postMessage({ type: 'start', dataset, config } satisfies TrainingWorkerCommand)
    }
  } catch {
    worker?.terminate()
    worker = null
    runOnMain()
  }
  return {
    cancel: () => {
      requestedStop = true
      if (worker) worker.postMessage({ type: 'cancel' } satisfies TrainingWorkerCommand)
    },
    dispose: () => {
      disposed = true
      requestedStop = true
      worker?.terminate()
      worker = null
    },
  }
}
