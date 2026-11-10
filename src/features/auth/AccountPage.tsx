import { useState } from 'react'
import type { FormEvent } from 'react'
import { ImagePlus, KeyRound, Mail, Pencil, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Modal } from '../../components/ui/Modal'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { removeMyAvatar, uploadMyAvatar } from '../../services/userAvatar'
import { validateAvatarFile } from '../../services/avatarPolicy.ts'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { normalizeDisplayName } from './profileValidation.ts'

type Feedback = { success: boolean; text: string }

/**
 * Mi cuenta: el nombre es editable por su propietario, mientras que el correo y
 * los privilegios permanecen de solo lectura. La contraseña usa el modal común.
 */
export function AccountPage() {
  const { state, refresh } = useAuth()
  // null significa «seguir el valor actualizado del perfil»; evita copias obsoletas.
  const [nameDraft, setNameDraft] = useState<string | null>(null)
  const [nameBusy, setNameBusy] = useState(false)
  const [nameFeedback, setNameFeedback] = useState<Feedback | null>(null)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null)
  const [securityFeedback, setSecurityFeedback] = useState<Feedback | null>(null)
  const [avatarModalOpen, setAvatarModalOpen] = useState(false)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarFeedback, setAvatarFeedback] = useState<Feedback | null>(null)

  if (state.status !== 'ready') return null
  const { profile } = state
  const displayName = nameDraft ?? profile.display_name
  const nameChanged = displayName.trim() !== profile.display_name

  async function updateDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || state.status !== 'ready' || nameBusy) return

    const nextName = normalizeDisplayName(nameDraft ?? state.profile.display_name)
    if (!nextName) {
      setNameFeedback({ success: false, text: 'Escribe un nombre de 2 a 80 caracteres, sin saltos de línea.' })
      return
    }
    if (nextName === state.profile.display_name) {
      setNameDraft(null)
      return
    }

    setNameBusy(true)
    setNameFeedback(null)
    try {
      // El RPC solo cambia el nombre del usuario autenticado y activo.
      // Nunca enviamos id, email, estado ni permisos desde el navegador.
      const { error } = await supabase.rpc('update_my_display_name', { p_display_name: nextName })
      if (error) throw error

      // Refrescar AuthProvider hace que el nombre cambie también en AppShell.
      await refresh()
      setNameDraft(null)
      setNameFeedback({ success: true, text: 'Tu nombre visible se actualizó correctamente.' })
    } catch {
      setNameFeedback({ success: false, text: 'No se pudo actualizar el nombre. Comprueba la conexión e inténtalo de nuevo.' })
    } finally {
      setNameBusy(false)
    }
  }

  function closePasswordModal() {
    // No descartar el formulario mientras Supabase realiza una actualización.
    if (passwordBusy) return
    setPasswordModalOpen(false)
    setPassword('')
    setConfirmation('')
    setPasswordFeedback(null)
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || passwordBusy) return
    if (password.length < 12) {
      setPasswordFeedback({ success: false, text: 'La nueva contraseña debe tener por lo menos 12 caracteres.' })
      return
    }
    if (password !== confirmation) {
      setPasswordFeedback({ success: false, text: 'Las contraseñas no coinciden.' })
      return
    }

    setPasswordBusy(true)
    setPasswordFeedback(null)
    setSecurityFeedback(null)
    try {
      // Auth gestiona la contraseña; nunca se almacena en public.app_users.
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPassword('')
      setConfirmation('')
      setPasswordModalOpen(false)
      setSecurityFeedback({ success: true, text: 'Tu contraseña fue actualizada correctamente.' })
    } catch {
      setPasswordFeedback({ success: false, text: 'No se pudo actualizar la contraseña. Si Supabase solicita reautenticación, contacta al administrador.' })
    } finally {
      setPasswordBusy(false)
    }
  }

  function closeAvatarModal() {
    if (avatarBusy) return
    setAvatarModalOpen(false)
    setAvatarFile(null)
  }

  async function saveAvatar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (state.status !== 'ready' || !avatarFile || avatarBusy) return
    const error = validateAvatarFile(avatarFile)
    if (error) { setAvatarFeedback({ success: false, text: error }); return }

    setAvatarBusy(true)
    setAvatarFeedback(null)
    try {
      await uploadMyAvatar(state.user.id, avatarFile, state.profile.avatar_path)
      // La misma ruta aparece en el encabezado y en Mi cuenta tras refrescar el perfil.
      await refresh()
      setAvatarModalOpen(false)
      setAvatarFile(null)
      setAvatarFeedback({ success: true, text: 'Tu foto de perfil fue actualizada.' })
    } catch {
      setAvatarFeedback({ success: false, text: 'No se pudo guardar la foto. Comprueba los permisos de Storage.' })
    } finally { setAvatarBusy(false) }
  }

  async function deleteAvatar() {
    if (state.status !== 'ready' || !state.profile.avatar_path || avatarBusy) return
    setAvatarBusy(true)
    setAvatarFeedback(null)
    try {
      await removeMyAvatar(state.profile.avatar_path)
      await refresh()
      setAvatarModalOpen(false)
      setAvatarFile(null)
      setAvatarFeedback({ success: true, text: 'Tu foto fue retirada. Ahora se muestran tus iniciales.' })
    } catch {
      setAvatarFeedback({ success: false, text: 'No se pudo quitar la foto. Inténtalo nuevamente.' })
    } finally { setAvatarBusy(false) }
  }

  return (
    <div className="space-y-7">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-.04em]">Mi cuenta</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Personaliza tu nombre visible y administra tu contraseña.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Surface className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <UserAvatar userId={state.user.id} displayName={profile.display_name} avatarPath={profile.avatar_path} size="lg" />
            <div className="min-w-0 space-y-2">
              <h2 className="font-semibold">Perfil</h2>
              <p className="text-xs text-[var(--muted)]">Información de tu identidad</p>
              <Button type="button" variant="outline" onClick={() => { setAvatarFeedback(null); setAvatarModalOpen(true) }}>
                <ImagePlus size={16} aria-hidden="true" /> Cambiar foto
              </Button>
            </div>
          </div>
          {avatarFeedback && <div className="mt-5"><Notice tone={avatarFeedback.success ? 'success' : 'error'}>{avatarFeedback.text}</Notice></div>}
          <div className="mt-8 space-y-5">
            <form onSubmit={(event) => void updateDisplayName(event)} className="space-y-3">
              <InputField
                id="account-display-name"
                label="Nombre visible"
                type="text"
                autoComplete="name"
                value={displayName}
                onChange={(event) => { setNameDraft(event.target.value); setNameFeedback(null) }}
                minLength={2}
                maxLength={80}
                disabled={nameBusy}
                required
                hint="De 2 a 80 caracteres. Aparecerá en el encabezado de NeuroLab."
              />
              <Button type="submit" busy={nameBusy} disabled={!nameChanged}>
                <Pencil size={16} aria-hidden="true" /> Guardar nombre
              </Button>
              {nameFeedback && <Notice tone={nameFeedback.success ? 'success' : 'error'}>{nameFeedback.text}</Notice>}
            </form>

            <div className="border-t border-[var(--line)] pt-5">
              <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><Mail size={14} aria-hidden="true" /> Correo electrónico</p>
              <p className="mt-1 break-all text-sm font-medium">{profile.email}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">La dirección de acceso la administra la plataforma.</p>
            </div>
            <div className="border-t border-[var(--line)] pt-5">
              <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={14} aria-hidden="true" /> Alcance global</p>
              <p className="mt-1 text-sm font-medium">{profile.is_platform_admin ? 'Administrador global' : 'Usuario de la plataforma'}</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">La administración global no concede acceso automático al contenido técnico privado de otros proyectos.</p>
            </div>
          </div>
        </Surface>

        <Surface className="p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-[var(--surface-muted)]"><KeyRound size={22} aria-hidden="true" /></span>
            <div><h2 className="font-semibold">Seguridad</h2><p className="text-xs text-[var(--muted)]">Credenciales gestionadas por Supabase Auth</p></div>
          </div>
          <p className="mt-8 text-sm leading-6 text-[var(--muted)]">Puedes cambiar tu contraseña desde una ventana segura sin salir de Mi cuenta.</p>
          <Button className="mt-5" type="button" onClick={() => { setSecurityFeedback(null); setPasswordModalOpen(true) }}>
            <KeyRound size={17} aria-hidden="true" /> Cambiar contraseña
          </Button>
          {securityFeedback && <div className="mt-5"><Notice tone={securityFeedback.success ? 'success' : 'error'}>{securityFeedback.text}</Notice></div>}
          <p className="mt-6 text-xs leading-5 text-[var(--muted)]">Si no recuerdas tus credenciales, solicita la recuperación al administrador. No hay recuperación por correo habilitada en esta fase.</p>
        </Surface>
      </div>

      {/* El archivo permanece solo en memoria hasta pulsar «Guardar foto». */}
      <Modal open={avatarModalOpen} title="Foto de perfil" onClose={closeAvatarModal}>
        <form onSubmit={(event) => void saveAvatar(event)} className="space-y-5">
          <div className="flex items-center gap-4">
            <UserAvatar userId={state.user.id} displayName={profile.display_name} avatarPath={profile.avatar_path} size="lg" />
            <p className="text-sm leading-6 text-[var(--muted)]">Elige una foto JPG, PNG o WebP de hasta 2 MiB. Se guardará en un espacio privado de tu cuenta.</p>
          </div>
          <label htmlFor="account-avatar-file" className="block text-sm font-medium">Nueva fotografía</label>
          <input id="account-avatar-file" type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarBusy}
            className="block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-muted)] file:px-3 file:py-2"
            onChange={(event) => {
              const file = event.target.files?.[0] ?? null
              setAvatarFile(file)
              const message = file ? validateAvatarFile(file) : null
              setAvatarFeedback(message ? { success: false, text: message } : null)
            }} />
          {avatarFile && !validateAvatarFile(avatarFile) && <p className="break-all text-xs text-[var(--muted)]">Seleccionada: {avatarFile.name}</p>}
          {avatarFeedback && <Notice tone={avatarFeedback.success ? 'success' : 'error'}>{avatarFeedback.text}</Notice>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" disabled={avatarBusy || !profile.avatar_path} onClick={() => void deleteAvatar()}>
              <Trash2 size={16} aria-hidden="true" /> Quitar foto
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={avatarBusy} onClick={closeAvatarModal}>Cancelar</Button>
              <Button type="submit" busy={avatarBusy} disabled={!avatarFile || Boolean(avatarFile && validateAvatarFile(avatarFile))}>Guardar foto</Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal accesible y reutilizable ya incluido en los componentes compartidos. */}
      <Modal open={passwordModalOpen} title="Cambiar contraseña" onClose={closePasswordModal}>
        <form onSubmit={(event) => void updatePassword(event)} className="space-y-5">
          <InputField
            id="account-new-password"
            type="password"
            autoComplete="new-password"
            label="Nueva contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={12}
            disabled={passwordBusy}
            required
            hint="Utiliza al menos 12 caracteres."
          />
          <InputField
            id="account-confirm-password"
            type="password"
            autoComplete="new-password"
            label="Confirmar contraseña"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            minLength={12}
            disabled={passwordBusy}
            required
          />
          {passwordFeedback && <Notice tone={passwordFeedback.success ? 'success' : 'error'}>{passwordFeedback.text}</Notice>}
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="outline" disabled={passwordBusy} onClick={closePasswordModal}>Cancelar</Button>
            <Button type="submit" busy={passwordBusy}>Guardar nueva contraseña</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
