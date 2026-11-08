import { useState } from 'react'
import type { FormEvent } from 'react'
import { CircleUserRound, KeyRound, Mail, Shield, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'

export function AccountPage() {
  const { state } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{success: boolean; text: string} | null>(null)
  if (state.status !== 'ready') return null
  const { profile } = state

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    if (password.length < 12) {
      setFeedback({success:false,text:'La nueva contraseña debe tener por lo menos 12 caracteres.'})
      return
    }
    if (password !== confirmation) {
      setFeedback({success:false,text:'Las contraseñas no coinciden.'})
      return
    }
    setBusy(true)
    setFeedback(null)
    try {
      // Auth gestiona la contraseña; nunca se almacena en public.app_users.
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setConfirmation('')
      setFeedback({success:true,text:'Tu contraseña fue actualizada correctamente.'})
    } catch {
      setFeedback({success:false,text:'No se pudo actualizar la contraseña. Si Supabase solicita reautenticación, contacta al administrador.'})
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-7"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">Configuración personal</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Mi cuenta</h1><p className="mt-3 text-sm text-[var(--muted)]">Gestiona tus credenciales y consulta el acceso autorizado.</p></div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Surface className="p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-[var(--surface-muted)]"><CircleUserRound size={22}/></span><div><h2 className="font-semibold">Perfil</h2><p className="text-xs text-[var(--muted)]">Información de tu identidad</p></div></div><div className="mt-8 space-y-5"><div><p className="text-xs text-[var(--muted)]">Nombre</p><p className="mt-1 text-sm font-medium">{profile.display_name}</p></div><div className="border-t border-[var(--line)] pt-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Mail size={14}/> Correo electrónico</p><p className="mt-1 break-all text-sm font-medium">{profile.email}</p></div><div className="border-t border-[var(--line)] pt-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Shield size={14}/> Estado</p><p className="mt-1 text-sm font-medium">Cuenta activa</p></div><div className="border-t border-[var(--line)] pt-5"><p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={14}/> Alcance global</p><p className="mt-1 text-sm font-medium">{profile.is_platform_admin ? 'Administrador global' : 'Usuario de la plataforma'}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">La administración global no concede acceso automático al contenido técnico privado de otros proyectos.</p></div></div></Surface>
        <Surface className="p-6 sm:p-8"><div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-xl bg-[var(--surface-muted)]"><KeyRound size={22}/></span><div><h2 className="font-semibold">Cambiar contraseña</h2><p className="text-xs text-[var(--muted)]">Operación gestionada por Supabase Auth</p></div></div><form onSubmit={(event)=>void updatePassword(event)} className="mt-8 space-y-5"><InputField id="new-password" type="password" autoComplete="new-password" label="Nueva contraseña" value={password} onChange={(event)=>setPassword(event.target.value)} minLength={12} required hint="Utiliza al menos 12 caracteres."/><InputField id="confirm-password" type="password" autoComplete="new-password" label="Confirmar contraseña" value={confirmation} onChange={(event)=>setConfirmation(event.target.value)} minLength={12} required />{feedback && <Notice tone={feedback.success?'success':'error'}>{feedback.text}</Notice>}<Button type="submit" busy={busy} className="w-full">Guardar nueva contraseña</Button></form><p className="mt-5 text-xs leading-5 text-[var(--muted)]">Si no recuerdas tus credenciales, solicita la recuperación al administrador. No hay recuperación por correo habilitada en esta fase.</p></Surface>
      </div>
    </div>
  )
}
