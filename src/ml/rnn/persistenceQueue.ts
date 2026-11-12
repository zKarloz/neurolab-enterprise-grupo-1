/** Cola de confirmaciones PostgreSQL RNN-4B: runtime → épocas → test → estado final. */
import type { RnnEpochMetrics } from './trainingTypes.ts'
import type { RnnTestEvaluation } from './evaluation.ts'
import type { RnnDatasetOptions } from './sequenceDataset.ts'

export type RnnTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface RnnPersistenceAdapter {
  runtime: (id: string, backend: string, context: 'worker' | 'main', version: string) => Promise<void>
  epoch: (id: string, metrics: RnnEpochMetrics) => Promise<void>
  evaluation: (id: string, kind: RnnDatasetOptions['problemType'], report: RnnTestEvaluation) => Promise<void>
  finish: (id: string, status: RnnTerminalStatus, durationMs?: number, message?: string) => Promise<void>
}
export interface RnnQueueNotifications {
  epochConfirmed: (epoch: number) => void
  evaluationConfirmed: () => void
  finishedConfirmed: (status: RnnTerminalStatus) => void
  failed: (message: string) => void
}

/** La cola no sustituye métricas faltantes ni reintenta escrituras no idempotentes. */
export function createRnnPersistenceQueue(id: string, adapter: RnnPersistenceAdapter,
  notify: RnnQueueNotifications) {
  let chain: Promise<void> = Promise.resolve()
  let failed = false
  let terminalQueued = false
  let runtimeQueued = false
  let evaluationQueued = false
  let expectedEpoch = 1

  const queue = (operation: () => Promise<void>) => {
    chain = chain.then(async () => { if (!failed) await operation() }).catch(async (cause: unknown) => {
      if (failed) return
      failed = true
      terminalQueued = true
      const message = cause instanceof Error ? cause.message : 'Supabase rechazó la escritura RNN.'
      // Mejor esfuerzo: impedir una ejecución huérfana; nunca indicar falso éxito.
      try {
        await adapter.finish(id, 'failed', undefined, message)
        notify.failed(`${message} La ejecución fue marcada como fallida.`)
      } catch (finalCause) {
        const why = finalCause instanceof Error ? finalCause.message : 'Sin confirmación del cierre.'
        notify.failed(`${message} No se confirmó el cierre remoto (${why}); revisa Supabase.`)
      }
    })
  }
  return {
    get terminalQueued() { return terminalQueued },
    get hasFailed() { return failed },
    idle: async () => { await chain },
    runtime: (backend: string, context: 'worker' | 'main', version: string) => {
      if (runtimeQueued || terminalQueued) return
      runtimeQueued = true
      queue(() => adapter.runtime(id, backend, context, version))
    },
    epoch: (metrics: RnnEpochMetrics) => {
      if (terminalQueued) return
      // Orden local y PostgreSQL deben coincidir incluso con eventos fuera de orden.
      if (metrics.epoch !== expectedEpoch) {
        queue(() => Promise.reject(new Error(`Época RNN fuera de orden: ${metrics.epoch}.`)))
        return
      }
      expectedEpoch++
      queue(async () => { await adapter.epoch(id, metrics); notify.epochConfirmed(metrics.epoch) })
    },
    evaluation: (kind: RnnDatasetOptions['problemType'], report: RnnTestEvaluation) => {
      if (terminalQueued || evaluationQueued) return
      evaluationQueued = true
      queue(async () => { await adapter.evaluation(id, kind, report); notify.evaluationConfirmed() })
    },
    finish: (status: RnnTerminalStatus, durationMs?: number, message?: string) => {
      if (terminalQueued) return
      terminalQueued = true
      queue(async () => { await adapter.finish(id, status, durationMs, message); notify.finishedConfirmed(status) })
    },
  }
}
export type RnnPersistenceQueue = ReturnType<typeof createRnnPersistenceQueue>
