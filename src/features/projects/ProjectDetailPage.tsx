import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Archive, Check, ClipboardList, FileText, FileSpreadsheet, ChartNoAxesCombined, Database, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Modal } from '../../components/ui/Modal'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { addMember, archiveProject, changeMemberRole, getProject, listMembers, removeMember, updateProject } from '../../services/projects'
import { projectRoleLabels, projectRoles } from '../../types/projects'
import type { Project, ProjectMember, ProjectRole } from '../../types/projects'
import { ProjectForm } from './ProjectForm'
import { MemberPermissionsModal } from './MemberPermissionsModal'

const MEMBER_PAGE_SIZE = 10
const memberRoleOptions = projectRoles.map((value) => ({ value, label: projectRoleLabels[value] }))

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const navigate = useNavigate()
  const { state } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ProjectRole>('reader')
  const [memberPage, setMemberPage] = useState(1)
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null)
  const [memberForPermissions, setMemberForPermissions] = useState<ProjectMember | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getProject(projectId)
      setProject(data)
      setMembers(data ? await listMembers(projectId) : [])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo abrir el proyecto.') }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { void reload() }, [reload])

  const currentUserId = state.status === 'ready' ? state.user.id : ''
  const admin = state.status === 'ready' && state.profile.is_platform_admin
  const isResponsible = members.some((member) => member.user_id === currentUserId && member.role === 'responsible')
  const isEngineer = members.some((member) => member.user_id === currentUserId && member.role === 'engineer')
  const isMember = members.some((member) => member.user_id === currentUserId)
  const canManage = (admin || isResponsible) && project?.status === 'active'
  const currentPage = Math.min(memberPage, Math.max(1, Math.ceil(members.length / MEMBER_PAGE_SIZE)))
  const pageMembers = useMemo(() => members.slice((currentPage - 1) * MEMBER_PAGE_SIZE, currentPage * MEMBER_PAGE_SIZE), [members, currentPage])

  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
      // Actualizar desde la fuente de verdad antes de confirmar visualmente la operación.
      const data = await getProject(projectId)
      setProject(data)
      setMembers(data ? await listMembers(projectId) : [])
      setNotice(success)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.')
      throw cause
    } finally { setBusy(false) }
  }

  if (loading) return <Surface className="p-8"><p role="status" className="text-sm text-[var(--muted)]">Cargando proyecto e integrantes…</p></Surface>
  if (!project) return (
    <div className="space-y-5"><Notice tone="error">{error || 'Proyecto no encontrado o no autorizado.'}</Notice></div>
  )

  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><h1 className="max-w-3xl break-words text-3xl font-semibold tracking-[-.04em]">{project.name}</h1><p className="mt-3 text-sm text-[var(--muted)]">{project.description || 'Proyecto sin descripción.'}</p></div>
        {canManage && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setEditing(true)}><Pencil size={16} /> Editar</Button><Button variant="outline" onClick={() => setArchiving(true)}><Archive size={16} /> Archivar</Button></div>}
      </div>
      <div className="flex flex-wrap gap-3 text-xs"><span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2">{project.status === 'active' ? 'Proyecto activo' : 'Proyecto archivado'}</span><span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2">Creado {new Date(project.created_at).toLocaleDateString('es-PE')}</span>{admin && !isResponsible && <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-2">Supervisión administrativa</span>}</div>
      {isEngineer && project.status === 'active' && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Dataset local</h2><p className="mt-2 text-sm text-[var(--muted)]">Importa y prepara un CSV sin subir sus filas a Supabase.</p><Link to={`/proyectos/${projectId}/datos`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><FileSpreadsheet size={16}/> Abrir preparador CSV</Link></Surface>}
      {isMember && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Evaluación e historial</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Consulta las métricas por época y las evaluaciones de prueba confirmadas en Supabase, sin recuperar el CSV.</p>
        <Link to={`/proyectos/${projectId}/historial`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><ChartNoAxesCombined size={16}/> Abrir historial</Link>
      </Surface>}
      {isMember && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Modelos privados</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Versiones inmutables de Feedforward, autorizadas por proyecto. Recupera pesos para inferencia sin CSV.</p>
        <Link to={`/proyectos/${projectId}/modelos`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><Database size={16}/> Abrir registro de modelos</Link>
      </Surface>}
      {isMember && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Reportes</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Ficha, arquitectura y hasta 200 entrenamientos recientes con exportación autorizada CSV/PDF.</p>
        <Link to={`/proyectos/${projectId}/reportes`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><FileText size={16}/> Abrir reportes</Link>
      </Surface>}
      {isResponsible && <Surface className="p-5 sm:p-7"><h2 className="text-lg font-semibold">Auditoría del proyecto</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Eventos paginados, filtros y exportación CSV, exclusivos del Responsable.</p>
        <Link to={`/proyectos/${projectId}/auditoria`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)]"><ClipboardList size={16}/> Ver auditoría</Link>
      </Surface>}
      {error && <Notice tone="error">{error} <button className="ml-2 underline" type="button" onClick={() => void reload()}>Reintentar</button></Notice>}
      {notice && <Notice tone="success">{notice}</Notice>}
      <Surface className="p-5 sm:p-7">
        <header className="flex flex-wrap items-center justify-between gap-3"><div><div className="flex items-center gap-2"><Users size={19} /><h2 className="text-lg font-semibold">Integrantes</h2></div><p className="mt-2 text-xs text-[var(--muted)]">Permisos por proyecto, independientes del Administrador global.</p></div>{canManage && <Button onClick={() => { setEmail(''); setRole('reader'); setAdding(true) }}><Plus size={16}/> Agregar integrante</Button>}</header>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="px-3 py-4 font-medium">Usuario</th><th className="px-3 py-4 font-medium">Rol de proyecto</th><th className="px-3 py-4 font-medium">Permisos</th><th className="px-3 py-4 text-right font-medium">Acciones</th></tr></thead>
            <tbody>{pageMembers.map((member) => {
              const immutable = member.user_id === currentUserId || member.user_id === project.owner_id
              return (<tr key={member.user_id} className="border-b border-[var(--line)] last:border-0"><td className="px-3 py-4"><p className="font-medium">{member.display_name}</p><p className="break-all text-xs text-[var(--muted)]">{member.email}</p></td><td className="px-3 py-4">{canManage && !immutable ? <SelectField aria-label={`Rol de ${member.display_name}`} value={member.role} disabled={busy} className="w-[190px]" options={memberRoleOptions} onChange={(event) => { const nextRole = event.target.value as ProjectRole; void perform(() => changeMemberRole(projectId, member.user_id, nextRole), 'Rol actualizado.').catch(() => {}) }} /> : <span className="text-xs">{projectRoleLabels[member.role]} {member.user_id === project.owner_id && '· Propietario'}</span>}</td><td className="px-3 py-4"><Button type="button" variant="ghost" aria-label={`Ver permisos de ${member.display_name}`} onClick={() => setMemberForPermissions(member)}>Ver</Button></td><td className="px-3 py-4 text-right">{canManage && !immutable && <Button type="button" variant="ghost" disabled={busy} aria-label={`Quitar a ${member.display_name}`} onClick={() => setMemberToRemove(member)}><Trash2 size={16}/></Button>}</td></tr>)
            })}</tbody></table>
          {!members.length && <p className="py-6 text-sm text-[var(--muted)]">Sin integrantes registrados.</p>}
          <Pagination page={currentPage} pageSize={MEMBER_PAGE_SIZE} total={members.length} onPageChange={setMemberPage}/>
        </div>
      </Surface>
      {admin && <p className="text-xs leading-6 text-[var(--muted)]">La administración global permite gestionar metadatos e integrantes, pero no concede automáticamente permisos sobre arquitecturas, datasets, entrenamientos o modelos privados.</p>}
      <MemberPermissionsModal member={memberForPermissions} projectStatus={project.status} onClose={() => setMemberForPermissions(null)} />
      <ProjectForm open={editing} project={project} onClose={() => setEditing(false)} onSave={async (values) => { await perform(() => updateProject(projectId, values.name, values.description), 'Proyecto actualizado y confirmado en Supabase.') }} />
      <Modal open={adding} title="Agregar integrante" onClose={() => { if (!busy) setAdding(false) }}>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void perform(() => addMember(projectId, email.trim(), role), 'Integrante incorporado al proyecto.').then(() => setAdding(false)).catch(() => {}) }}>
          <p className="text-sm leading-6 text-[var(--muted)]">La cuenta debe existir previamente en Supabase Auth y estar activa. No se crean usuarios desde aquí.</p>
          <InputField id="member-email" label="Correo electrónico" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
          <SelectField id="member-role" label="Rol en el proyecto" value={role} onChange={(event) => setRole(event.target.value as ProjectRole)} options={memberRoleOptions} />
          {error && <Notice tone="error">{error}</Notice>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancelar</Button><Button type="submit" busy={busy}><Check size={17}/> Agregar</Button></div>
        </form>
      </Modal>
      <Modal open={archiving} title="Archivar proyecto" onClose={() => { if (!busy) setArchiving(false) }}>
        <p className="text-sm leading-6">El proyecto dejará de admitir cambios. Se conservarán sus metadatos e integrantes para consulta. Esta acción no elimina datos físicamente.</p>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setArchiving(false)}>Cancelar</Button><Button busy={busy} onClick={() => { void perform(() => archiveProject(projectId), 'Proyecto archivado.').then(() => { setArchiving(false); navigate('/proyectos') }).catch(() => {}) }}>Confirmar archivo</Button></div>
      </Modal>
      <Modal open={memberToRemove !== null} title="Quitar integrante" onClose={() => { if (!busy) setMemberToRemove(null) }}>
        <p className="text-sm leading-6">¿Quitar a <strong>{memberToRemove?.display_name}</strong> del proyecto? Perderá inmediatamente el acceso a los datos de este proyecto.</p>
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setMemberToRemove(null)}>Cancelar</Button><Button busy={busy} onClick={() => { if (!memberToRemove) return; void perform(() => removeMember(projectId, memberToRemove.user_id), 'Integrante retirado.').then(() => setMemberToRemove(null)).catch(() => {}) }}>Quitar integrante</Button></div>
      </Modal>
    </div>
  )
}
