/** GAN-4B: serializa runtime → métricas G/D por época → estado final.
 * La generación se registra solo tras confirmación remota de completed.
 */
import { validateGanEpochMetrics, type GanEpochMetrics } from './trainingTypes.ts'
import type { GanGeneratedBatch } from './generation.ts'

export type GanTerminalStatus = 'completed' | 'failed' | 'cancelled' | 'interrupted'
export interface GanPersistenceAdapter {
  runtime: (id: string, backend: string, context: 'worker' | 'main', version: string) => Promise<void>
  epoch: (id: string, metrics: GanEpochMetrics) => Promise<void>
  finish: (id: string, status: GanTerminalStatus, durationMs?: number, message?: string) => Promise<void>
  summary: (id: string, batch: GanGeneratedBatch) => Promise<void>
}
export interface GanQueueNotifications {
  epochConfirmed: (epoch: number) => void
  finishedConfirmed: (status: GanTerminalStatus) => void
  failed: (message: string) => void
}

/** No reintentar RPC no idempotentes ni indicar éxito antes de su respuesta. */
export function createGanPersistenceQueue(runId: string, plannedEpochs: number,
  adapter: GanPersistenceAdapter, notify: GanQueueNotifications) {
  let chain: Promise<void> = Promise.resolve()
  let failed = false
  let terminalQueued = false
  let runtimeQueued = false
  let expectedEpoch = 1
  let completedConfirmed = false
  let summaryAttempted = false

  const enqueue = (operation: () => Promise<void>) => {
    chain = chain.then(async () => { if (!failed) await operation() }).catch(async (cause: unknown) => {
      if (failed) return
      failed = true
      terminalQueued = true
      const message = cause instanceof Error ? cause.message : 'Supabase rechazó la escritura GAN.'
      try {
        await adapter.finish(runId, 'failed', undefined, message)
        notify.failed(`${message} La ejecución quedó marcada como fallida.`)
      } catch (finalCause) {
        const reason = finalCause instanceof Error ? finalCause.message : 'Error desconocido'
        notify.failed(`${message} No se confirmó el cierre remoto (${reason}); revisa Supabase.`)
      }
    })
  }

  return {
    get terminalQueued() { return terminalQueued },
    get hasFailed() { return failed },
    get isCompletedConfirmed() { return completedConfirmed },
    idle: async () => { await chain },
    runtime: (backend: string, context: 'worker' | 'main', version: string) => {
      if (runtimeQueued || terminalQueued) return
      runtimeQueued = true
      enqueue(() => adapter.runtime(runId, backend, context, version))
    },
    epoch: (metrics: GanEpochMetrics) => {
      if (terminalQueued) return
      try {
        validateGanEpochMetrics(metrics)
        if (!runtimeQueued || metrics.epoch !== expectedEpoch || metrics.epoch > plannedEpochs) {
          throw new Error(`Época GAN fuera de orden: ${metrics.epoch}.`)
        }
        expectedEpoch++
        enqueue(async () => { await adapter.epoch(runId, metrics); notify.epochConfirmed(metrics.epoch) })
      } catch (cause) {
        enqueue(() => Promise.reject(cause))
      }
    },
    finish: (status: GanTerminalStatus, durationMs?: number, message?: string) => {
      if (terminalQueued) return
      terminalQueued = true
      enqueue(async () => {
        if (status === 'completed' && (!runtimeQueued || expectedEpoch !== plannedEpochs + 1)) {
          throw new Error('No se permite completar GAN con épocas faltantes.')
        }
        await adapter.finish(runId, status, durationMs, message)
        completedConfirmed = status === 'completed'
        notify.finishedConfirmed(status)
      })
    },
    /** Una sola evaluación numérica por run; si hay error, no se reintenta a ciegas. */
    summary: async (batch: GanGeneratedBatch): Promise<boolean> => {
      await chain
      if (failed || !completedConfirmed) return false
      if (summaryAttempted) return false
      summaryAttempted = true
      await adapter.summary(runId, batch)
      return true
    },
  }
}
export type GanPersistenceQueue = ReturnType<typeof createGanPersistenceQueue>
