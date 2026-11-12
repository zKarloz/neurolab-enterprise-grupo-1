import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, ArrowRight, FolderKanban, Plus, Search } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Modal } from '../../components/ui/Modal'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import { createProject, listProjects, listResponsibleProjectIds, restoreProject } from '../../services/projects'
import type { Project, ProjectStatus } from '../../types/projects'
import { useAuth } from '../auth/AuthProvider'
import { ProjectForm } from './ProjectForm'

const PAGE_SIZE = 9

type StatusFilter = 'all' | ProjectStatus

export function ProjectsPage() {
  const navigate = useNavigate()
  const { state } = useAuth()
  const currentUserId = state.status === 'ready' ? state.user.id : null
  const [projects, setProjects] = useState<Project[]>([])
  const [responsibleIds, setResponsibleIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('active')
  const [page, setPage] = useState(1)
  const [createOpen, setCreateOpen] = useState(false)
  const [restoring, setRestoring] = useState<Project | null>(null)
  const [restoringBusy, setRestoringBusy] = useState(false)
  const [notice, setNotice] = useState('')

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [rows, ownResponsibleIds] = await Promise.all([
        listProjects(), currentUserId ? listResponsibleProjectIds(currentUserId) : Promise.resolve([]),
      ])
      setProjects(rows)
      setResponsibleIds(ownResponsibleIds)
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudieron consultar proyectos.') }
    finally { setLoading(false) }
  }, [currentUserId])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => { setPage(1) }, [search, filter])

  const visible = useMemo(() => projects.filter((project) => {
    const matchesText = `${project.name} ${project.description}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))
    return matchesText && (filter === 'all' || project.status === filter)
  }), [projects, search, filter])
  const currentPage = Math.min(page, Math.max(1, Math.ceil(visible.length / PAGE_SIZE)))
  const shown = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  // El filtro sigue leyendo datos protegidos por RLS, incluso para proyectos archivados.
  const archivedCount = projects.filter((project) => project.status === 'archived').length
  const platformAdmin = state.status === 'ready' && state.profile.is_platform_admin
  const canRestore = (project: Project) =>
    project.status === 'archived' && (platformAdmin || responsibleIds.includes(project.id))

  // La restauración requiere confirmación y se ejecuta únicamente por la RPC autorizada.
  async function confirmRestore() {
    if (!restoring || restoringBusy) return
    const selected = restoring
    setRestoringBusy(true)
    setError('')
    setNotice('')
    try {
      await restoreProject(selected.id)
      // El servidor confirmó el cambio; refrescamos datos sin falsear la respuesta.
      setProjects((previous) => previous.map((item) =>
        item.id === selected.id ? { ...item, status: 'active' } : item))
      setRestoring(null)
      setFilter('active')
      setSearch('')
      setNotice(`Proyecto «${selected.name}» restaurado y activo.`)
      void reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo restaurar el proyecto.')
    } finally {
      setRestoringBusy(false)
    }
  }

  // El backend vuelve a validar si este usuario tiene derecho a crear proyectos.
  const canCreate = state.status === 'ready' && (
    state.profile.is_platform_admin || projects.some((project) => project.status === 'active' && responsibleIds.includes(project.id))
  )

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          
          <h1 className="text-3xl font-semibold tracking-[-.04em]">Proyectos</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">Gestiona proyectos e integrantes autorizados. Los datos se recuperan desde Supabase.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" aria-pressed={filter === 'archived'} onClick={() => { setFilter('archived'); setSearch('') }}>
            <Archive size={17} aria-hidden="true" /> Archivados ({archivedCount})
          </Button>
          {canCreate && <Button onClick={() => setCreateOpen(true)}><Plus size={17} aria-hidden="true" /> Nuevo proyecto</Button>}
        </div>
      </header>
      <Surface className="p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <InputField id="search-projects" label="Buscar proyectos" placeholder="Nombre o descripción" value={search} onChange={(event) => setSearch(event.target.value)} endSlot={<Search className="size-4 text-[var(--muted)]" />} />
          <SelectField
            id="project-filter"
            label="Estado"
            className="sm:min-w-44"
            value={filter}
            onChange={(event) => setFilter(event.target.value as StatusFilter)}
            options={[{ value: 'active', label: 'Activos' }, { value: 'archived', label: 'Archivados' }, { value: 'all', label: 'Todos' }]}
          />
        </div>
      </Surface>
      {error && <Notice tone="error">{error} <button type="button" className="ml-2 underline" onClick={() => void reload()}>Reintentar</button></Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      {loading ? <Surface className="p-8 text-sm text-[var(--muted)]" ><p role="status">Consultando tus proyectos…</p></Surface> : (
        <>
          {shown.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shown.map((project) => (
                <article key={project.id} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-11 place-items-center rounded-xl bg-[var(--surface-muted)]"><FolderKanban size={20} /></span>
                    <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)]">{project.status === 'active' ? 'Activo' : 'Archivado'}</span>
                  </div>
                  <h2 className="mt-5 line-clamp-2 text-base font-semibold">{project.name}</h2>
                  <p className="mt-2 line-clamp-3 min-h-12 text-sm leading-6 text-[var(--muted)]">{project.description || 'Proyecto sin descripción.'}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-4 text-xs text-[var(--muted)]">
                    <span>Creado {new Date(project.created_at).toLocaleDateString('es-PE')}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/proyectos/${project.id}`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 font-semibold text-[var(--ink)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
                        Abrir <ArrowRight size={14} aria-hidden="true" />
                      </Link>
                      {canRestore(project) && <Button type="button" variant="outline" disabled={restoringBusy} onClick={() => setRestoring(project)}>
                        <ArchiveRestore size={16} aria-hidden="true" /> Restaurar
                      </Button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : <Surface className="p-10 text-center"><FolderKanban className="mx-auto size-9 text-[var(--muted)]" /><h2 className="mt-4 font-semibold">No hay proyectos en esta vista</h2><p className="mt-2 text-sm text-[var(--muted)]">Prueba otro filtro o crea un proyecto si tienes autorización.</p></Surface>}
          <Pagination page={currentPage} pageSize={PAGE_SIZE} total={visible.length} onPageChange={setPage} />
        </>
      )}
      <Modal open={restoring !== null} title="Restaurar proyecto archivado" onClose={() => { if (!restoringBusy) setRestoring(null) }}>
        <p className="text-sm leading-6">¿Restaurar «{restoring?.name}»? Volverá a estar activo. Se conservarán sus integrantes, entrenamientos y modelos; no se crearán copias.</p>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={restoringBusy} onClick={() => setRestoring(null)}>Cancelar</Button>
          <Button type="button" busy={restoringBusy} onClick={() => { void confirmRestore() }}><ArchiveRestore size={16} aria-hidden="true" /> Confirmar restauración</Button>
        </div>
      </Modal>
      <ProjectForm open={createOpen} onClose={() => setCreateOpen(false)} onSave={async ({ name, description }) => {
        const id = await createProject(name, description)
        navigate(`/proyectos/${id}`)
      }} />
    </div>
  )
}
