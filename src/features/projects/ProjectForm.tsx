import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { Modal } from '../../components/ui/Modal'
import type { Project } from '../../types/projects'

type ProjectInput = { name: string; description: string }

interface ProjectFormProps {
  open: boolean
  project?: Project | null
  onClose: () => void
  onSave: (values: ProjectInput) => Promise<void>
}

// Misma interfaz para crear y editar. El mensaje de éxito solo se emite tras confirmar RPC.
export function ProjectForm({ open, project, onClose, onSave }: ProjectFormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setName(project?.name ?? '')
      setDescription(project?.description ?? '')
      setError('')
    }
  }, [open, project])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSave({ name: name.trim(), description: description.trim() })
      onClose()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el proyecto.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={project ? 'Editar proyecto' : 'Nuevo proyecto de IA'} onClose={() => { if (!busy) onClose() }}>
      <form onSubmit={(event) => void submit(event)} className="space-y-5">
        <InputField id="project-name" label="Nombre del proyecto" value={name} onChange={(event) => setName(event.target.value)} required minLength={3} maxLength={100} autoFocus hint="Entre 3 y 100 caracteres." />
        <div className="space-y-2">
          <label htmlFor="project-description" className="block text-sm font-medium">Descripción</label>
          <textarea id="project-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm outline-none focus:border-[var(--ink)]" placeholder="Describe el problema que investigará el proyecto." />
          <p className="text-xs text-[var(--muted)]">Máximo 1000 caracteres.</p>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancelar</Button><Button type="submit" busy={busy}>{project ? 'Guardar cambios' : 'Crear proyecto'}</Button></div>
      </form>
    </Modal>
  )
}
