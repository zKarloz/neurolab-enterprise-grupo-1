import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BrainCircuit, ClipboardList, ChevronRight, CircleUserRound, FolderKanban,
  LayoutDashboard, Menu, PanelLeftClose, ShieldCheck, Users, X,
} from 'lucide-react'
import { UserMenu } from './UserMenu'
import { useAuth } from '../../features/auth/AuthProvider'

const links = [
  { to: '/inicio', title: 'Inicio', icon: LayoutDashboard },
  { to: '/proyectos', title: 'Proyectos', icon: FolderKanban },
  { to: '/cuenta', title: 'Mi cuenta', icon: CircleUserRound },
] as const

/** Mismo origen de navegación para sidebar y breadcrumb. */
export function getNavigationContext(pathname: string): { section: string; title: string } {
  if (pathname.startsWith('/administracion/auditoria')) return { section: 'Administración global', title: 'Auditoría' }
  if (pathname.startsWith('/administracion')) return { section: 'Administración global', title: 'Usuarios' }
  if (pathname === '/cuenta') return { section: 'Espacio de trabajo', title: 'Mi cuenta' }
  if (pathname.startsWith('/proyectos')) return { section: 'Espacio de trabajo', title: 'Proyectos' }
  return { section: 'Espacio de trabajo', title: 'Inicio' }
}

export function AppShell() {
  const [open, setOpen] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    if (!open) return
    // Escape cierra el panel móvil sin impedir que los menús internos gestionen su foco.
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  if (state.status !== 'ready') return null

  async function leave() {
    setSignOutError(false)
    try {
      await signOut()
      navigate('/acceder', { replace: true })
    } catch {
      setSignOutError(true)
    }
  }

  const { section, title } = getNavigationContext(location.pathname)
  const navigationClass = (isActive: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${isActive ? 'bg-[var(--surface-muted)] text-[var(--ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'}`

  // Se reutiliza la misma estructura en escritorio y en el panel móvil animado.
  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[88px] items-center justify-between border-b border-[var(--line)] px-6">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-[var(--ink)] text-[var(--surface)]"><BrainCircuit size={23} strokeWidth={1.7} /></span>
          <span className="text-sm font-bold tracking-tight">NeuroLab <span className="block text-xs font-normal text-[var(--muted)]">Enterprise</span></span>
        </div>
        <button type="button" className="rounded-lg p-1 text-[var(--muted)] lg:hidden" aria-label="Cerrar menú" onClick={() => setOpen(false)}><X size={20} /></button>
      </div>
      <nav aria-label="Navegación principal" className="flex-1 overflow-y-auto px-4 py-8">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Espacio de trabajo</p>
        <div className="mt-4 space-y-1">
          {links.map(({ to, title: label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => navigationClass(isActive)}>
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}
            </NavLink>
          ))}
        </div>
        {state.profile.is_platform_admin && (
          <div className="mt-9 border-t border-[var(--line)] pt-7">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Administración global</p>
            <NavLink to="/administracion/usuarios" className={({ isActive }) => `mt-4 ${navigationClass(isActive)}`}>
              <Users size={18} strokeWidth={1.8} aria-hidden="true" />Usuarios
            </NavLink>
            <NavLink to="/administracion/auditoria" className={({ isActive }) => `mt-1 ${navigationClass(isActive)}`}>
              <ClipboardList size={18} strokeWidth={1.8} aria-hidden="true" />Auditoría
            </NavLink>
          </div>
        )}
      </nav>
      <div className="border-t border-[var(--line)] p-4">
        <div className="rounded-xl bg-[var(--surface-muted)] p-3">
          <div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck size={15} /> Acceso verificado</div>
          <p className="mt-1 text-xs text-[var(--muted)]">Protegido por Supabase Auth y RLS.</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
      <a href="#contenido" className="sr-only rounded-md bg-[var(--surface)] p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Saltar al contenido</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-[var(--line)] bg-[var(--surface)] lg:block">{sidebar}</aside>

      {/* Siempre montado: transiciones de entrada Y salida sin librerías ni timers. */}
      <div
        aria-hidden={!open}
        className={`fixed inset-0 z-40 transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none lg:hidden ${open ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'}`}
      >
        <button type="button" aria-label="Cerrar menú lateral" tabIndex={open ? 0 : -1} className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <aside className={`absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-[var(--line)] bg-[var(--surface)] shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${open ? 'translate-x-0' : '-translate-x-full'}`}>
          {sidebar}
        </aside>
      </div>

      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--page)]/95 px-5 backdrop-blur sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button ref={menuButton} type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open} className="shrink-0 rounded-lg p-2 lg:hidden"><Menu size={21} /></button>
            <PanelLeftClose className="hidden size-4 shrink-0 text-[var(--muted)] lg:block" aria-hidden="true" />
            <div className="flex min-w-0 flex-col items-start gap-0.5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:gap-2">
              <span className="max-w-full truncate text-[10px] sm:text-xs">{section}</span>
              <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden="true" />
              <span className="truncate font-medium text-[var(--ink)]">{title}</span>
            </div>
          </div>
          <UserMenu displayName={state.profile.display_name} onSignOut={leave} />
        </header>
        {signOutError && <div role="alert" className="border-b border-[var(--line)] bg-[var(--surface-muted)] px-8 py-3 text-sm">No se pudo cerrar la sesión. Inténtalo de nuevo.</div>}
        <main id="contenido" className="mx-auto w-full max-w-[1240px] p-5 pb-16 sm:p-8 lg:p-12"><Outlet /></main>
      </div>
    </div>
  )
}
