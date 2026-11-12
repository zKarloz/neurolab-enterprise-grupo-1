/// <reference lib="webworker" />
/** GAN-3: un generador entrenado permanece en el Worker hasta terminar la sesión. */
import { trainGanModel, type TrainedGanGenerator } from '../ml/gan/trainEngine.ts'
import type { GanExportReply, GanGenerationReply, GanWorkerCommand, GanTrainingEvent } from '../ml/gan/trainingTypes.ts'

declare const self: DedicatedWorkerGlobalScope
let running = false
let stopping = false
let controller: AbortController | null = null
let trained: TrainedGanGenerator | null = null

self.onmessage = (event: MessageEvent<GanWorkerCommand>) => {
  const command = event.data
  if (command.type === 'cancel') {
    if (running) { stopping = true; controller?.abort() }
    return
  }
  if (command.type === 'generate') {
    if (running || !trained) {
      self.postMessage({ type: 'generation-error', requestId: command.requestId,
        message: 'Primero completa un entrenamiento GAN.' } satisfies GanGenerationReply)
      return
    }
    void trained.generate(command.count).then((batch) => {
      // Transferencia de bytes sintéticos; nunca se envían los pesos ni el CSV.
      self.postMessage({ type: 'generated', requestId: command.requestId, batch } satisfies GanGenerationReply,
        [batch.pixels.buffer])
    }).catch((cause: unknown) => {
      self.postMessage({ type: 'generation-error', requestId: command.requestId,
        message: cause instanceof Error ? cause.message : 'Error al generar imágenes.' } satisfies GanGenerationReply)
    })
    return
  }
  // Exportar pesos a petición expresa, sin cerrar el Worker ni enviar imágenes.
  if (command.type === 'export-model') {
    if (running || !trained) {
      self.postMessage({ type: 'model-export-error', requestId: command.requestId,
        message: 'No hay generador GAN completado para exportar.' } satisfies GanExportReply)
      return
    }
    void trained.exportModel().then((bundle) => {
      self.postMessage({ type: 'model-exported', requestId: command.requestId, bundle } satisfies GanExportReply,
        [bundle.weightData])
    }).catch((cause: unknown) => {
      self.postMessage({ type: 'model-export-error', requestId: command.requestId,
        message: cause instanceof Error ? cause.message : 'No se pudo exportar el generador GAN.' } satisfies GanExportReply)
    })
    return
  }
  if (running || trained) return
  running = true
  stopping = false
  controller = new AbortController()
  void trainGanModel(command.dataset, command.config, command.options,
    (message: GanTrainingEvent) => self.postMessage(message), () => stopping, controller!.signal, 'worker',
    (runtime) => { trained = runtime })
    .catch((cause: unknown) => {
      trained?.dispose(); trained = null
      self.postMessage({ type: 'error', message: cause instanceof Error ? cause.message : 'Error del Worker GAN.' } satisfies GanTrainingEvent)
    })
    .finally(() => { controller = null; running = false })
}
