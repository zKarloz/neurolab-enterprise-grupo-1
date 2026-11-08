import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { isSupabaseConfigured, supabase } from '../../lib/supabase'
import type { AppProfile, AuthState } from '../../types/auth'
import { isMissingAuthSession, signInIdentityChanged, verificationStarted, verificationUnavailable } from './refreshPolicy.ts'

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
        // No tener sesión es normal antes del login; no se considera error de servicio.
        if (isMissingAuthSession(identityError)) {
          setState({ status: 'guest' })
          return
        }
        // Mostrar solo identificadores técnicos seguros, nunca tokens ni credenciales.
        console.warn('[NeuroLab/Auth] Verificación de identidad fallida', {
          status: identityError.status, name: identityError.name, code: identityError.code,
        })
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
        console.warn('[NeuroLab/Auth] Consulta de perfil fallida', {
          code: error.code, status: error.details ? 'con_detalle' : 'sin_detalle',
        })
        setState((previous) => verificationUnavailable(previous, 'No se pudo verificar tu perfil. Revisa la conexión.'))
        return
      }
      // Una cuenta bloqueada pierde la vista privada aun si su JWT todavía es válido.
      if (!data || data.status !== 'active') {
        setState({ status: 'blocked' })
        return
      }
      setState({ status: 'ready', user: identity.user, profile: data as AppProfile })
    } catch (error) {
      console.warn('[NeuroLab/Auth] Fallo inesperado', {
        name: error instanceof Error ? error.name : 'UnknownError',
      })
      if (current === sequence.current) {
        setState((previous) => verificationUnavailable(previous, 'No se pudo contactar el servicio de autenticación.'))
      }
    }
  }, [])

  useEffect(() => {
    if (!supabase) return

    let disposed = false
    let unsubscribe: (() => void) | undefined
    let verificationTimer: ReturnType<typeof setTimeout> | undefined

    // Fuera del callback de Auth: la API puede mantener un bloqueo interno mientras
    // notifica eventos. una microtarea no garantiza que ese bloqueo ya se haya liberado.
    function scheduleRefresh() {
      if (verificationTimer !== undefined) clearTimeout(verificationTimer)
      verificationTimer = setTimeout(() => {
        verificationTimer = undefined
        if (!disposed) void refresh()
      }, 0)
    }

    async function initializeAuth() {
      // Primero resolver la inicialización de Auth; registrar el listener durante
      // getUser() puede provocar una carrera de renovación del token en algunas versiones.
      await refresh()
      if (disposed) return

      const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
        // Callback SÍNCRONO: nunca llamar ni esperar aquí a la API de Supabase.
        if (event === 'SIGNED_OUT') {
          if (verificationTimer !== undefined) clearTimeout(verificationTimer)
          verificationTimer = undefined
          sequence.current += 1
          setState({ status: 'guest' })
          return
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
          if (event === 'SIGNED_IN') {
            setState((previous) => signInIdentityChanged(previous, session?.user.id))
          }
          scheduleRefresh()
        }
      })
      unsubscribe = () => subscription.unsubscribe()
    }

    void initializeAuth()
    return () => {
      disposed = true
      sequence.current += 1
      if (verificationTimer !== undefined) clearTimeout(verificationTimer)
      unsubscribe?.()
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
