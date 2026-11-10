import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, Download, Filter, ShieldCheck } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { AUDIT_ACTION_LABELS, AUDIT_PAGE_SIZE, EXPORT_LIMIT, listAuditEvents, recordExport, requireProjectMember } from '../../services/reporting'
import type { AuditEvent, AuditFilter } from '../../services/reporting'
import { saveCsv, toCsv } from '../../ml/reports/csv'

const EMPTY: AuditFilter = { action: '', fromDate: '' }

/** M10: vista auditada, paginada en BD, sin exponer metadata_json en tabla ni exportación. */
export function AuditEventsPage() {
  const { projectId } = useParams()
  const scope = projectId ?? null
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const globalAdmin = state.status === 'ready' && state.profile.is_platform_admin
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<AuditFilter>(EMPTY)
  const [result, setResult] = useState<{ events: AuditEvent[]; total: number }>({ events: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    setChecking(true)
    setAuthorized(false)
    void (async () => {
      if (!userId) throw new Error('Debes iniciar sesión.')
      if (scope) {
        const role = await requireProjectMember(scope, userId)
        if (role !== 'responsible') throw new Error('Solo el Responsable puede consultar auditoría del proyecto.')
      } else if (!globalAdmin) throw new Error('Solo el Administrador global puede consultar esta auditoría.')
      if (live) setAuthorized(true)
    })().catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : 'No autorizado.')
    }).finally(() => { if (live) setChecking(false) })
    return () => { live = false }
  }, [scope, userId, globalAdmin])

  useEffect(() => {
    if (!authorized) return
    let live = true
    setLoading(true)
    setError('')
    void listAuditEvents(scope, page, filter).then((items) => {
      if (live) setResult(items)
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : 'No se pudo consultar la auditoría.')
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [scope, page, filter, authorized])

  const actions = useMemo(() => Object.entries(AUDIT_ACTION_LABELS).filter(([key]) =>
    scope || /^(admin_|project_|member_|audit_export)/.test(key)), [scope])

  async function exportAudit() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      // Volver a consultar y revalidar permisos antes de generar un archivo local.
      const snapshot = await listAuditEvents(scope, 1, filter, EXPORT_LIMIT)
      await recordExport(scope, 'audit_csv')
      const rows = snapshot.events.map((item) => [
        item.id, item.created_at, AUDIT_ACTION_LABELS[item.action] ?? item.action,
        item.actor_id, item.project_id ?? '', item.resource_type, item.resource_id,
      ])
      saveCsv(`neurolab-auditoria-${scope?.slice(0, 8) ?? 'global'}.csv`, toCsv(
        ['evento_id','fecha_utc','accion','actor_id','proyecto_id','recurso_tipo','recurso_id'], rows,
      ))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar la auditoría.')
    } finally { setBusy(false) }
  }

  if (checking) return <Surface className="p-8"><Spinner centered label="Verificando acceso a la auditoría…"/></Surface>
  if (!authorized) return <Notice tone="error">{error || 'Auditoría restringida según rol y proyecto.'}</Notice>

  return <div className="space-y-6">
    {/* El retroceso de auditoría por proyecto lo proporciona AppShell. */}
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-3xl font-semibold">Auditoría de acciones</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{scope ? 'Eventos del proyecto: acceso exclusivo al Responsable.' : 'Eventos administrativos globales y de gestión de proyectos.'}</p>
      </div>
      <Button type="button" variant="outline" busy={busy} onClick={() => void exportAudit()}><Download size={16}/> Exportar CSV</Button>
    </header>
    <Surface className="space-y-5 p-5 sm:p-7">
      <div className="flex items-center gap-2"><Filter size={18}/><h2 className="text-lg font-semibold">Filtros</h2></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Acción
          <select className="mt-2 block h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[var(--ink)]"
            value={filter.action} onChange={(event) => { setFilter({ ...filter, action: event.target.value }); setPage(1) }}>
            <option value="">Todas las acciones permitidas</option>
            {actions.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </label>
        <label className="text-sm">Desde fecha (UTC)
          <input type="date" className="mt-2 block h-11 w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 text-[var(--ink)]"
            value={filter.fromDate} onChange={(event) => { setFilter({ ...filter, fromDate: event.target.value }); setPage(1) }}/>
        </label>
      </div>
      <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={15}/> RLS filtra los eventos en PostgreSQL. Se ocultan los metadatos internos y no se exportan contraseñas ni tokens.</div>
    </Surface>
    <Surface className="space-y-4 p-5 sm:p-7">
      <div className="flex items-center gap-2"><ClipboardList size={19}/><h2 className="text-lg font-semibold">Registro cronológico</h2></div>
      {loading && <Spinner label="Consultando eventos…" />}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && result.events.length === 0 && <Notice>No hay eventos visibles con estos filtros.</Notice>}
      {!loading && !error && result.events.length > 0 && <div className="overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm">
        <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="p-3">Fecha</th><th className="p-3">Acción</th><th className="p-3">Actor</th><th className="p-3">Recurso</th></tr></thead>
        <tbody>{result.events.map((item) => <tr key={item.id} className="border-b border-[var(--line)] last:border-0">
          <td className="whitespace-nowrap p-3">{new Date(item.created_at).toLocaleString('es-PE')}</td>
          <td className="p-3 font-medium">{AUDIT_ACTION_LABELS[item.action] ?? item.action}</td>
          <td className="p-3 font-mono text-xs" title={item.actor_id}>{item.actor_id.slice(0, 8)}…</td>
          <td className="p-3 text-xs">{item.resource_type} · {item.resource_id.slice(0, 8)}…</td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination page={page} pageSize={AUDIT_PAGE_SIZE} total={result.total} onPageChange={setPage}/>
      <p className="text-xs text-[var(--muted)]">Exportación limitada a los 200 eventos recientes que cumplan los filtros. Cada solicitud queda registrada y no altera eventos existentes.</p>
    </Surface>
  </div>
}
