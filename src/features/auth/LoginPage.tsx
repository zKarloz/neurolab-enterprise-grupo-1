import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, BrainCircuit, Eye, EyeOff, Fingerprint, Layers3, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { PageState } from '../../components/ui/PageState'
import { useAuth } from './AuthProvider'

function NeuralDecoration() {
  // Dibujo decorativo: no utiliza valores ficticios de entrenamiento.
  const nodes = [
    [62, 122], [62, 224], [62, 326],
    [220, 95], [220, 186], [220, 278], [220, 369],
    [385, 146], [385, 277], [530, 213],
  ]
  const columns = [nodes.slice(0, 3), nodes.slice(3, 7), nodes.slice(7, 9), nodes.slice(9)]
  return (
    <svg viewBox="0 0 590 460" role="img" aria-label="Representación abstracta de capas neuronales" className="w-full max-w-[570px] opacity-80">
      <defs><linearGradient id="wire" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fafafa" stopOpacity=".12"/><stop offset="1" stopColor="#fafafa" stopOpacity=".35"/></linearGradient></defs>
      {columns.slice(0, -1).flatMap((group, i) => group.flatMap(([x1, y1]) => columns[i + 1].map(([x2, y2]) =>
        <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#wire)" strokeWidth="1.2" />
      )))}
      {nodes.map(([x,y], i) => <g key={`${x}-${y}`}><circle cx={x} cy={y} r={i===9 ? 19 : 13} fill="#111111" stroke="#a3a3a3" strokeWidth="1.5"/><circle cx={x} cy={y} r="4" fill="#e5e5e5"/></g>)}
    </svg>
  )
}

export function LoginPage() {
  const { state } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (state.status === 'configured_missing') return <PageState kind="config" />

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true)
    setError('')
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) setError('No se pudo iniciar sesión. Comprueba tus credenciales y el estado de tu cuenta.')
      // El router solo habilita la app si AuthProvider también verificó app_users con RLS.
    } catch {
      setError('No fue posible conectar con Supabase. Revisa tu conexión e inténtalo otra vez.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-screen bg-[var(--page)] lg:grid-cols-[minmax(0,1.04fr)_minmax(420px,.96fr)]">
      <section className="relative hidden min-h-screen flex-col overflow-hidden bg-[#161616] p-10 text-white lg:flex xl:p-14">
        <div className="absolute -right-24 -top-40 size-[460px] rounded-full bg-white/[.045] blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex items-center gap-3 text-lg font-semibold tracking-tight"><span className="grid size-10 place-items-center rounded-xl border border-white/15 bg-white/10"><BrainCircuit size={23} strokeWidth={1.7}/></span> NeuroLab <span className="font-normal text-white/50">Enterprise</span></div>
        <div className="relative z-10 mt-auto max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[.18em] text-white/75"><span className="size-1.5 rounded-full bg-white" /> Entorno de aprendizaje</div>
          <h1 className="mt-8 text-5xl font-semibold leading-[1.11] tracking-[-.045em] xl:text-6xl">Diseña el conocimiento. <span className="text-white/45">Explora la inteligencia.</span></h1>
          <p className="mt-6 max-w-md text-[15px] leading-7 text-white/60">Un espacio seguro para desarrollar, entrenar y evaluar redes neuronales, paso a paso.</p>
          <div className="mt-10 flex flex-wrap items-center gap-5 text-xs text-white/55"><span className="flex items-center gap-2"><Layers3 size={15}/> Estructuras modulares</span><span className="flex items-center gap-2"><ShieldCheck size={15}/> Acceso controlado</span></div>
        </div>
        <div className="absolute bottom-10 right-[-80px] w-[56%] max-w-[600px] translate-y-1/2 opacity-40 xl:bottom-16 xl:right-[-100px] xl:translate-y-[18%]" aria-hidden="true"><NeuralDecoration /></div>
        <div className="relative z-10 mt-16 border-t border-white/10 pt-6 text-xs text-white/35">NeuroLab Enterprise · Plataforma académica</div>
      </section>
      <section className="flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-12 xl:px-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight lg:hidden"><BrainCircuit className="size-6"/> NeuroLab Enterprise</div>
          <span className="hidden text-xs text-[var(--muted)] lg:block">Acceso a la plataforma</span>
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-16">
          <div className="mb-8 grid size-12 place-items-center rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-sm"><Fingerprint size={23} strokeWidth={1.6}/></div>
          <p className="text-xs font-semibold uppercase tracking-[.19em] text-[var(--muted)]">Bienvenido de nuevo</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-.045em] sm:text-[38px]">Iniciar sesión</h2>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">Ingresa con las credenciales proporcionadas por tu administrador.</p>
          <form onSubmit={(event) => void submit(event)} className="mt-10 space-y-6">
            <InputField label="Correo electrónico" id="email" type="email" autoComplete="username" placeholder="nombre@institucion.edu" required maxLength={320} value={email} onChange={(event)=>setEmail(event.target.value)} />
            <InputField label="Contraseña" id="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresa tu contraseña" required value={password} onChange={(event)=>setPassword(event.target.value)} endSlot={<button type="button" onClick={()=>setVisible(!visible)} className="grid size-9 place-items-center rounded-lg text-[var(--muted)] hover:text-[var(--ink)]" aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'}>{visible ? <EyeOff size={18}/> : <Eye size={18}/>}</button>} />
            {error && <Notice tone="error">{error}</Notice>}
            <Button type="submit" busy={busy} className="w-full">Acceder a NeuroLab <ArrowRight size={16} aria-hidden="true" /></Button>
          </form>
          <div className="mt-9 flex items-start gap-3 rounded-xl bg-[var(--surface-muted)] px-4 py-4 text-xs leading-5 text-[var(--muted)]"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true"/>No hay registro público. Para solicitar acceso o recuperar tu cuenta, contacta al administrador de la plataforma.</div>
        </div>
        <div className="mx-auto flex w-full max-w-[420px] justify-between border-t border-[var(--line)] pt-5 text-[11px] text-[var(--muted)]"><span>© NeuroLab Enterprise</span><span>Fase 1 · Base</span></div>
      </section>
    </main>
  )
}
