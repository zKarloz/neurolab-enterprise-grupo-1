import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BrainCircuit, ChevronRight, CircleUserRound, LogOut, Menu, PanelLeftClose, ShieldCheck, X, LayoutDashboard } from 'lucide-react'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useAuth } from '../../features/auth/AuthProvider'

const links = [
  { to: '/inicio', title: 'Inicio', icon: LayoutDashboard },
  { to: '/cuenta', title: 'Mi cuenta', icon: CircleUserRound },
] as const

export function AppShell() {
  const [open, setOpen] = useState(false)
  const [signOutError, setSignOutError] = useState(false)
  const { state, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [])
  if (state.status !== 'ready') return null

  async function leave() {
    setSignOutError(false)
    try {
      await signOut()
      navigate('/acceder', { replace: true })
    } catch { setSignOutError(true) }
  }
  const title = location.pathname === '/cuenta' ? 'Mi cuenta' : 'Inicio'

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-[88px] items-center justify-between border-b border-[var(--line)] px-6">
        <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[var(--ink)] text-[var(--surface)]"><BrainCircuit size={23} strokeWidth={1.7}/></span><span className="text-sm font-bold tracking-tight">NeuroLab <span className="block text-xs font-normal text-[var(--muted)]">Enterprise</span></span></div>
        <button className="rounded-lg p-1 text-[var(--muted)] lg:hidden" aria-label="Cerrar menú" onClick={()=>setOpen(false)}><X size={20}/></button>
      </div>
      <nav aria-label="Navegación principal" className="flex-1 px-4 py-8">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Espacio de trabajo</p>
        <div className="mt-4 space-y-1">{links.map(({to,title:label,icon:Icon}) => <NavLink key={to} to={to} className={({isActive})=>`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors ${isActive?'bg-[var(--surface-muted)] text-[var(--ink)]':'text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]'}`}><Icon size={18} strokeWidth={1.8} aria-hidden="true"/>{label}</NavLink>)}</div>
        <div className="mt-9 border-t border-[var(--line)] pt-7"><p className="px-3 text-[10px] font-semibold uppercase tracking-[.2em] text-[var(--muted)]">Próximamente</p><div className="mt-4 space-y-1 px-3 text-xs leading-6 text-[var(--muted)]"><p>Proyectos de IA · Fase 2</p><p>Arquitecturas · Fase 3</p><p>Entrenamiento · Fase 3</p></div></div>
      </nav>
      <div className="border-t border-[var(--line)] p-4"><div className="rounded-xl bg-[var(--surface-muted)] p-3"><div className="flex items-center gap-2 text-xs font-medium"><ShieldCheck size={15}/> Acceso verificado</div><p className="mt-1 text-xs text-[var(--muted)]">Protegido por Supabase Auth y RLS.</p></div></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[var(--page)] text-[var(--ink)]">
      <a href="#contenido" className="sr-only rounded-md bg-[var(--surface)] p-3 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50">Saltar al contenido</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] border-r border-[var(--line)] bg-[var(--surface)] lg:block">{sidebar}</aside>
      {open && <div className="fixed inset-0 z-40 lg:hidden"><button type="button" aria-label="Cerrar menú lateral" className="absolute inset-0 bg-black/40" onClick={()=>setOpen(false)} /><aside className="absolute inset-y-0 left-0 w-[264px] max-w-[85vw] border-r border-[var(--line)] bg-[var(--surface)]">{sidebar}</aside></div>}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-20 flex min-h-[88px] items-center justify-between gap-3 border-b border-[var(--line)] bg-[var(--page)]/95 px-5 backdrop-blur sm:px-8 lg:px-12">
          <div className="flex items-center gap-4"><button type="button" onClick={()=>setOpen(true)} aria-label="Abrir menú" className="rounded-lg p-2 lg:hidden"><Menu size={21}/></button><PanelLeftClose className="hidden size-4 text-[var(--muted)] lg:block" aria-hidden="true"/><div className="flex items-center gap-2 text-xs text-[var(--muted)]">Plataforma <ChevronRight size={14}/> <span className="font-medium text-[var(--ink)]">{title}</span></div></div>
          <div className="flex items-center gap-3"><ThemeToggle /><span className="hidden max-w-44 truncate text-right text-xs font-medium sm:block">{state.profile.display_name}</span><span className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"><CircleUserRound size={18}/></span><button type="button" onClick={()=>void leave()} aria-label="Cerrar sesión" title="Cerrar sesión" className="grid size-10 place-items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"><LogOut size={17}/></button></div>
        </header>
        {signOutError && <div role="alert" className="border-b border-[var(--line)] bg-[var(--surface-muted)] px-8 py-3 text-sm">No se pudo cerrar la sesión. Inténtalo de nuevo.</div>}
        <main id="contenido" className="mx-auto w-full max-w-[1240px] p-5 pb-16 sm:p-8 lg:p-12"><Outlet /></main>
      </div>
    </div>
  )
}
