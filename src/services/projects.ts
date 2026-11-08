import { supabase } from '../lib/supabase'
import type { Project, ProjectMember, ProjectRole } from '../types/projects'

// La capa de servicios centraliza Supabase y evita acoplar componentes React a detalles de RPC.
function client() {
  if (!supabase) throw new Error('No se ha configurado Supabase.')
  return supabase
}

function confirmed<T>(data: T | null, error: { message: string; code?: string } | null): T {
  if (error) {
    if (error.code === '42501' || error.code === 'PGRST301') {
      throw new Error('No tienes permisos para realizar esta operación.')
    }
    if (error.code === '23505') throw new Error('El registro ya existe.')
    if (error.code === '22023') throw new Error(error.message)
    throw new Error('No se pudo completar la operación en Supabase. Comprueba tu conexión e inténtalo nuevamente.')
  }
  if (data === null) throw new Error('Supabase no confirmó los datos de esta operación.')
  return data
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await client().from('projects')
    .select('id,name,description,owner_id,status,created_at,updated_at')
    .order('created_at', { ascending: false })
  return confirmed(data, error) as Project[]
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await client().from('projects')
    .select('id,name,description,owner_id,status,created_at,updated_at')
    .eq('id', id).maybeSingle()
  if (error) confirmed(null, error)
  return data as Project | null
}

export async function createProject(name: string, description: string): Promise<string> {
  const { data, error } = await client().rpc('create_project', {
    p_name: name,
    p_description: description,
  })
  return confirmed(data, error) as string
}

// En escrituras void, Supabase devuelve data=null al tener éxito: comprobar error, no data.
async function write(rpcResult: PromiseLike<{ error: { message: string; code?: string } | null }>): Promise<void> {
  const { error } = await rpcResult
  if (error) confirmed(null, error)
}

export async function updateProject(id: string, name: string, description: string): Promise<void> {
  await write(client().rpc('update_project', {
    p_project_id: id, p_name: name, p_description: description,
  }))
}

export async function archiveProject(id: string): Promise<void> {
  await write(client().rpc('archive_project', { p_project_id: id }))
}

export async function listMembers(id: string): Promise<ProjectMember[]> {
  const { data, error } = await client().rpc('list_project_members', { p_project_id: id })
  return confirmed(data, error) as ProjectMember[]
}

export async function addMember(id: string, email: string, role: ProjectRole): Promise<void> {
  await write(client().rpc('add_project_member', {
    p_project_id: id, p_email: email, p_role: role,
  }))
}

export async function changeMemberRole(id: string, userId: string, role: ProjectRole): Promise<void> {
  await write(client().rpc('change_project_member_role', {
    p_project_id: id, p_user_id: userId, p_role: role,
  }))
}

export async function removeMember(id: string, userId: string): Promise<void> {
  await write(client().rpc('remove_project_member', { p_project_id: id, p_user_id: userId }))
}

// Únicamente roles propios. Permite mostrar el botón «Nuevo proyecto» con el mismo
// criterio general que la base (Admin global o Responsable de al menos un proyecto activo).
export async function listResponsibleProjectIds(userId: string): Promise<string[]> {
  const { data, error } = await client().from('project_members')
    .select('project_id').eq('user_id', userId).eq('role', 'responsible')
  return (confirmed(data, error) as { project_id: string }[]).map(({ project_id }) => project_id)
}
