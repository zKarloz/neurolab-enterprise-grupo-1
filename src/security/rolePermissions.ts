import type { ProjectRole, ProjectStatus } from '../types/projects'

/**
 * Matriz orientativa de las capacidades implementadas en NeuroLab.
 * IMPORTANTE: no es un sistema de autorización. Las políticas RLS y RPC de
 * PostgreSQL, y la Edge Function para Admin, deciden el acceso real.
 *
 * Origen: migraciones 002, 003, 005, 006, 009 y 010.
 */
export type PermissionState = 'allowed' | 'conditional' | 'denied'
export type PermissionKey =
  | 'view_project'
  | 'manage_project'
  | 'manage_members'
  | 'create_project'
  | 'read_technical'
  | 'train_publish'
  | 'review_versions'
  | 'export_reports'
  | 'project_audit'
  | 'global_users'
  | 'global_audit'

export interface RolePermission {
  key: PermissionKey
  title: string
  state: PermissionState
  detail: string
}

export const permissionStateLabels: Record<PermissionState, string> = {
  allowed: 'Permitido',
  conditional: 'Condicionado',
  denied: 'Sin permiso',
}

const rows: ReadonlyArray<{
  key: PermissionKey
  title: string
  byRole: Record<ProjectRole | 'admin', PermissionState>
  detail: string
  activeOnly?: boolean
}> = [
  { key: 'view_project', title: 'Consultar proyecto e integrantes',
    byRole: { responsible: 'allowed', engineer: 'allowed', reviewer: 'allowed', reader: 'allowed', admin: 'allowed' },
    detail: 'El Administrador ve metadatos administrativos de proyectos, aunque no sea integrante.' },
  { key: 'manage_project', title: 'Editar o archivar el proyecto',
    byRole: { responsible: 'allowed', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'allowed' },
    detail: 'Solo sobre proyectos activos; el Administrador puede administrar metadatos.' , activeOnly: true },
  { key: 'manage_members', title: 'Agregar, cambiar o retirar integrantes',
    byRole: { responsible: 'allowed', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'allowed' },
    detail: 'Se protege al propietario, el rol propio y al último Responsable activo.', activeOnly: true },
  { key: 'create_project', title: 'Crear proyectos',
    byRole: { responsible: 'conditional', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'allowed' },
    detail: 'El Responsable puede crear otros proyectos si ya es Responsable de al menos un proyecto activo.' },
  { key: 'read_technical', title: 'Consultar historial, evaluaciones y versiones privadas',
    byRole: { responsible: 'allowed', engineer: 'allowed', reviewer: 'allowed', reader: 'allowed', admin: 'conditional' },
    detail: 'El Administrador necesita membresía explícita en el proyecto para acceder a datos técnicos.' },
  { key: 'train_publish', title: 'Preparar CSV, entrenar y publicar versiones',
    byRole: { responsible: 'denied', engineer: 'allowed', reviewer: 'denied', reader: 'denied', admin: 'conditional' },
    detail: 'Solo el Ingeniero de un proyecto activo; el Administrador requiere también ese rol de proyecto.', activeOnly: true },
  { key: 'review_versions', title: 'Revisar, aprobar, rechazar o retirar versiones',
    byRole: { responsible: 'denied', engineer: 'denied', reviewer: 'conditional', reader: 'denied', admin: 'conditional' },
    detail: 'Requiere rol Revisor, proyecto activo, transición válida y no ser autor, entrenador ni publicador.', activeOnly: true },
  { key: 'export_reports', title: 'Consultar y exportar reportes técnicos CSV/PDF',
    byRole: { responsible: 'allowed', engineer: 'allowed', reviewer: 'allowed', reader: 'allowed', admin: 'conditional' },
    detail: 'Solo para integrantes del proyecto; el Administrador sin membresía no puede exportarlos.' },
  { key: 'project_audit', title: 'Consultar y exportar auditoría del proyecto',
    byRole: { responsible: 'allowed', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'conditional' },
    detail: 'El Responsable ve su proyecto. El Administrador solo ve acciones administrativas; no auditoría técnica ajena.' },
  { key: 'global_users', title: 'Administrar cuentas de la plataforma',
    byRole: { responsible: 'denied', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'allowed' },
    detail: 'Altas, activación/desactivación y restablecimiento a través de la Edge Function protegida.' },
  { key: 'global_audit', title: 'Consultar auditoría administrativa global',
    byRole: { responsible: 'denied', engineer: 'denied', reviewer: 'denied', reader: 'denied', admin: 'allowed' },
    detail: 'No implica acceso a entrenamientos ni modelos de proyectos sin membresía.' },
]

/** Estado del proyecto y condiciones especiales se explican sin conceder acceso. */
export function getRolePermissions(role: ProjectRole | 'admin', projectStatus: ProjectStatus = 'active'): RolePermission[] {
  return rows.map(({ key, title, byRole, detail, activeOnly }) => {
    const state = activeOnly && projectStatus !== 'active' && byRole[role] !== 'denied'
      ? 'denied' : byRole[role]
    const note = activeOnly && projectStatus !== 'active'
      ? `${detail} Este proyecto está archivado, por lo que no admite esa operación.` : detail
    return { key, title, state, detail: note }
  })
}
