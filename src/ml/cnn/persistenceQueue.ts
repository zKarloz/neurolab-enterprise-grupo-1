/** Cola secuencial CNN: conserva el orden de las confirmaciones PostgreSQL. */
import type { CnnEvaluation } from './cnnEvaluation.ts'
import type { CnnEpochMetrics } from './trainingTypes.ts'

export type CnnRunTerminal = 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface CnnPersistenceAdapter {
  runtime: (runId: string, backend: string, context: 'worker' | 'main', tfjsVersion: string) => Promise<void>
  epoch: (runId: string, metrics: CnnEpochMetrics) => Promise<void>
  evaluation: (runId: string, evaluation: CnnEvaluation) => Promise<void>
  finish: (runId: string, status: CnnRunTerminal, durationMs?: number, message?: string) => Promise<void>
}
export interface CnnQueueNotifications {
  epochConfirmed: (epoch: number) => void
  evaluationConfirmed: () => void
  finishedConfirmed: (status: CnnRunTerminal) => void
  failed: (message: string) => void
}

/** Ninguna operación posterior se ejecuta tras una confirmación fallida. */
export function createCnnPersistenceQueue(runId: string, adapter: CnnPersistenceAdapter,
  notifications: CnnQueueNotifications) {
  let chain: Promise<void> = Promise.resolve()
  let failed = false
  let terminalQueued = false
  let runtimeQueued = false
  let evaluationQueued = false
  function queue(operation: () => Promise<void>) {
    chain = chain.then(async () => { if (!failed) await operation() }).catch((cause: unknown) => {
      if (failed) return
      failed = true
      notifications.failed(cause instanceof Error ? cause.message : 'Supabase no confirmó la escritura CNN.')
    })
  }
  return {
    get terminalQueued() { return terminalQueued },
    get hasFailed() { return failed },
    idle: async () => { await chain },
    runtime: (backend: string, context: 'worker' | 'main', version: string) => {
      if (runtimeQueued || terminalQueued) return
      runtimeQueued = true
      queue(() => adapter.runtime(runId, backend, context, version))
    },
    epoch: (metrics: CnnEpochMetrics) => {
      if (terminalQueued) return
      queue(async () => { await adapter.epoch(runId, metrics); notifications.epochConfirmed(metrics.epoch) })
    },
    evaluation: (report: CnnEvaluation) => {
      if (evaluationQueued || terminalQueued) return
      evaluationQueued = true
      queue(async () => { await adapter.evaluation(runId, report); notifications.evaluationConfirmed() })
    },
    finish: (status: CnnRunTerminal, durationMs?: number, message?: string) => {
      if (terminalQueued) return
      terminalQueued = true
      queue(async () => { await adapter.finish(runId, status, durationMs, message); notifications.finishedConfirmed(status) })
    },
  }
}
export type CnnPersistenceQueue = ReturnType<typeof createCnnPersistenceQueue>
