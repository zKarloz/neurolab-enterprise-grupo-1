import type { ModelArtifactBundle } from '../models/artifacts.ts'
import type { DenseTrainConfig } from '../networks/config.ts'
import type { PreparedDataset } from '../preprocessing/types.ts'
import type { DensePredictor, TrainingEvent, TrainingWorkerCommand } from './types.ts'

export interface TrainingSession {
  cancel: () => void
  predict: (features: number[]) => Promise<number>
  exportArtifacts: () => Promise<ModelArtifactBundle>
  dispose: () => void
}

/** Mantiene temporalmente el modelo local tras COMPLETED; solo F5 lo serializará. */
export function startBrowserTraining(
  dataset: PreparedDataset,
  config: DenseTrainConfig,
  onEvent: (event: TrainingEvent) => void,
): TrainingSession {
  let worker: Worker | null = null
  let mainPredictor: DensePredictor | null = null
  let disposed = false
  let requestedStop = false
  let started = false
  let finished = false
  let successful = false
  let mainFallbackStarted = false
  let nextRequestId = 0
  const pendingExports = new Map<number, { resolve: (value: ModelArtifactBundle) => void; reject: (reason: Error) => void }>()
  const pending = new Map<number, { resolve: (value: number) => void; reject: (reason: Error) => void }>()

  function rejectPending(reason: string) {
    for (const request of pending.values()) request.reject(new Error(reason))
    pending.clear()
    for (const request of pendingExports.values()) request.reject(new Error(reason))
    pendingExports.clear()
  }

  function emit(event: TrainingEvent) {
    if (disposed) return
    if (event.type === 'artifacts' || event.type === 'artifacts-error') {
      const request = pendingExports.get(event.requestId)
      if (request) {
        pendingExports.delete(event.requestId)
        if (event.type === 'artifacts') request.resolve(event.bundle)
        else request.reject(new Error(event.message))
      }
      return
    }
    if (event.type === 'prediction' || event.type === 'prediction-error') {
      const request = pending.get(event.requestId)
      if (request) {
        pending.delete(event.requestId)
        if (event.type === 'prediction') request.resolve(event.value)
        else request.reject(new Error(event.message))
      }
      return
    }
    if (finished) return
    if (event.type === 'backend' || event.type === 'epoch') started = true
    if (event.type === 'completed') { successful = true; finished = true }
    if (event.type === 'cancelled' || event.type === 'error') {
      finished = true
      rejectPending('El entrenamiento no terminó correctamente.')
      worker?.terminate()
      worker = null
      mainPredictor?.dispose()
      mainPredictor = null
    }
    onEvent(event)
  }

  function runOnMain() {
    if (disposed || finished || mainFallbackStarted) return
    mainFallbackStarted = true
    void import('./trainCore.ts')
      .then(({ trainDenseModel }) => trainDenseModel(dataset, config, 'main', emit,
        () => requestedStop || disposed, (ready) => { mainPredictor = ready }))
      .catch((cause: unknown) => emit({ type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo entrenar en este navegador.' }))
  }

  try {
    if (typeof Worker === 'undefined') runOnMain()
    else {
      // Forma literal requerida por Vite para empaquetar el Worker.
      worker = new Worker(new URL('../../workers/training.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (message: MessageEvent<TrainingEvent>) => emit(message.data)
      worker.onerror = () => {
        if (disposed) return
        if (finished) {
          rejectPending('Se perdió el Worker que conservaba el modelo local.')
          worker?.terminate()
          worker = null
          successful = false
          return
        }
        worker?.terminate()
        worker = null
        if (!started) runOnMain()
        else emit({ type: 'error', message: 'El Worker se interrumpió durante el entrenamiento. No se reinició para evitar resultados duplicados.' })
      }
      worker.onmessageerror = () => {
        if (disposed) return
        if (finished) {
          rejectPending('El Worker devolvió una respuesta de inferencia inválida.')
          worker?.terminate()
          worker = null
          successful = false
          return
        }
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
      if (finished || disposed) return
      requestedStop = true
      if (worker) worker.postMessage({ type: 'cancel' } satisfies TrainingWorkerCommand)
    },
    predict: async (features) => {
      if (disposed || !successful) throw new Error('Primero completa un entrenamiento en esta sesión.')
      if (features.length !== dataset.manifest.featureNames.length || features.some((value) => !Number.isFinite(value))) {
        throw new Error('La entrada tiene dimensiones o valores no válidos.')
      }
      if (!worker) {
        if (!mainPredictor) throw new Error('El modelo local no está disponible.')
        return mainPredictor.predict(features)
      }
      return new Promise<number>((resolve, reject) => {
        const requestId = ++nextRequestId
        pending.set(requestId, { resolve, reject })
        try { worker!.postMessage({ type: 'predict', requestId, features } satisfies TrainingWorkerCommand) }
        catch (cause) {
          pending.delete(requestId)
          reject(cause instanceof Error ? cause : new Error('No se pudo enviar la predicción al Worker.'))
        }
      })
    },
    exportArtifacts: async () => {
      if (disposed || !successful) throw new Error('El entrenamiento debe finalizar antes de guardar el modelo.')
      if (!worker) {
        if (!mainPredictor) throw new Error('El modelo local ya no está disponible.')
        return mainPredictor.exportArtifacts()
      }
      return new Promise<ModelArtifactBundle>((resolve, reject) => {
        const requestId = ++nextRequestId
        pendingExports.set(requestId, { resolve, reject })
        try { worker!.postMessage({ type: 'export', requestId } satisfies TrainingWorkerCommand) }
        catch (cause) {
          pendingExports.delete(requestId)
          reject(cause instanceof Error ? cause : new Error('No se pudo exportar desde el Worker.'))
        }
      })
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      requestedStop = true
      rejectPending('El modelo fue liberado al abandonar la pantalla.')
      mainPredictor?.dispose()
      mainPredictor = null
      worker?.terminate()
      worker = null
    },
  }
}
