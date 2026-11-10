import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BrainCircuit, ChevronRight, ClipboardList, FolderKanban, LayoutDashboard,
  Menu, PanelLeftClose, PanelLeftOpen, Users, X,
} from 'lucide-react'
import { UserMenu } from './UserMenu'
import { BackButton } from './BackButton'
import { getBackDestination } from './backNavigation'
import { useAuth } from '../../features/auth/AuthProvider'

const SIDEBAR_KEY = 'neurolab:sidebar-collapsed'

const workspaceLinks = [
  { to: '/inicio', title: 'Inicio', icon: LayoutDashboard },
  { to: '/proyectos', title: 'Proyectos', icon: FolderKanban },
] as const

/** Preferencia visual local; no se almacena información de identidad o proyectos. */
function initialSidebarCollapsed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(SIDEBAR_KEY) === 'true'
  } catch {
    return false
  }
}

/** La cuenta ya no pertenece al menú lateral: tiene su propio contexto de navegación. */
export function getNavigationContext(pathname: string): { section: string; title: string } {
  if (pathname.startsWith('/administracion/auditoria')) return { section: 'Administración global', title: 'Auditoría' }
  if (pathname.startsWith('/administracion')) return { section: 'Administración global', title: 'Usuarios' }
  if (pathname === '/cuenta') return { section: 'Configuración personal', title: 'Mi cuenta' }
  if (pathname.startsWith('/proyectos')) return { section: 'Espacio de trabajo', title: 'Proyectos' }
  return { section: 'Espacio de trabajo', title: 'Inicio' }
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(initialSidebarCollapsed)
  const [signOutError, setSignOutError] = useState(false)
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const menuButton = useRef<HTMLButtonElement>(null)

  useEffect(() => setMobileOpen(false), [location.pathname])
  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_KEY, String(collapsed)) }
    catch { /* La navegación sigue funcionando si el navegador bloquea localStorage. */ }
  }, [collapsed])
  useEffect(() => {
    if (!mobileOpen) return
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileOpen(false)
        menuButton.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileOpen])

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

  const isPlatformAdmin = state.profile.is_platform_admin
  const { section, title } = getNavigationContext(location.pathname)
  const backDestination = getBackDestination(location.pathname)
  const navigationClass = (isActive: boolean, compact: boolean) =>
    `flex min-h-11 items-center gap-3 rounded-xl text-sm font-medium transition-colors ${compact ? 'justify-center px-2' : 'px-3'} ${isActive ? 'bg-[var(--surface-muted)] text-[var(--ink)]' : 'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'}`

  /** Misma navegación en ambas vistas; el sidebar móvil nunca se contrae. */
  function renderSidebar(mobile: boolean) {
    const compact = !mobile && collapsed
    return (
      <div className="flex h-full flex-col">
        <div className={`flex h-[88px] shrink-0 items-center border-b border-[var(--line)] ${compact ? 'justify-center px-2' : 'justify-between px-6'}`}>
          <div className={`flex min-w-0 items-center ${compact ? 'justify-center' : 'gap-3'}`}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--ink)] text-[var(--surface)]"><BrainCircuit size={23} strokeWidth={1.7} aria-hidden="true" /></span>
            {!compact && <span className="text-sm font-bold tracking-tight">NeuroLab <span className="block text-xs font-normal text-[var(--muted)]">Enterprise</span></span>}
          </div>
          {mobile && <button type="button" className="rounded-lg p-1 text-[var(--muted)]" aria-label="Cerrar menú" onClick={() => setMobileOpen(false)}><X size={20} /></button>}
        </div>
        <nav aria-label="Navegación principal" className={`flex-1 overflow-y-auto py-8 ${compact ? 'px-3' : 'px-4'}`}>
          {!compact && <p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Espacio de trabajo</p>}
          <div className={`${compact ? '' : 'mt-4'} space-y-1`}>
            {workspaceLinks.map(({ to, title: label, icon: Icon }) => (
              <NavLink key={to} to={to} aria-label={label} title={compact ? label : undefined} className={({ isActive }) => navigationClass(isActive, compact)}>
                <Icon size={19} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                {compact ? <span className="sr-only">{label}</span> : label}
              </NavLink>
            ))}
          </div>
          {isPlatformAdmin && (
            <div className={`${compact ? 'mt-6 pt-5' : 'mt-9 pt-7'} border-t border-[var(--line)]`}>
              {!compact && <p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Administración global</p>}
              <div className={`${compact ? '' : 'mt-4'} space-y-1`}>
                {[
                  { to: '/administracion/usuarios', title: 'Usuarios', icon: Users },
                  { to: '/administracion/auditoria', title: 'Auditoría', icon: ClipboardList },
                ].map(({ to, title: label, icon: Icon }) => (
                  <NavLink key={to} to={to} aria-label={label} title={compact ? label : undefined} className={({ isActive }) => navigationClass(isActive, compact)}>
                    <Icon size={19} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                    {compact ? <span className="sr-only">{label}</span> : label}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </nav>
        <div className={`shrink-0 border-t border-[var(--line)] ${compact ? 'p-3' : 'p-4'}`}>
          {mobile ? (
            <button type="button" onClick={() => setMobileOpen(false)} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]">
              <X size={19} aria-hidden="true" /> Cerrar menú
            </button>
          ) : (
            <button
              type="button"
              aria-label={compact ? 'Expandir menú' : 'Contraer menú'}
              title={compact ? 'Expandir menú' : undefined}
              aria-expanded={!compact}
              onClick={() => setCollapsed((value) => !value)}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--focus)] ${compact ? 'justify-center px-2' : 'px-3'}`}
            >
              {compact ? <PanelLeftOpen size={19} aria-hidden="true" /> : <PanelLeftClose size={19} aria-hidden="true" />}
              {compact ? <span className="sr-only">Expandir menú</span> : 'Contraer menú'}
            </button>
          )}
        </div>
      </div>
    )
  }

  // El ancho controla tanto la barra como el contenido y el margen del retroceso.
  const layoutStyle = { '--nl-sidebar-width': collapsed ? '76px' : '264px' } as CSSProperties

  return (
    <div style={layoutStyle} className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
      <a href="#contenido" className="sr-only rounded-md bg-[var(--surface)] p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Saltar al contenido</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--nl-sidebar-width)] overflow-hidden border-r border-[var(--line)] bg-[var(--surface)] transition-[width] duration-200 ease-out motion-reduce:transition-none lg:block" aria-label="Barra lateral">
        {renderSidebar(false)}
      </aside>

      {/* La barra de móvil conserva todos los textos aunque el escritorio esté contraído. */}
      <div
        aria-hidden={!mobileOpen}
        className={`fixed inset-0 z-40 transition-[opacity,visibility] duration-200 ease-out motion-reduce:transition-none lg:hidden ${mobileOpen ? 'visible opacity-100' : 'invisible pointer-events-none opacity-0'}`}
      >
        <button type="button" aria-label="Cerrar menú lateral" tabIndex={mobileOpen ? 0 : -1} className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
        <aside className={`absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-[var(--line)] bg-[var(--surface)] shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          {renderSidebar(true)}
        </aside>
      </div>

      <div className="transition-[padding-left] duration-200 ease-out motion-reduce:transition-none lg:pl-[var(--nl-sidebar-width)]">
        <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--page)]/95 px-5 backdrop-blur sm:px-8 lg:px-12">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <button ref={menuButton} type="button" onClick={() => setMobileOpen(true)} aria-label="Abrir menú" aria-expanded={mobileOpen} className="shrink-0 rounded-lg p-2 lg:hidden"><Menu size={21} /></button>
            {backDestination && <BackButton destination={backDestination} className="shrink-0 lg:hidden" />}
            <div className="flex min-w-0 flex-col items-start gap-0.5 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:gap-2">
              <span className="max-w-full truncate text-[10px] sm:text-xs">{section}</span>
              <ChevronRight size={14} className="hidden shrink-0 sm:block" aria-hidden="true" />
              <span className="truncate font-medium text-[var(--ink)]">{title}</span>
            </div>
          </div>
          <UserMenu displayName={state.profile.display_name} onSignOut={leave} />
        </header>
        {signOutError && <div role="alert" className="border-b border-[var(--line)] bg-[var(--surface-muted)] px-8 py-3 text-sm">No se pudo cerrar la sesión. Inténtalo de nuevo.</div>}
        <main id="contenido" className="mx-auto w-full max-w-[1240px] p-5 pb-16 sm:p-8 lg:pl-24 lg:pr-12 lg:pt-12">
          {/* Reservar una canaleta evita que la flecha solape títulos o acciones.
              Las dos posiciones siguen al ancho del sidebar al contraer/expandir. */}
          {backDestination && (
            <BackButton
              destination={backDestination}
              className="fixed top-[136px] z-20 hidden lg:grid"
              style={{ left: collapsed ? 'max(88px, calc(50vw - 570px))' : 'max(276px, calc(50vw - 496px))' }}
            />
          )}
          <Outlet />
        </main>
      </div>
    </div>
  )
}
