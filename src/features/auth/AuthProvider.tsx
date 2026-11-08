import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { AppProfile, AuthState } from '../../types/auth'

interface AuthContextValue {
  state: AuthState
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: PropsWithChildren) {
  const [state, setState] = useState<AuthState>(
    isSupabaseConfigured ? { status: 'loading' } : { status: 'configured_missing' },
  )
  const sequence = useRef(0)

  const refresh = useCallback(async () => {
    const current = ++sequence.current
    if (!supabase) {
      setState({ status: 'configured_missing' })
      return
    }
    setState({ status: 'loading' })
    try {
      // getUser verifica la identidad con Auth en vez de confiar solo en la sesión local.
      const { data: identity, error: identityError } = await supabase.auth.getUser()
      if (current !== sequence.current) return
      if (identityError || !identity.user) {
        setState({ status: 'guest' })
        return
      }
      const { data, error } = await supabase
        .from('app_users')
        .select('id,email,display_name,status,is_platform_admin')
        .eq('id', identity.user.id)
        .maybeSingle()
      if (current !== sequence.current) return
      if (error) {
        setState({
          status: 'unavailable',
          message: 'No se pudo verificar tu perfil. Revisa la conexión o la migración inicial.',
        })
        return
      }
      // RLS debe ocultar los perfiles inactivos. Sin perfil activo, nunca se entra a la app.
      if (!data || data.status !== 'active') {
        setState({ status: 'blocked' })
        return
      }
      setState({ status: 'ready', user: identity.user, profile: data as AppProfile })
    } catch {
      if (current === sequence.current) {
        setState({ status: 'unavailable', message: 'No se pudo contactar el servicio de autenticación.' })
      }
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // Evitar llamadas asíncronas a Supabase dentro del callback de Auth.
      if (event === 'SIGNED_OUT') {
        sequence.current += 1
        setState({ status: 'guest' })
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        queueMicrotask(() => void refresh())
      }
    })
    void refresh()
    return () => {
      sequence.current += 1
      subscription.unsubscribe()
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    sequence.current += 1
    setState({ status: 'guest' })
  }, [])

  return <AuthContext.Provider value={{ state, refresh, signOut }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth debe utilizarse dentro de AuthProvider')
  return value
}
