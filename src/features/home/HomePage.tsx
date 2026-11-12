import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FolderKanban,
  History, PlayCircle, RefreshCw, ShieldCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { getDashboardSnapshot } from '../../services/dashboard'
import type { DashboardSnapshot } from '../../services/dashboard'
import {
  buildDashboardAlerts, countProjectStatuses, dashboardFamilyLabel,
  trainingStatusLabels,
} from './dashboardLogic'
import type { DashboardTrainingStatus } from './dashboardLogic'
import { useAuth } from '../auth/AuthProvider'

const ROWS_PER_PAGE = 8

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
}

function statusStyle(status: DashboardTrainingStatus) {
  if (status === 'failed' || status === 'interrupted') return 'text-[var(--ink)] border-[var(--line)] bg-[var(--surface-muted)]'
  if (status === 'completed') return 'text-[var(--ink)] border-[var(--line)] bg-[var(--surface)]'
  return 'text-[var(--muted)] border-[var(--line)] bg-[var(--surface-muted)]'
}

// M01: fuente única de datos autorizados por RLS. No se muestran cifras simuladas.
export function HomePage() {
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : null
  const firstName = state.status === 'ready'
    ? state.profile.display_name.trim().split(/\s+/)[0] || 'usuario'
    : 'usuario'
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const requestSequence = useRef(0)

  const reload = useCallback(async () => {
    const requestId = ++requestSequence.current
    setLoading(true)
    setError('')
    try {
      const result = await getDashboardSnapshot()
      if (requestId !== requestSequence.current) return
      setSnapshot(result)
      setPage(1)
    } catch (cause) {
      if (requestId !== requestSequence.current) return
      setSnapshot(null) // Nunca presentar contadores anteriores como si fueran actuales.
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los indicadores.')
    } finally {
      if (requestId === requestSequence.current) setLoading(false)
    }
  }, [])

  // Invalida peticiones tardías al cambiar de cuenta o desmontar la pantalla.
  useEffect(() => {
    if (userId) void reload()
    return () => { requestSequence.current += 1 }
  }, [reload, userId])

  if (state.status !== 'ready') return null

  const projectCounts = countProjectStatuses(snapshot?.projects ?? [])
  const counters = snapshot?.counters
  const alerts = counters ? buildDashboardAlerts(counters, projectCounts.archived) : []
  const runs = snapshot?.runs ?? []
  const projectById = new Map(snapshot?.projects.map((project) => [project.id, project] as const) ?? [])
  const pages = Math.max(1, Math.ceil(runs.length / ROWS_PER_PAGE))
  const currentPage = Math.min(page, pages)
  const visibleRuns = runs.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE)
  const recentProjects = (snapshot?.projects ?? []).slice(0, 4)

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--muted)]">M01 · Inicio / Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Hola, {firstName}.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            Actividad de tus proyectos y entrenamientos consultables en Supabase, según tus permisos.
          </p>
        </div>
        <Button type="button" variant="outline" busy={loading} onClick={() => void reload()}>
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </Button>
      </header>

      {error && <Notice tone="error">{error} <button type="button" className="ml-2 font-semibold underline" onClick={() => void reload()}>Reintentar</button></Notice>}
      {loading && <Surface className="flex items-center gap-3 p-5"><Spinner size="sm" label="Consultando actividad autorizada…" /></Surface>}

      {snapshot && !loading && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de uso">
          <MetricCard icon={FolderKanban} label="Proyectos activos" value={projectCounts.active} detail={`${projectCounts.archived} archivado(s) · ${snapshot.projects.length} visibles`} />
          <MetricCard icon={PlayCircle} label="Entrenamientos en curso" value={counters?.activeRuns ?? 0} detail="Estados registrados: preparando o ejecutando" />
          <MetricCard icon={CheckCircle2} label="Completados · 30 días" value={counters?.completedLast30Days ?? 0} detail="Finalizaciones registradas en el último mes" />
          <MetricCard icon={Activity} label="Iniciados · 30 días" value={counters?.runsLast30Days ?? 0} detail="Uso reciente accesible para tu cuenta" />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
          <Surface className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-semibold tracking-tight">Resumen de proyectos</h2><p className="mt-1 text-xs text-[var(--muted)]">Últimos cuatro proyectos visibles para tu perfil.</p></div>
              <Link className="inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4" to="/proyectos">Ver todos <ArrowUpRight size={15} aria-hidden="true" /></Link>
            </div>
            {recentProjects.length ? <ul className="mt-4 divide-y divide-[var(--line)]">
              {recentProjects.map((project) => <li key={project.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0"><Link className="block truncate text-sm font-semibold hover:underline" to={`/proyectos/${project.id}`}>{project.name}</Link><span className="text-xs text-[var(--muted)]">Creado {formatDate(project.created_at)}</span></div>
                <span className="shrink-0 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs text-[var(--muted)]">{project.status === 'active' ? 'Activo' : 'Archivado'}</span>
              </li>)}
            </ul> : <p className="mt-5 text-sm text-[var(--muted)]">No tienes proyectos visibles. Consulta la asignación de miembros o crea uno si estás autorizado.</p>}
          </Surface>

          <Surface className="p-5 sm:p-6">
            <div className="flex items-center gap-2"><AlertTriangle size={19} aria-hidden="true" /><h2 className="text-lg font-semibold">Alertas y estado</h2></div>
            <p className="mt-1 text-xs text-[var(--muted)]">Condiciones detectadas en registros accesibles; no es monitoreo del navegador ni del servidor en tiempo real.</p>
            {alerts.length ? <ul className="mt-4 space-y-3">
              {alerts.map((alert) => <li key={alert.id} className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-3">
                <div className="flex gap-2"><span className="mt-0.5 shrink-0">{alert.severity === 'warning' ? <AlertTriangle size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}</span><div><h3 className="text-sm font-semibold">{alert.title}</h3><p className="mt-1 text-xs leading-5 text-[var(--muted)]">{alert.detail}</p></div></div>
              </li>)}
            </ul> : <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--line)] p-3"><ShieldCheck size={18} aria-hidden="true" /><p className="text-sm">Sin alertas detectadas en las consultas actuales.</p></div>}
            <p className="mt-4 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
              <Clock3 size={14} className="mr-1 inline" aria-hidden="true" /> Actualizado {formatDate(snapshot.refreshedAt)}
            </p>
          </Surface>
        </div>

        <Surface className="p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><div className="flex items-center gap-2"><History size={19} aria-hidden="true" /><h2 className="text-lg font-semibold tracking-tight">Entrenamientos recientes</h2></div><p className="mt-1 text-xs text-[var(--muted)]">Últimas 32 ejecuciones registradas y visibles, de todas las familias.</p></div>
            <p className="text-xs text-[var(--muted)]">{counters?.activeRuns ?? 0} en curso · {counters?.queuedRuns ?? 0} registradas sin iniciar</p>
          </div>
          {visibleRuns.length ? <>
            <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--line)]">
              <table className="w-full min-w-[680px] text-left text-sm">
                <caption className="sr-only">Ejecuciones recientes consultables por el usuario</caption>
                <thead className="bg-[var(--surface-muted)] text-xs text-[var(--muted)]"><tr>
                  <th className="px-4 py-3 font-semibold" scope="col">Proyecto</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Familia</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Estado</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Progreso registrado</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Fecha</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Acción</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {visibleRuns.map((run) => <tr key={run.id}>
                    <td className="max-w-44 truncate px-4 py-3 font-medium" title={projectById.get(run.project_id)?.name}>{projectById.get(run.project_id)?.name ?? 'No disponible'}</td>
                    <td className="px-4 py-3">{dashboardFamilyLabel(snapshot.architectureFamilies[run.architecture_id])}</td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusStyle(run.status)}`}>{trainingStatusLabels[run.status] ?? 'Desconocido'}</span></td>
                    <td className="px-4 py-3 tabular-nums">{run.completed_epochs} / {run.epochs_planned} épocas</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--muted)]">{formatDate(run.created_at)}</td>
                    <td className="px-4 py-3"><Link to={`/proyectos/${run.project_id}/historial`} className="text-xs font-semibold underline underline-offset-4">Ver historial</Link></td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <Pagination page={currentPage} pageSize={ROWS_PER_PAGE} total={runs.length} onPageChange={setPage} />
          </> : <p className="mt-5 text-sm text-[var(--muted)]">Aún no hay entrenamientos registrados que puedas consultar. Los entrenamientos locales no persistidos no aparecen aquí.</p>}
          <p className="mt-4 text-xs leading-5 text-[var(--muted)]">«En curso» representa el último estado confirmado en Supabase; no garantiza que un Worker siga activo en otro navegador. El Administrador global necesita membresía explícita para consultar recursos técnicos.</p>
        </Surface>
      </>}
    </div>
  )
}

// Tarjeta compartida dentro de M01; mantiene el mismo patrón visual de Surface.
function MetricCard({ icon: Icon, label, value, detail }: {
  icon: LucideIcon
  label: string
  value: number
  detail: string
}) {
  return <Surface className="p-5">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold uppercase tracking-[.10em] text-[var(--muted)]">{label}</span><Icon size={19} className="shrink-0 text-[var(--muted)]" aria-hidden="true" /></div>
    <p className="mt-4 text-3xl font-semibold tabular-nums tracking-tight">{value.toLocaleString('es-PE')}</p>
    <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{detail}</p>
  </Surface>
}
