import type { AuthState } from '../../types/auth'

/** Una reverificación de la misma sesión NO desmonta las rutas privadas. */
export function verificationStarted(previous: AuthState): AuthState {
  return previous.status === 'ready' ? previous : { status: 'loading' }
}

/** Ante fallos transitorios conservamos la pantalla; PostgreSQL/RLS protege las acciones reales. */
export function verificationUnavailable(previous: AuthState, message: string): AuthState {
  return previous.status === 'ready' ? previous : { status: 'unavailable', message }
}

/** Si Supabase confirma otra identidad, ocultar el contenido previo mientras se verifica la nueva. */
export function signInIdentityChanged(previous: AuthState, nextUserId: string | undefined): AuthState {
  return previous.status === 'ready' && previous.user.id !== nextUserId
    ? { status: 'loading' }
    : previous
}
