// Reglas de presentación del Dashboard M01, independientes de React y Supabase.
// Todas las cifras describen únicamente registros que PostgreSQL permite leer con RLS.
import type { Project } from '../../types/projects'

export type DashboardTrainingStatus =
  | 'created' | 'preparing' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted'

export interface DashboardRun {
  id: string
  project_id: string
  architecture_id: string
  status: DashboardTrainingStatus
  completed_epochs: number
  epochs_planned: number
  created_at: string
  updated_at: string
}

export interface DashboardCounters {
  activeRuns: number
  queuedRuns: number
  completedLast30Days: number
  runsLast30Days: number
  failedOrInterruptedLast7Days: number
  possiblyStaleRuns: number
}

export interface DashboardAlert {
  id: string
  title: string
  detail: string
  severity: 'warning' | 'info'
}

export const trainingStatusLabels: Record<DashboardTrainingStatus, string> = {
  created: 'Registrado',
  preparing: 'Preparando',
  running: 'Ejecutando',
  completed: 'Completado',
  failed: 'Fallido',
  cancelled: 'Cancelado',
  interrupted: 'Interrumpido',
}

// Las familias solo se identifican por la arquitectura registrada, nunca por problem_type.
export function dashboardFamilyLabel(family: string | undefined): string {
  switch (family) {
    case 'feedforward': return 'Feedforward'
    case 'cnn': return 'CNN'
    case 'rnn': return 'RNN'
    case 'gan': return 'GAN'
    default: return 'No disponible'
  }
}

export function countProjectStatuses(projects: Pick<Project, 'status'>[]) {
  return {
    active: projects.filter((project) => project.status === 'active').length,
    archived: projects.filter((project) => project.status === 'archived').length,
  }
}

// Los registros persistidos en estado running no prueban que el Worker siga vivo.
// La alerta de inactividad es orientativa y usa la marca de actualización del servidor.
export function buildDashboardAlerts(counters: DashboardCounters, archivedProjects: number): DashboardAlert[] {
  const alerts: DashboardAlert[] = []
  if (counters.failedOrInterruptedLast7Days > 0) {
    alerts.push({
      id: 'failed', severity: 'warning', title: 'Ejecuciones que requieren revisión',
      detail: `${counters.failedOrInterruptedLast7Days} ejecución(es) fallida(s) o interrumpida(s) en los últimos 7 días.`,
    })
  }
  if (counters.possiblyStaleRuns > 0) {
    alerts.push({
      id: 'stale', severity: 'warning', title: 'Ejecuciones sin actualizaciones recientes',
      detail: `${counters.possiblyStaleRuns} ejecución(es) figuran en curso sin cambios registrados durante al menos 60 minutos. Esto no confirma que el navegador haya dejado de entrenar.`,
    })
  }
  if (counters.queuedRuns > 0) {
    alerts.push({
      id: 'queued', severity: 'info', title: 'Ejecuciones registradas sin iniciar',
      detail: `${counters.queuedRuns} ejecución(es) permanecen en estado «Registrado».`,
    })
  }
  if (archivedProjects > 0) {
    alerts.push({
      id: 'archived', severity: 'info', title: 'Proyectos archivados',
      detail: `${archivedProjects} proyecto(s) archivado(s) siguen visibles para consulta autorizada.`,
    })
  }
  return alerts
}

// La tabla nunca expone ejecuciones pertenecientes a proyectos ausentes del conjunto visible.
export function filterVisibleRuns<T extends Pick<DashboardRun, 'project_id'>>(
  runs: T[], projectIds: readonly string[],
): T[] {
  const allowed = new Set(projectIds)
  return runs.filter((run) => allowed.has(run.project_id))
}
