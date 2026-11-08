import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { AppProfile, AuthState } from '../../types/auth'
import { signInIdentityChanged, verificationStarted, verificationUnavailable } from './refreshPolicy.ts'

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
    // No apagar la pantalla ni desmontar el Worker al actualizar el token en segundo plano.
    setState(verificationStarted)
    try {
      // getUser verifica la identidad en Auth. El perfil sigue siendo comprobado contra RLS.
      const { data: identity, error: identityError } = await supabase.auth.getUser()
      if (current !== sequence.current) return
      if (identityError) {
        // Una sesión inválida se descarta, a diferencia de un fallo de red temporal.
        if (identityError.status === 401 || identityError.status === 403) setState({ status: 'guest' })
        else setState((previous) => verificationUnavailable(previous, 'No se pudo verificar la sesión.'))
        return
      }
      if (!identity.user) {
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
        setState((previous) => verificationUnavailable(previous, 'No se pudo verificar tu perfil. Revisa la conexión.'))
        return
      }
      // Una cuenta bloqueada pierde la vista privada aun si su JWT todavía es válido.
      if (!data || data.status !== 'active') {
        setState({ status: 'blocked' })
        return
      }
      setState({ status: 'ready', user: identity.user, profile: data as AppProfile })
    } catch {
      if (current === sequence.current) {
        setState((previous) => verificationUnavailable(previous, 'No se pudo contactar el servicio de autenticación.'))
      }
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // No realizar solicitudes asíncronas a Supabase desde el callback de Auth.
      if (event === 'SIGNED_OUT') {
        sequence.current += 1
        setState({ status: 'guest' })
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (event === 'SIGNED_IN') setState((previous) => signInIdentityChanged(previous, session?.user.id))
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
