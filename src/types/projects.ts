// Contratos de Fase 2: los datos provienen de PostgreSQL; nunca se guardan como base de datos local.
export type ProjectStatus = 'active' | 'archived'
export type ProjectRole = 'responsible' | 'engineer' | 'reviewer' | 'reader'

export interface Project {
  id: string
  name: string
  description: string
  owner_id: string
  status: ProjectStatus
  created_at: string
  updated_at: string
}

export interface ProjectMember {
  user_id: string
  email: string
  display_name: string
  role: ProjectRole
  created_at: string
}

export const projectRoleLabels: Record<ProjectRole, string> = {
  responsible: 'Responsable',
  engineer: 'Ingeniero/analista',
  reviewer: 'Revisor',
  reader: 'Lector',
}

export const projectRoles: ProjectRole[] = ['responsible', 'engineer', 'reviewer', 'reader']
