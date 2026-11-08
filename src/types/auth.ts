import type { User } from '@supabase/supabase-js'

// Datos permitidos de un perfil: ninguna pantalla puede actualizar privilegios globales.
export interface AppProfile {
  id: string
  email: string
  display_name: string
  status: 'active' | 'inactive'
  is_platform_admin: boolean
}

export type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'configured_missing' }
  | { status: 'blocked' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; user: User; profile: AppProfile }
