import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, Plus, ShieldCheck, UserRoundCog, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Modal } from '../../components/ui/Modal'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Surface } from '../../components/ui/Surface'
import { Spinner } from '../../components/ui/Spinner'
import { useAuth } from '../auth/AuthProvider'
import { createManagedUser, listManagedUsers, resetManagedUserPassword, setManagedUserStatus } from '../../services/adminUsers'
import type { ManagedUser, UsersPage } from '../../services/adminUsers'

type UserOperation = { kind: 'status' | 'reset'; user: ManagedUser } | null

/**
 * Interfaz M10: alta/estado/recuperación de cuentas mediante Edge Function protegida.
 * La asignación de roles por proyecto sigue en Proyectos → Integrantes (Fase 2).
 */
export function AdminUsersPage() {
  const { state } = useAuth()
  const actorId = state.status === 'ready' ? state.user.id : ''
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<UsersPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [verified, setVerified] = useState(false)
  const [operation, setOperation] = useState<UserOperation>(null)
  const [credential, setCredential] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setResult(await listManagedUsers(page)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible obtener usuarios.') }
    finally { setLoading(false) }
  }, [page])

  useEffect(() => { void reload() }, [reload])

  function closeCreate() {
    setCreateOpen(false)
    setEmail('')
    setDisplayName('')
    setVerified(false)
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !verified) return
    setBusy(true)
    setError('')
    try {
      const created = await createManagedUser(email.trim(), displayName.trim())
      closeCreate()
      setCredential(created.temporaryPassword)
      setPage(1)
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo crear la cuenta.') }
    finally { setBusy(false) }
  }

  async function confirmOperation() {
    if (!operation || busy) return
    setBusy(true)
    setError('')
    try {
      if (operation.kind === 'reset') {
        const response = await resetManagedUserPassword(operation.user.id)
        setOperation(null)
        setCredential(response.temporaryPassword)
      } else {
        const next = operation.user.status === 'active' ? 'inactive' : 'active'
        await setManagedUserStatus(operation.user.id, next)
        setOperation(null)
      }
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se completó la operación.') }
    finally { setBusy(false) }
  }

  return <div className="space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        
        <h1 className="text-3xl font-semibold tracking-[-.04em]">Usuarios</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">Cuentas administradas, sin registro público ni correos automáticos. Los privilegios globales no conceden acceso técnico a los proyectos.</p>
      </div>
      <Button type="button" onClick={() => { setError(''); setCreateOpen(true) }}><Plus size={17}/> Crear cuenta</Button>
    </header>
    {error && <Notice tone="error">{error} <button className="ml-2 underline" onClick={() => void reload()}>Reintentar</button></Notice>}
    <Surface className="space-y-4 p-5 sm:p-7">
      <div className="flex items-center gap-2"><Users size={19}/><h2 className="text-lg font-semibold">Cuentas registradas</h2></div>
      {loading ? <Spinner label="Consultando usuarios…" centered className="py-8" /> : !result?.users.length ? <Notice>No existen cuentas en esta página.</Notice> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="p-3">Usuario</th><th className="p-3">Estado</th><th className="p-3">Alcance</th><th className="p-3">Acciones</th></tr></thead>
          <tbody>{result.users.map((user) => <tr key={user.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-3"><p className="font-semibold">{user.display_name}</p><p className="break-all text-xs text-[var(--muted)]">{user.email}</p></td>
            <td className="p-3">{user.status === 'active' ? 'Activo' : 'Inactivo'}</td>
            <td className="p-3">{user.is_platform_admin ? <span className="inline-flex items-center gap-1"><ShieldCheck size={14}/> Administrador</span> : 'Usuario'}</td>
            <td className="p-3"><div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={busy || user.id === actorId || user.is_platform_admin} onClick={() => setOperation({kind:'status', user})}>{user.status === 'active' ? 'Desactivar' : 'Activar'}</Button>
              <Button type="button" variant="ghost" disabled={busy || user.id === actorId || user.is_platform_admin} onClick={() => setOperation({kind:'reset', user})}><KeyRound size={15}/> Restablecer</Button>
            </div></td>
          </tr>)}</tbody>
        </table></div>
      )}
      {result && <Pagination page={page} pageSize={result.pageSize} total={result.total} onPageChange={setPage}/>}
    </Surface>
    <Notice>Los roles Responsable, Ingeniero, Revisor y Lector se asignan desde <strong>Proyectos → Integrantes</strong>. No se conceden permisos de Administrador desde esta pantalla.</Notice>

    <Modal open={createOpen} title="Crear cuenta" onClose={() => { if (!busy) closeCreate() }}>
      <form onSubmit={(event) => void submitCreate(event)} className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        <InputField id="admin-name" label="Nombre visible" value={displayName} minLength={2} maxLength={100} required autoComplete="off" onChange={(event) => setDisplayName(event.target.value)}/>
        <InputField id="admin-email" label="Correo electrónico" type="email" value={email} maxLength={254} required autoComplete="off" onChange={(event) => setEmail(event.target.value)}/>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 accent-[var(--focus)]" checked={verified} onChange={(event) => setVerified(event.target.checked)} required/><span>He verificado por un canal confiable que este correo pertenece a la persona indicada.</span></label>
        <Notice>Se generará una contraseña temporal segura; será visible una sola vez. Entrégala por un canal privado y solicita que el usuario la cambie al ingresar.</Notice>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={closeCreate} disabled={busy}>Cancelar</Button><Button type="submit" busy={busy} disabled={!verified}>Crear usuario</Button></div>
      </form>
    </Modal>

    <Modal open={operation !== null} title={operation?.kind === 'reset' ? 'Restablecer acceso' : 'Cambiar estado de cuenta'} onClose={() => { if (!busy) setOperation(null) }}>
      <div className="space-y-5">{error && <Notice tone="error">{error}</Notice>}<p className="text-sm leading-6">{operation?.kind === 'reset'
        ? `Se generará una contraseña temporal nueva para ${operation.user.email}. La contraseña anterior dejará de servir.`
        : `¿Confirmas ${operation?.user.status === 'active' ? 'desactivar' : 'activar'} la cuenta ${operation?.user.email}?`}</p>
        <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setOperation(null)}>Cancelar</Button><Button busy={busy} onClick={() => void confirmOperation()}><UserRoundCog size={16}/> Confirmar</Button></div>
      </div>
    </Modal>

    <Modal open={credential !== null} title="Contraseña temporal — mostrar una sola vez" onClose={() => setCredential(null)}>
      <div className="space-y-5">
        <Notice tone="success">Operación confirmada. Guarda la contraseña antes de cerrar esta ventana. No se conservará en el navegador ni se podrá consultar después.</Notice>
        <p className="break-all rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4 font-mono text-base font-semibold" aria-label="Contraseña temporal">{credential}</p>
        <p className="text-sm text-[var(--muted)]">Compártela por un canal seguro. La persona deberá usar «Mi cuenta → Cambiar contraseña» tras iniciar sesión.</p>
        <Button onClick={() => setCredential(null)} className="w-full">He guardado la contraseña</Button>
      </div>
    </Modal>
  </div>
}
