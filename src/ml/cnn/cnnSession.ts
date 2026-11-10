/**
 * Sesión CNN-3 en memoria: Worker preferido, fallback a hilo principal antes de
 * iniciar el entrenamiento. El Worker permanece vivo después del fit para
 * inferencia local y se termina explícitamente al destruir la sesión.
 */
import type { CnnConfig } from './architecture.ts'
import type { LocalImageDataset } from './localImageCsv.ts'
import type { CnnTrainingEvent, CnnTrainOptions, CnnWorkerCommand } from './trainingTypes.ts'
import type { TrainedCnnRuntime } from './trainEngine.ts'

export interface CnnSession {
  cancel: () => void
  predict: (pixels: Uint8Array) => Promise<number[]>
  dispose: () => void
}

export function startCnnTraining(
  config: CnnConfig, options: CnnTrainOptions, onEvent: (event: CnnTrainingEvent) => void, dataset: LocalImageDataset,
): CnnSession {
  let worker: Worker | null = null
  let abort: AbortController | null = null
  let mainRuntime: TrainedCnnRuntime | null = null
  let mainPromise: Promise<TrainedCnnRuntime | null> | null = null
  let disposed = false
  let stopped = false
  let delivered = false
  let finished = false
  let completed = false
  let runningMain = false
  let nextRequestId = 0
  const pending = new Map<number, { resolve: (values: number[]) => void; reject: (error: Error) => void }>()

  const rejectPending = (message: string) => {
    pending.forEach(({ reject }) => reject(new Error(message)))
    pending.clear()
  }
  const emit = (event: CnnTrainingEvent) => {
    if (disposed) return
    if (event.type === 'prediction' || event.type === 'prediction-error') {
      const request = pending.get(event.requestId)
      pending.delete(event.requestId)
      if (request) {
        if (event.type === 'prediction') request.resolve(event.probabilities)
        else request.reject(new Error(event.message))
      }
      return
    }
    if (finished) return
    delivered = true
    onEvent(event)
    if (event.type === 'completed') {
      finished = true
      completed = true
      // El Worker conserva el modelo para Predecir; NO termina aquí.
    } else if (event.type === 'cancelled' || event.type === 'error') {
      finished = true
      worker?.terminate(); worker = null
      rejectPending('La sesión de CNN terminó sin modelo para predecir.')
    }
  }
  const runMain = () => {
    if (runningMain || disposed || finished) return
    runningMain = true
    abort = new AbortController()
    mainPromise = import('./trainEngine.ts')
      .then(({ trainCnnModel }) => trainCnnModel(config, options, emit, () => stopped || disposed, abort!.signal, 'main', dataset))
      .then((runtime) => {
        if (disposed) { runtime?.dispose(); return null }
        mainRuntime = runtime
        return runtime
      })
      .catch((error: unknown) => {
        emit({ type: 'error', message: error instanceof Error ? error.message : 'No se pudo ejecutar TensorFlow.js.' })
        return null
      })
  }
  const workerFailed = (message: string) => {
    worker?.terminate(); worker = null
    rejectPending(message)
    if (!delivered) runMain()
    else emit({ type: 'error', message })
  }
  try {
    if (typeof Worker === 'undefined') runMain()
    else {
      worker = new Worker(new URL('../../workers/cnn.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (message: MessageEvent<CnnTrainingEvent>) => emit(message.data)
      worker.onerror = () => workerFailed('El Worker CNN se interrumpió; no se reintentó el entrenamiento parcialmente realizado.')
      worker.onmessageerror = () => workerFailed('No se pudo interpretar la respuesta del Worker CNN.')
      worker.postMessage({ type: 'start', config, options, dataset } satisfies CnnWorkerCommand)
    }
  } catch { worker?.terminate(); worker = null; runMain() }
  return {
    cancel: () => {
      if (disposed || finished) return
      stopped = true
      abort?.abort()
      if (worker) {
        try { worker.postMessage({ type: 'cancel' } satisfies CnnWorkerCommand) }
        catch { worker.terminate(); worker = null; emit({ type: 'cancelled' }) }
      }
    },
    predict: async (pixels: Uint8Array) => {
      if (disposed || !completed) throw new Error('Primero completa el entrenamiento CNN para habilitar la predicción.')
      if (worker) {
        const requestId = ++nextRequestId
        return new Promise<number[]>((resolve, reject) => {
          pending.set(requestId, { resolve, reject })
          try { worker!.postMessage({ type: 'predict', requestId, pixels } satisfies CnnWorkerCommand) }
          catch (error) {
            pending.delete(requestId)
            reject(error instanceof Error ? error : new Error('No se pudo enviar la imagen al Worker.'))
          }
        })
      }
      const runtime = mainRuntime ?? await mainPromise
      if (!runtime || disposed) throw new Error('Ya no está disponible el modelo temporal.')
      return runtime.predict(pixels)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      stopped = true
      abort?.abort()
      rejectPending('La sesión fue cerrada.')
      worker?.terminate(); worker = null
      mainRuntime?.dispose(); mainRuntime = null
      // La promesa de entrenamiento comprueba disposed antes de conservar pesos.
    },
  }
}
