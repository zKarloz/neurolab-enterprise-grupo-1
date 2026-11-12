import { supabase } from '../lib/supabase'
import { listProjects } from './projects'
import type { Project } from '../types/projects'
import type { DashboardCounters, DashboardRun } from '../features/home/dashboardLogic'
import { filterVisibleRuns } from '../features/home/dashboardLogic'

export interface DashboardSnapshot {
  projects: Project[]
  runs: DashboardRun[]
  architectureFamilies: Record<string, string>
  counters: DashboardCounters
  refreshedAt: string
}

function client() {
  if (!supabase) throw new Error('No se ha configurado Supabase.')
  return supabase
}

function requireCount(count: number | null, error: { message: string } | null): number {
  if (error || count === null) throw new Error('No se pudieron consultar los indicadores de entrenamientos.')
  return count
}

// Las consultas head/count se procesan en PostgreSQL y respetan las políticas RLS.
// No contamos solo las filas de una página, pues produciría indicadores incompletos.
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const db = client()
  const projects = await listProjects()
  const now = Date.now()
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const staleThreshold = new Date(now - 60 * 60 * 1000).toISOString()

  // No hay escrituras, RPC privilegiadas ni bypass de RLS: solo metadatos autorizados.
  const [active, queued, completed, recentCount, errors, stale, recentRows] = await Promise.all([
    db.from('training_runs').select('id', { count: 'exact', head: true }).in('status', ['preparing', 'running']),
    db.from('training_runs').select('id', { count: 'exact', head: true }).eq('status', 'created'),
    db.from('training_runs').select('id', { count: 'exact', head: true }).eq('status', 'completed').gte('updated_at', thirtyDaysAgo),
    db.from('training_runs').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    db.from('training_runs').select('id', { count: 'exact', head: true }).in('status', ['failed', 'interrupted']).gte('updated_at', sevenDaysAgo),
    db.from('training_runs').select('id', { count: 'exact', head: true }).in('status', ['preparing', 'running']).lt('updated_at', staleThreshold),
    db.from('training_runs')
      .select('id,project_id,architecture_id,status,completed_epochs,epochs_planned,created_at,updated_at')
      .order('created_at', { ascending: false }).limit(32),
  ])

  if (recentRows.error || !recentRows.data) {
    throw new Error('No se pudo consultar el historial reciente de entrenamientos.')
  }
  const counters: DashboardCounters = {
    activeRuns: requireCount(active.count, active.error),
    queuedRuns: requireCount(queued.count, queued.error),
    completedLast30Days: requireCount(completed.count, completed.error),
    runsLast30Days: requireCount(recentCount.count, recentCount.error),
    failedOrInterruptedLast7Days: requireCount(errors.count, errors.error),
    possiblyStaleRuns: requireCount(stale.count, stale.error),
  }

  const runs = filterVisibleRuns(recentRows.data as DashboardRun[], projects.map((project) => project.id))
  const architectureIds = [...new Set(runs.map((run) => run.architecture_id))]
  const architectureFamilies: Record<string, string> = {}
  if (architectureIds.length) {
    const { data, error } = await db.from('architectures')
      .select('id,family').in('id', architectureIds)
    if (error) throw new Error('No se pudo consultar la familia de los entrenamientos recientes.')
    for (const architecture of data ?? []) architectureFamilies[architecture.id] = architecture.family
  }

  return { projects, runs, architectureFamilies, counters, refreshedAt: new Date().toISOString() }
}
