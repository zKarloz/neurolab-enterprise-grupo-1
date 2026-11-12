import type { ModelArtifactBundle } from '../models/artifacts.ts'
/** GAN-3: sesión del generador entrenado. Worker preferente, fallback previo al inicio. */
import type { GanConfig } from './architecture.ts'
import type { GanImageDataset } from './imageDataset.ts'
import type { GanGeneratedBatch, GanSampleCount } from './generation.ts'
import type { TrainedGanGenerator } from './trainEngine.ts'
import type { GanExportReply, GanGenerationReply, GanTrainOptions, GanTrainingEvent, GanWorkerCommand } from './trainingTypes.ts'

export interface GanTrainingSession {
  cancel: () => void
  generate: (count: GanSampleCount) => Promise<GanGeneratedBatch>
  exportModel: () => Promise<ModelArtifactBundle>
  dispose: () => void
}

export function startGanTraining(
  dataset: GanImageDataset, config: GanConfig, options: GanTrainOptions,
  emit: (event: GanTrainingEvent) => void,
): GanTrainingSession {
  let worker: Worker | null = null
  let controller: AbortController | null = null
  let trained: TrainedGanGenerator | null = null
  let disposed = false
  let stopping = false
  let terminal = false
  let completed = false
  let started = false
  let fallbackStarted = false
  let requestCounter = 0
  const pendingExport = new Map<number, { resolve: (bundle: ModelArtifactBundle) => void; reject: (error: Error) => void }>()
  const pending = new Map<number, { resolve: (batch: GanGeneratedBatch) => void; reject: (error: Error) => void }>()

  /** Descartar respuestas tardías o que dependan de un modelo ya liberado. */
  const rejectPending = (message: string) => {
    for (const request of pending.values()) request.reject(new Error(message))
    pending.clear()
    for (const request of pendingExport.values()) request.reject(new Error(message))
    pendingExport.clear()
  }
  const cleanup = (message: string) => {
    rejectPending(message)
    worker?.terminate(); worker = null
    trained?.dispose(); trained = null
    controller?.abort(); controller = null
  }
  const deliver = (event: GanTrainingEvent) => {
    if (disposed || terminal) return
    if (event.type === 'status') started = true
    if (event.type === 'completed') { terminal = true; completed = true }
    if (event.type === 'cancelled' || event.type === 'error') {
      terminal = true
      cleanup('No hay generador entrenado disponible.')
    }
    emit(event)
  }

  /** Fallback: no repetir una ejecución que ya comenzó dentro del Worker. */
  const runMain = () => {
    if (disposed || stopping || terminal || fallbackStarted) {
      if (stopping && !disposed && !terminal) deliver({ type: 'cancelled' })
      return
    }
    fallbackStarted = true
    controller = new AbortController()
    void import('./trainEngine.ts').then(({ trainGanModel }) => {
      if (disposed || stopping || terminal) {
        if (!disposed && !terminal) deliver({ type: 'cancelled' })
        return
      }
      return trainGanModel(dataset, config, options, deliver, () => stopping, controller!.signal, 'main',
        (runtime) => {
          if (disposed || stopping) runtime.dispose()
          else trained = runtime
        })
    }).catch((cause: unknown) => {
      deliver({ type: 'error', message: cause instanceof Error ? cause.message : 'No se pudo iniciar GAN.' })
    })
  }

  const workerFailure = () => {
    const wasCompleted = completed
    worker?.terminate(); worker = null
    rejectPending('El Worker GAN dejó de estar disponible. Debes volver a entrenar.')
    if (disposed) return
    if (wasCompleted) return // No se permite fallback con pesos perdidos.
    if (terminal) return
    if (stopping) { deliver({ type: 'cancelled' }); return }
    if (!started) runMain()
    else deliver({ type: 'error', message: 'El Worker GAN falló después de iniciar entrenamiento. No se reiniciará automáticamente.' })
  }

  try {
    worker = new Worker(new URL('../../workers/gan.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (message: MessageEvent<GanTrainingEvent | GanGenerationReply | GanExportReply>) => {
      const event = message.data
      if (event.type === 'model-exported' || event.type === 'model-export-error') {
        const request = pendingExport.get(event.requestId)
        if (!request) return
        pendingExport.delete(event.requestId)
        if (event.type === 'model-exported') request.resolve(event.bundle)
        else request.reject(new Error(event.message))
      } else if (event.type === 'generated' || event.type === 'generation-error') {
        const request = pending.get(event.requestId)
        if (!request) return
        pending.delete(event.requestId)
        if (event.type === 'generated') request.resolve(event.batch)
        else request.reject(new Error(event.message))
      } else deliver(event)
    }
    worker.onerror = workerFailure
    worker.onmessageerror = workerFailure
    // Transferir una COPIA: las imágenes del CSV continúan disponibles para vista previa.
    const copiedPixels = new Uint8Array(dataset.pixels)
    const command = { type: 'start', dataset: { ...dataset, pixels: copiedPixels }, config, options } satisfies GanWorkerCommand
    worker.postMessage(command, [copiedPixels.buffer])
  } catch {
    worker?.terminate(); worker = null
    runMain()
  }

  return {
    cancel: () => {
      if (disposed || terminal || stopping) return
      stopping = true
      controller?.abort()
      if (worker) {
        try { worker.postMessage({ type: 'cancel' } satisfies GanWorkerCommand) }
        catch { workerFailure() }
      } else if (!started) deliver({ type: 'cancelled' })
    },
    generate: (count) => {
      if (disposed || !completed) return Promise.reject(new Error('Primero debes completar un entrenamiento GAN.'))
      if (trained) return trained.generate(count) // Fallback: misma instancia G.
      if (!worker) return Promise.reject(new Error('El Worker perdió el generador entrenado. Vuelve a entrenar.'))
      const currentWorker = worker
      return new Promise<GanGeneratedBatch>((resolve, reject) => {
        const requestId = ++requestCounter
        pending.set(requestId, { resolve, reject })
        try { currentWorker.postMessage({ type: 'generate', requestId, count } satisfies GanWorkerCommand) }
        catch (cause) {
          pending.delete(requestId)
          reject(cause instanceof Error ? cause : new Error('No se pudo solicitar la generación GAN.'))
        }
      })
    },
    exportModel: () => {
      if (disposed || !completed) return Promise.reject(new Error('Primero completa un entrenamiento GAN.'))
      if (trained) return trained.exportModel()
      if (!worker) return Promise.reject(new Error('Se perdió el generador GAN entrenado.'))
      const currentWorker = worker
      return new Promise<ModelArtifactBundle>((resolve, reject) => {
        const requestId = ++requestCounter
        pendingExport.set(requestId, { resolve, reject })
        try { currentWorker.postMessage({ type: 'export-model', requestId } satisfies GanWorkerCommand) }
        catch (cause) {
          pendingExport.delete(requestId)
          reject(cause instanceof Error ? cause : new Error('No se pudo solicitar la exportación GAN.'))
        }
      })
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      stopping = true
      cleanup('La sesión GAN terminó y se liberaron los pesos.')
    },
  }
}
