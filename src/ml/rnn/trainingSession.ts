/** Sesión RNN-3: Worker persistente para inferencia y fallback antes de empezar. */
import type { RawTable } from '../preprocessing/types.ts'
import type { RnnConfig } from './architecture.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'
import type { RnnInferenceResult } from './inference.ts'
import type { RnnTrainingEvent, RnnTrainOptions, RnnWorkerCommand, RnnPredictionReply } from './trainingTypes.ts'
import type { RnnTrainedRuntime } from './trainEngine.ts'
import type { ModelArtifactBundle } from '../models/artifacts.ts'

export interface RnnSession {
  cancel: () => void
  predict: (seriesId: string) => Promise<RnnInferenceResult>
  exportModel: () => Promise<ModelArtifactBundle>
  dispose: () => void
}
export function startRnnTraining(
  table: RawTable, datasetOptions: RnnDatasetOptions, config: RnnConfig,
  options: RnnTrainOptions, onEvent: (event: RnnTrainingEvent) => void,
): RnnSession {
  let worker: Worker | null = null
  let abort: AbortController | null = null
  let stopped = false
  let disposed = false
  let delivered = false
  let finished = false
  let succeeded = false
  let mainStarted = false
  let runtime: RnnTrainedRuntime | null = null
  let serial = 0
  const pending = new Map<number, { resolve: (result: RnnInferenceResult) => void; reject: (error: Error) => void }>()
  const pendingExports = new Map<number, { resolve: (bundle: ModelArtifactBundle) => void; reject: (error: Error) => void }>()
  const rejectPending = (message: string) => {
    for (const waiter of pending.values()) waiter.reject(new Error(message))
    pending.clear()
    for (const waiter of pendingExports.values()) waiter.reject(new Error(message))
    pendingExports.clear()
  }
  const emit = (event: RnnTrainingEvent) => {
    if (disposed || finished) return
    delivered = true
    onEvent(event)
    if (event.type === 'completed') { finished = true; succeeded = true }
    else if (event.type === 'cancelled' || event.type === 'error') {
      finished = true
      worker?.terminate(); worker = null
      runtime?.dispose(); runtime = null
      rejectPending('La sesión RNN terminó sin modelo válido.')
    }
  }
  const runMain = () => {
    if (mainStarted || disposed || finished) return
    mainStarted = true
    abort = new AbortController()
    void import('./trainEngine.ts')
      .then(({ trainRnnModel }) => trainRnnModel(table, datasetOptions, config, options, emit,
        () => stopped || disposed, abort!.signal, 'main', (model) => { runtime = model }))
      .catch((cause: unknown) => emit({ type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo iniciar TensorFlow.js.' }))
  }
  const failWorker = () => {
    worker?.terminate(); worker = null
    rejectPending('El Worker dejó de responder.')
    if (!delivered) runMain()
    else if (!finished) emit({ type: 'error', message: 'El Worker RNN se interrumpió después de empezar; no se reinició el entrenamiento.' })
  }
  try {
    if (typeof Worker === 'undefined') runMain()
    else {
      worker = new Worker(new URL('../../workers/rnn.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (message: MessageEvent<RnnTrainingEvent | RnnPredictionReply>) => {
        const data = message.data
        if (data.type === 'model-exported' || data.type === 'model-export-error') {
          const waiter = pendingExports.get(data.requestId)
          if (!waiter) return
          pendingExports.delete(data.requestId)
          if (data.type === 'model-exported') waiter.resolve(data.bundle)
          else waiter.reject(new Error(data.message))
          return
        }
        if (data.type === 'prediction' || data.type === 'prediction_error') {
          const promise = pending.get(data.requestId)
          if (!promise) return
          pending.delete(data.requestId)
          if (data.type === 'prediction') promise.resolve(data.result)
          else promise.reject(new Error(data.message))
          return
        }
        emit(data)
      }
      worker.onerror = failWorker
      worker.onmessageerror = failWorker
      worker.postMessage({ type: 'start', table, datasetOptions, config, options } satisfies RnnWorkerCommand)
    }
  } catch { worker?.terminate(); worker = null; runMain() }
  return {
    cancel: () => {
      if (disposed || finished) return
      stopped = true
      abort?.abort()
      if (worker) {
        try { worker.postMessage({ type: 'cancel' } satisfies RnnWorkerCommand) }
        catch { worker.terminate(); worker = null; emit({ type: 'cancelled' }) }
      }
    },
    predict: async (seriesId: string) => {
      if (disposed || !succeeded) throw new Error('Entrena y evalúa primero una RNN antes de predecir.')
      if (runtime) return runtime.predict(seriesId)
      if (!worker) throw new Error('El modelo entrenado ya no está disponible.')
      const requestId = ++serial
      return new Promise<RnnInferenceResult>((resolve, reject) => {
        pending.set(requestId, { resolve, reject })
        try { worker!.postMessage({ type: 'predict', requestId, seriesId } satisfies RnnWorkerCommand) }
        catch { pending.delete(requestId); reject(new Error('No se pudo solicitar inferencia al Worker.')) }
      })
    },
    // Solo tras una ejecución local finalizada y evaluada; la UI valida además el estado remoto.
    exportModel: async () => {
      if (disposed || !succeeded) throw new Error('Completa primero entrenamiento y evaluación RNN para exportar.')
      if (runtime) return runtime.exportModel()
      if (!worker) throw new Error('El modelo RNN ya no está disponible.')
      const requestId = ++serial
      return new Promise<ModelArtifactBundle>((resolve, reject) => {
        pendingExports.set(requestId, { resolve, reject })
        try { worker!.postMessage({ type: 'export-model', requestId } satisfies RnnWorkerCommand) }
        catch { pendingExports.delete(requestId); reject(new Error('No se pudo solicitar la exportación RNN.')) }
      })
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      stopped = true
      abort?.abort()
      rejectPending('La sesión RNN fue liberada.')
      runtime?.dispose(); runtime = null
      worker?.terminate(); worker = null
    },
  }
}
