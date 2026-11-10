import { ArrowUpRight, CheckCircle2, CircleDot, Database, Fingerprint, Layers3, LockKeyhole, Rocket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'

const milestones = [
  { name: 'Acceso y seguridad', detail: 'Sesión autenticada y perfil activo verificado.', available: true },
  { name: 'Proyectos de IA', detail: 'Gestión remota de proyectos, integrantes y permisos.', available: true },
  { name: 'Diseño Feedforward', detail: 'Arquitecturas Dense y datasets locales.', available: false },
]

export function HomePage() {
  const { state } = useAuth()
  if (state.status !== 'ready') return null
  const firstName = state.profile.display_name.trim().split(/\s+/)[0] || 'usuario'
  return (
    <div className="space-y-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Hola, {firstName}<span className="text-[var(--muted)]">.</span></h1><p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">Gestiona proyectos, entrena modelos y consulta resultados desde un mismo espacio.</p></div>
      </div>
      <section className="home-hero relative overflow-hidden rounded-2xl p-7 sm:p-9">
        <div className="absolute -right-12 -top-16 size-72 rounded-full border border-current opacity-[.12]" aria-hidden="true"/><div className="absolute -right-2 top-5 size-48 rounded-full border border-current opacity-[.12]" aria-hidden="true"/>
        <div className="relative max-w-2xl"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] opacity-60"><Rocket size={15}/> Punto de partida</div><h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">Una plataforma que crece por fases.</h2><p className="mt-3 max-w-xl text-sm leading-7 opacity-70">Administra proyectos, entrena redes Feedforward, compara resultados y consulta versiones de modelos con permisos seguros.</p><Link to="/proyectos" className="home-hero__action mt-7 inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-[var(--focus)]">Abrir proyectos <ArrowUpRight size={16}/></Link></div>
      </section>
      <div className="grid gap-4 md:grid-cols-3">
        <Surface className="p-5"><Fingerprint className="size-5 text-[var(--muted)]"/><p className="mt-5 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted)]">Identidad</p><h3 className="mt-2 text-lg font-semibold">Verificada</h3><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Sesión comprobada con Supabase Auth.</p></Surface>
        <Surface className="p-5"><LockKeyhole className="size-5 text-[var(--muted)]"/><p className="mt-5 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted)]">Autorización</p><h3 className="mt-2 text-lg font-semibold">Perfil activo</h3><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Acceso validado mediante PostgreSQL y RLS.</p></Surface>
        <Surface className="p-5"><Database className="size-5 text-[var(--muted)]"/><p className="mt-5 text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted)]">Datos del proyecto</p><h3 className="mt-2 text-lg font-semibold">Proyectos de IA</h3><p className="mt-2 text-xs leading-5 text-[var(--muted)]">Consulta tus proyectos reales y administra los integrantes autorizados.</p><Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold underline" to="/proyectos">Ir a proyectos <ArrowUpRight size={14}/></Link></Surface>
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <Surface className="p-6 sm:p-7"><div className="mb-6 flex items-center justify-between"><h2 className="text-lg font-semibold tracking-tight">Ruta de desarrollo</h2><Layers3 className="size-5 text-[var(--muted)]"/></div><div className="space-y-0">{milestones.map((item,i)=><div key={item.name} className={`flex gap-4 py-4 ${i > 0 ? 'border-t border-[var(--line)]':''}`}><div className="mt-1">{item.available ? <CheckCircle2 className="size-5" aria-label="Disponible"/> : <CircleDot className="size-5 text-[var(--muted)]" aria-label="Pendiente"/>}</div><div><h3 className="text-sm font-semibold">{item.name}</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{item.detail}</p></div></div>)}</div></Surface>
        <Surface className="flex flex-col justify-between p-6 sm:p-7"><div><p className="text-[11px] font-semibold uppercase tracking-[.15em] text-[var(--muted)]">Enfoque actual</p><h2 className="mt-4 text-xl font-semibold tracking-tight">Empezar bien, crecer seguro.</h2><p className="mt-4 text-sm leading-7 text-[var(--muted)]">Los módulos de aprendizaje y operación aprovechan esta base sin duplicar permisos ni información.</p></div><div className="mt-8 flex items-center gap-2 border-t border-[var(--line)] pt-5 text-xs text-[var(--muted)]"><CheckCircle2 size={15}/> Arquitectura de Fase 0 aprobada</div></Surface>
      </div>
    </div>
  )
}
