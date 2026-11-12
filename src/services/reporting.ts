import { supabase } from '../lib/supabase'

export type ProjectReportSnapshot = {
  project: { id: string; name: string; description: string; status: string; created_at: string }
  totals: { architectures: number; datasets: number; runs: number; versions: number }
  architectures: Array<{ id: string; name: string; version: number; config_json: Record<string, unknown>; created_at: string }>
  datasets: Array<{ id: string; name: string; version: number; target_column: string; problem_type: string; row_count: number; created_at: string }>
  runs: Array<{ family: string; id: string; architecture_id: string; dataset_id: string; problem_type: string; status: string; epochs_planned: number; completed_epochs: number; backend: string | null; created_at: string }>
  evaluations: Array<{ run_id: string; metrics_json: Record<string, unknown> }>
  versions: Array<{ id: string; model_id: string; version: number; created_at: string }>
}

export type AuditEvent = {
  id: number
  actor_id: string
  project_id: string | null
  action: string
  resource_type: string
  resource_id: string
  created_at: string
  metadata_json: Record<string, unknown>
}

export const AUDIT_PAGE_SIZE = 15
export const EXPORT_LIMIT = 200

// El Admin solo consulta hechos administrativos; las políticas RLS del servidor
// siguen limitando los datos, aunque se manipule JavaScript en el navegador.
const ADMIN_AUDIT_ACTIONS = [
  'project_created', 'project_updated', 'project_archived', 'project_restored',
  'member_added', 'member_role_changed', 'member_removed',
  'admin_user_created', 'admin_user_activated', 'admin_user_deactivated',
  'admin_password_reset', 'audit_export_requested',
] as const

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  project_created: 'Proyecto creado', project_updated: 'Proyecto actualizado',
  project_archived: 'Proyecto archivado', project_restored: 'Proyecto restaurado', member_added: 'Integrante agregado',
  member_role_changed: 'Rol modificado', member_removed: 'Integrante retirado',
  training_started: 'Entrenamiento iniciado', training_completed: 'Entrenamiento finalizado',
  training_failed: 'Entrenamiento fallido', training_cancelled: 'Entrenamiento cancelado',
  training_interrupted: 'Entrenamiento interrumpido', training_evaluated: 'Modelo evaluado',
  model_published: 'Modelo publicado', model_reviewed: 'Versión revisada',
  model_approved: 'Versión aprobada', model_rejected: 'Versión rechazada',
  model_retired: 'Versión retirada', admin_user_created: 'Cuenta creada',
  admin_user_activated: 'Cuenta activada', admin_user_deactivated: 'Cuenta desactivada',
  admin_password_reset: 'Contraseña restablecida',
  report_export_requested: 'Exportación de reporte solicitada',
  audit_export_requested: 'Exportación de auditoría solicitada',
}

function client() {
  if (!supabase) throw new Error('Supabase no está configurado.')
  return supabase
}

/** El Admin global no hereda acceso a datos técnicos: se exige membresía. */
export async function requireProjectMember(projectId: string, userId: string): Promise<string> {
  const { data, error } = await client().from('project_members')
    .select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle()
  if (error) throw new Error(`No se pudo comprobar la membresía: ${error.message}`)
  if (!data?.role) throw new Error('No tienes acceso técnico a este proyecto.')
  return data.role as string
}

