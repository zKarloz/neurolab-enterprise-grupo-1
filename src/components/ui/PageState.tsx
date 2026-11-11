import { useState } from 'react'
import { LockKeyhole, Settings2, WifiOff } from 'lucide-react'
import { Spinner } from './Spinner'
import { Button } from './Button'

interface PageStateProps {
  kind: 'loading' | 'blocked' | 'config' | 'error'
  onRetry?: () => void
  onSignOut?: () => Promise<void>
}

export function PageState({ kind, onRetry, onSignOut }: PageStateProps) {
  const [signOutError, setSignOutError] = useState(false)
  async function exit() {
    if (!onSignOut) return
    setSignOutError(false)
    try { await onSignOut() }
    catch { setSignOutError(true) }
  }
  const details = {
    loading: { icon: null, title: 'Verificando acceso', description: 'Validando sesión y permisos en Supabase…' },
    blocked: { icon: LockKeyhole, title: 'Acceso no autorizado', description: 'Tu cuenta no tiene un perfil activo. Contacta al administrador si necesitas acceso.' },
    config: { icon: Settings2, title: 'Configura Supabase', description: 'Faltan las variables públicas VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY. Consulta el README para habilitar el acceso.' },
    error: { icon: WifiOff, title: 'Servicio no disponible', description: 'No se pudo verificar la sesión o los permisos. Comprueba la conexión y vuelve a intentar.' },
  }[kind]
  const Icon = details.icon
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page)] p-6">
      <div className="w-full max-w-md rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <div className={`mx-auto mb-5 grid ${kind === 'loading' ? 'min-h-14 px-3' : 'size-14'} place-items-center rounded-2xl bg-[var(--surface-muted)]`}>
          {kind === 'loading' ? <Spinner size="md" label="Verificando…" /> : Icon ? <Icon aria-hidden="true" className="size-6" /> : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{details.title}</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{details.description}</p>
        {kind === 'config' && <code className="mt-4 block text-xs text-[var(--muted)]">.env.local</code>}
        {onRetry && <Button variant="outline" className="mt-6 w-full" onClick={onRetry}>Reintentar</Button>}
        {signOutError && <p role="alert" className="mt-3 text-xs">No se pudo cerrar la sesión. Reintenta.</p>}
        {onSignOut && <Button variant="ghost" className="mt-2 w-full" onClick={() => void exit()}>Cerrar sesión</Button>}
      </div>
    </main>
  )
}
