import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList } from 'lucide-react'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { TrainingMetricsChart } from '../training/TrainingMetricsChart.tsx'
import { TestEvaluationCard } from './TestEvaluationCard.tsx'
import { getProject } from '../../services/projects'
import { supabase } from '../../lib/supabase'
import { HISTORY_PAGE_SIZE, listHistoryPage, loadHistoryDetail } from '../../services/evaluationPersistence.ts'
import type { HistoryRun, HistoryPage } from '../../services/evaluationPersistence.ts'
import type { TestEvaluation } from '../../ml/evaluation/metrics.ts'
import type { EpochMetrics } from '../../ml/training/types.ts'

const LABELS: Record<string, string> = {
  created: 'Creada', preparing: 'Preparando', running: 'Último estado: ejecutándose (puede estar interrumpida)',
  completed: 'Completada', failed: 'Fallida', cancelled: 'Cancelada', interrupted: 'Interrumpida',
}

type Permission = 'checking' | 'allowed' | 'denied'

/** Historial remoto para TODOS los miembros. RLS protege lectura aunque se manipule la interfaz. */
export function TrainingHistoryPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [permission, setPermission] = useState<Permission>('checking')
  const [projectName, setProjectName] = useState('')
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<HistoryPage>({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<HistoryRun | null>(null)
  const [detail, setDetail] = useState<{ epochs: EpochMetrics[]; evaluation: TestEvaluation | null } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  useEffect(() => {
    let current = true
    setPermission('checking')
    void (async () => {
      if (!supabase || !projectId || !userId) throw new Error('Acceso denegado.')
      const [project, membership] = await Promise.all([
        getProject(projectId),
        supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
      ])
      if (membership.error) throw membership.error
      if (!project || !membership.data) throw new Error('Sin membresía activa en este proyecto.')
      if (current) { setProjectName(project.name); setPermission('allowed') }
    })().catch(() => { if (current) setPermission('denied') })
    return () => { current = false }
  }, [projectId, userId])

  useEffect(() => {
    if (permission !== 'allowed') return
    let current = true
    setLoading(true)
    setError('')
    void listHistoryPage(projectId, page).then((response) => {
      if (current) setResult(response)
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el historial.')
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [permission, projectId, page])

  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let current = true
    setDetail(null)
    setDetailLoading(true)
    setDetailError('')
    void loadHistoryDetail(selected.id, selected.problem_type).then((response) => {
      if (current) setDetail(response)
    }).catch((cause: unknown) => {
      if (current) setDetailError(cause instanceof Error ? cause.message : 'No se pudo abrir la ejecución.')
    }).finally(() => { if (current) setDetailLoading(false) })
    return () => { current = false }
  }, [selected])

  if (permission === 'checking') return <Surface className="p-8"><p role="status">Verificando permisos…</p></Surface>
  if (permission === 'denied') return <Notice tone="error">No tienes acceso al historial privado de este proyecto.</Notice>

  return <div className="space-y-6">
    <Link to={`/proyectos/${projectId}`} className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><ArrowLeft size={16}/> Volver al proyecto</Link>
    <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">M07 · Fase 4 · Evaluación e historial</p>
      <h1 className="mt-3 text-3xl font-semibold">Historial de entrenamientos</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{projectName} · Datos confirmados en Supabase, sin depender del CSV local.</p>
    </header>
    <Surface className="space-y-4 p-5 sm:p-7">
      <div className="flex items-center gap-2"><ClipboardList size={20}/><h2 className="text-lg font-semibold">Ejecuciones registradas</h2></div>
      {loading && <p role="status">Cargando historial…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && result.items.length === 0 && <p className="text-sm text-[var(--muted)]">No hay ejecuciones en esta página.</p>}
      {!loading && !error && result.items.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[650px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
            <th className="p-2">Fecha</th><th className="p-2">Problema</th><th className="p-2">Estado persistido</th><th className="p-2">Épocas</th><th className="p-2">Backend</th><th className="p-2">Detalle</th>
          </tr></thead>
          <tbody>{result.items.map((run) => <tr key={run.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-2">{new Date(run.created_at).toLocaleString('es-PE')}</td>
            <td className="p-2">{run.problem_type === 'binary' ? 'Binaria' : 'Regresión'}</td>
            <td className="p-2">{LABELS[run.status] ?? run.status}</td>
            <td className="p-2 tabular-nums">{run.completed_epochs}/{run.epochs_planned}</td>
            <td className="p-2">{run.backend?.toUpperCase() ?? '—'}</td>
            <td className="p-2"><button type="button" onClick={() => setSelected(run)} aria-pressed={selected?.id === run.id}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-muted)]">Ver métricas</button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={result.total} onPageChange={(next) => { setPage(next); setSelected(null) }}/>
    </Surface>
    {selected && <section className="space-y-4" aria-live="polite">
      <h2 className="break-all text-lg font-semibold">Detalle · {selected.id}</h2>
      {detailLoading && <p role="status" className="text-sm">Recuperando métricas confirmadas…</p>}
      {detailError && <Notice tone="error">{detailError}</Notice>}
      {detail && <>
        {detail.epochs.length ? <TrainingMetricsChart epochs={detail.epochs} problemType={selected.problem_type}/> : <Notice>No hay épocas completas confirmadas para representar.</Notice>}
        {detail.evaluation ? <TestEvaluationCard evaluation={detail.evaluation} confirmed/> :
          <Notice>No existe evaluación final guardada para esta ejecución. Es normal en entrenamientos de la Fase 3, cancelados o fallidos.</Notice>}
      </>}
    </section>}
  </div>
}