/** Instantánea acotada; los totales son de DB, las tablas muestran hasta 200 filas recientes. */
export async function loadProjectReport(projectId: string, userId: string): Promise<ProjectReportSnapshot> {
  await requireProjectMember(projectId, userId)
  const [project, architectures, datasets, runs, evaluations, versions] = await Promise.all([
    client().from('projects').select('id,name,description,status,created_at').eq('id', projectId).single(),
    client().from('architectures').select('id,name,version,config_json,created_at', { count: 'exact' })
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(EXPORT_LIMIT),
    client().from('datasets').select('id,name,version,target_column,problem_type,row_count,created_at', { count: 'exact' })
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(EXPORT_LIMIT),
    client().from('training_runs').select('id,architecture_id,dataset_id,problem_type,status,epochs_planned,completed_epochs,backend,created_at,architectures!inner(family)', { count: 'exact' })
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(EXPORT_LIMIT),
    client().from('run_evaluations').select('run_id,metrics_json')
      .eq('project_id', projectId).order('evaluated_at', { ascending: false }).limit(EXPORT_LIMIT),
    client().from('model_versions').select('id,model_id,version,created_at', { count: 'exact' })
      .eq('project_id', projectId).order('created_at', { ascending: false }).limit(EXPORT_LIMIT),
  ])
  for (const result of [project, architectures, datasets, runs, evaluations, versions]) {
    if (result.error) throw new Error(`No se pudo construir el reporte: ${result.error.message}`)
  }
  if (!project.data) throw new Error('Proyecto no disponible.')
  return {
    project: project.data,
    totals: {
      architectures: architectures.count ?? 0, datasets: datasets.count ?? 0,
      runs: runs.count ?? 0, versions: versions.count ?? 0,
    },
    architectures: (architectures.data ?? []) as ProjectReportSnapshot['architectures'],
    datasets: (datasets.data ?? []) as ProjectReportSnapshot['datasets'],
    // Evita inferir familia desde problem_type: RNN también tiene regresión/binaria/multiclase.
    runs: ((runs.data ?? []) as unknown as Array<Omit<ProjectReportSnapshot['runs'][number], 'family'> & {
      architectures: { family: string } | null
    }>).map(({ architectures: architecture, ...run }) => ({ ...run, family: architecture?.family ?? 'desconocida' })),
    evaluations: (evaluations.data ?? []) as ProjectReportSnapshot['evaluations'],
    versions: (versions.data ?? []) as ProjectReportSnapshot['versions'],
  }
}

export type AuditFilter = { action: string; fromDate: string }

/** Solo se devuelven columnas no sensibles. metadata_json se conserva para filtros y no se imprime. */
export async function listAuditEvents(
  projectId: string | null,
  page: number,
  filter: AuditFilter,
  limit = AUDIT_PAGE_SIZE,
): Promise<{ events: AuditEvent[]; total: number }> {
  if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > EXPORT_LIMIT) {
    throw new Error('Paginación de auditoría inválida.')
  }
  if (filter.action && !Object.hasOwn(AUDIT_ACTION_LABELS, filter.action)) {
    throw new Error('Filtro de acción inválido.')
  }
  if (filter.fromDate && !/^\d{4}-\d{2}-\d{2}$/.test(filter.fromDate)) {
    throw new Error('Fecha de auditoría inválida.')
  }
  let query = client().from('audit_events')
    .select('id,actor_id,project_id,action,resource_type,resource_id,created_at,metadata_json', { count: 'exact' })
  if (projectId) query = query.eq('project_id', projectId)
  else query = query.in('action', [...ADMIN_AUDIT_ACTIONS])
  if (filter.action) query = query.eq('action', filter.action)
  if (filter.fromDate) query = query.gte('created_at', `${filter.fromDate}T00:00:00Z`)
  const start = (page - 1) * limit
  const { data, count, error } = await query.order('created_at', { ascending: false })
    .order('id', { ascending: false }).range(start, start + limit - 1)
  if (error) throw new Error(`No se pudo consultar auditoría: ${error.message}`)
  return { events: (data ?? []) as AuditEvent[], total: count ?? 0 }
}

/** RPC: autorización real, inserción append-only y registro de intención de exportar. */
export async function recordExport(projectId: string | null, kind: 'report_csv' | 'report_pdf' | 'audit_csv'): Promise<void> {
  const { error } = await client().rpc('record_report_export', { p_project_id: projectId, p_kind: kind })
  if (error) throw new Error(`Exportación no autorizada o no registrada: ${error.message}`)
}
