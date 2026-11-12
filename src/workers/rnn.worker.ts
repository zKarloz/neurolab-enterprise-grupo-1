/// <reference lib="webworker" />
/** Worker RNN-3: el modelo se conserva para inferir hasta dispose/terminate. */
import { trainRnnModel, type RnnTrainedRuntime } from '../ml/rnn/trainEngine.ts'
import type { RnnTrainingEvent, RnnWorkerCommand, RnnPredictionReply } from '../ml/rnn/trainingTypes.ts'

declare const self: DedicatedWorkerGlobalScope
let running = false
let stopping = false
let abort: AbortController | null = null
let runtime: RnnTrainedRuntime | null = null

self.onmessage = (event: MessageEvent<RnnWorkerCommand>) => {
  const command = event.data
  if (command.type === 'cancel') {
    if (running) { stopping = true; abort?.abort() }
    return
  }
  if (command.type === 'export-model') {
    if (running || !runtime) {
      self.postMessage({ type: 'model-export-error', requestId: command.requestId, message: 'RNN no disponible para exportar.' } satisfies RnnPredictionReply)
      return
    }
    // Evitar copiar pesos grandes: el ArrayBuffer se transfiere al hilo de UI.
    void runtime.exportModel().then((bundle) => {
      self.postMessage({ type: 'model-exported', requestId: command.requestId, bundle } satisfies RnnPredictionReply, [bundle.weightData])
    }).catch((cause: unknown) => {
      self.postMessage({ type: 'model-export-error', requestId: command.requestId,
        message: cause instanceof Error ? cause.message : 'No se pudo exportar la RNN.' } satisfies RnnPredictionReply)
    })
    return
  }
  if (command.type === 'predict') {
    if (running || !runtime) {
      self.postMessage({ type: 'prediction_error', requestId: command.requestId, message: 'Modelo RNN no disponible.' } satisfies RnnPredictionReply)
      return
    }
    void runtime.predict(command.seriesId).then((result) => {
      self.postMessage({ type: 'prediction', requestId: command.requestId, result } satisfies RnnPredictionReply)
    }).catch((cause: unknown) => {
      self.postMessage({ type: 'prediction_error', requestId: command.requestId,
        message: cause instanceof Error ? cause.message : 'No se pudo predecir.' } satisfies RnnPredictionReply)
    })
    return
  }
  if (running) return
  runtime?.dispose(); runtime = null
  running = true; stopping = false; abort = new AbortController()
  void trainRnnModel(command.table, command.datasetOptions, command.config, command.options,
    (message: RnnTrainingEvent) => self.postMessage(message), () => stopping, abort!.signal, 'worker',
    (next) => { runtime = next })
    .catch((cause: unknown) => self.postMessage({ type: 'error', message: cause instanceof Error ? cause.message : 'Worker RNN falló.' } satisfies RnnTrainingEvent))
    .finally(() => { running = false; abort = null })
}
