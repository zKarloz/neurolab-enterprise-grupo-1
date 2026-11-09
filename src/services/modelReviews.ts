import { supabase } from '../lib/supabase'

/** Estados derivados de eventos, nunca guardados dentro de model_versions. */
export type ReviewStatus = 'draft' | 'reviewed' | 'approved' | 'rejected' | 'retired'
export type ReviewDecision = Exclude<ReviewStatus, 'draft'>

export interface ModelReviewEvent {
  id: number
  project_id: string
  model_version_id: string
  actor_id: string
  decision: ReviewDecision
  resulting_status: ReviewDecision
  note: string
  created_at: string
}

/** Únicas transiciones reconocidas por la interfaz; el RPC las valida de nuevo. */
export const allowedReviewDecisions: Record<ReviewStatus, readonly ReviewDecision[]> = {
  draft: ['reviewed'],
  reviewed: ['approved', 'rejected'],
  approved: ['retired'],
  rejected: [],
  retired: [],
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  draft: 'Borrador',
  reviewed: 'Revisado',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  retired: 'Retirado',
}

export const reviewDecisionLabels: Record<ReviewDecision, string> = {
  reviewed: 'Marcar revisado',
  approved: 'Aprobar versión',
  rejected: 'Rechazar versión',
  retired: 'Retirar aprobación',
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

/** Lee exclusivamente eventos de un proyecto autorizado por la política RLS. */
export async function listModelReviews(projectId: string): Promise<ModelReviewEvent[]> {
  const { data, error } = await client().from('model_review_events')
    .select('id,project_id,model_version_id,actor_id,decision,resulting_status,note,created_at')
    .eq('project_id', projectId).order('id', { ascending: false }).limit(1000)
  if (error) throw new Error(`No se pudieron consultar las revisiones: ${error.message}`)
  return (data ?? []) as ModelReviewEvent[]
}

/** Último estado por versión: las versiones sin eventos se mantienen en borrador. */
export function currentReviewStates(events: readonly ModelReviewEvent[]): Map<string, ReviewStatus> {
  const states = new Map<string, ReviewStatus>()
  for (const event of [...events].sort((a, b) => b.id - a.id)) {
    if (!states.has(event.model_version_id)) states.set(event.model_version_id, event.resulting_status)
  }
  return states
}

/** Solo el RPC cambia el historial. Nunca escribir en model_versions desde React. */
export async function decideModelReview(versionId: string, decision: ReviewDecision, note: string): Promise<ReviewStatus> {
  if (note.trim().length > 1000) throw new Error('El comentario excede 1000 caracteres.')
  if ((decision === 'rejected' || decision === 'retired') && note.trim().length < 10) {
    throw new Error('Debes justificar la decisión con al menos 10 caracteres.')
  }
  const { data, error } = await client().rpc('decide_model_review', {
    p_version_id: versionId, p_decision: decision, p_note: note.trim(),
  })
  if (error) throw new Error(`No fue posible registrar la decisión: ${error.message}`)
  return data as ReviewStatus
}
