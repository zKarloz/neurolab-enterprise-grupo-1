/** GAN-4B: cliente de RPC protegidas. Solo envía metadatos y métricas agregadas. */
import { supabase } from '../lib/supabase.ts'
import type { GanImageDataset } from '../ml/gan/imageDataset.ts'
import type { GanConfig } from '../ml/gan/architecture.ts'
import type { GanEpochMetrics, GanTrainOptions } from '../ml/gan/trainingTypes.ts'
import type { GanGeneratedBatch } from '../ml/gan/generation.ts'
import {
  ganRunPayload, ganEpochPayload, ganGenerationSummaryPayload, type GanSourceIdentity,
} from '../ml/gan/persistencePayload.ts'
import { recordBackend, type FinalRunStatus } from './trainingPersistence.ts'

function client() {
  if (!supabase) throw new Error('Supabase no está configurado para persistir GAN.')
  return supabase
}

/** Debe ejecutarse ANTES de inicializar la sesión de entrenamiento TF.js. */
export async function createGanRun(projectId: string, source: GanSourceIdentity,
  dataset: GanImageDataset, architecture: GanConfig, options: GanTrainOptions): Promise<string> {
  const { data, error } = await client().rpc('create_gan_training_run',
    ganRunPayload(projectId, source, dataset, architecture, options))
  if (error) throw new Error(`No se pudo registrar la ejecución GAN: ${error.message}`)
  if (typeof data !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data)) {
    throw new Error('La RPC no devolvió un UUID de ejecución GAN válido.')
  }
  return data
}

/** Reutiliza set_training_runtime de F3 para created → running. */
export async function recordGanRuntime(runId: string, backend: string,
  context: 'worker' | 'main', tfjsVersion: string): Promise<void> {
  await recordBackend(runId, backend, context, tfjsVersion)
}

export async function recordGanEpoch(runId: string, metrics: GanEpochMetrics): Promise<void> {
  const { error } = await client().rpc('record_gan_training_epoch', ganEpochPayload(runId, metrics))
  if (error) throw new Error(`No se confirmó la época GAN ${metrics.epoch}: ${error.message}`)
}

export async function finishGanRun(runId: string, status: FinalRunStatus,
  durationMs?: number, errorMessage?: string): Promise<void> {
  const { error } = await client().rpc('finish_training_run', {
    p_run_id: runId, p_status: status,
    p_duration_ms: durationMs === undefined ? null : Math.round(durationMs),
    p_error_summary: errorMessage?.slice(0, 500) ?? null,
  })
  if (error) throw new Error(`No se confirmó el cierre GAN: ${error.message}`)
}

/** Solo el primer lote de imágenes generadas puede guardar un resumen por ejecución. */
export async function recordGanSummary(runId: string, batch: GanGeneratedBatch): Promise<void> {
  const { error } = await client().rpc('record_gan_generation_summary',
    ganGenerationSummaryPayload(runId, batch))
  if (error) throw new Error(`No se confirmó el resumen de generación GAN: ${error.message}`)
}
