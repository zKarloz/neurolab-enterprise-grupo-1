import { supabase } from '../lib/supabase'

/** Datos públicos de administración; jamás exponer hashes de contraseña o credenciales. */
export interface ManagedUser {
  id: string
  email: string
  display_name: string
  status: 'active' | 'inactive'
  is_platform_admin: boolean
  created_at: string
}

export interface UsersPage {
  users: ManagedUser[]
  total: number
  page: number
  pageSize: number
}

// El navegador invoca Edge Functions con JWT. Ninguna clave privilegiada viaja en React.
async function callAdmin<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase no está configurado.')
  const { data, error } = await supabase.functions.invoke('admin-users', { body })
  if (error) {
    // Errores controlados del servidor. Nunca incluir el token ni el cuerpo sensible.
    const response = (error as { context?: unknown }).context
    if (response instanceof Response) {
      const result: unknown = await response.json().catch(() => null)
      if (result && typeof result === 'object' && 'error' in result && typeof result.error === 'string') {
        throw new Error(result.error)
      }
    }
    throw new Error('La operación administrativa no está disponible. Comprueba la Edge Function y tu conexión.')
  }
  if (!data || typeof data !== 'object') throw new Error('Supabase no confirmó la operación administrativa.')
  return data as T
}

export function listManagedUsers(page: number): Promise<UsersPage> {
  return callAdmin<UsersPage>({ action: 'list', page })
}

export function createManagedUser(email: string, displayName: string): Promise<{ id: string; temporaryPassword: string }> {
  return callAdmin<{ id: string; temporaryPassword: string }>({ action: 'create', email, display_name: displayName, email_verified_by_admin: true })
}

export function setManagedUserStatus(userId: string, status: 'active' | 'inactive'): Promise<{ ok: true }> {
  return callAdmin<{ ok: true }>({ action: 'set_status', user_id: userId, status })
}

export function resetManagedUserPassword(userId: string): Promise<{ temporaryPassword: string }> {
  return callAdmin<{ temporaryPassword: string }>({ action: 'reset_password', user_id: userId })
}
