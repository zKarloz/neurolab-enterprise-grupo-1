import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ClipboardList, GitCompareArrows } from 'lucide-react'
import { SelectField } from '../../components/ui/SelectField'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { TrainingMetricsChart } from '../training/TrainingMetricsChart.tsx'
import { TestEvaluationCard } from './TestEvaluationCard.tsx'
import { RunComparison } from './RunComparison.tsx'
import { getProject } from '../../services/projects'
import { supabase } from '../../lib/supabase'
import { HISTORY_PAGE_SIZE, listHistoryPage, loadHistoryDetail } from '../../services/evaluationPersistence.ts'
import type { HistoryRun, HistoryPage, HistoryDetail } from '../../services/evaluationPersistence.ts'
import { CnnStoredEvaluationCard } from './CnnStoredEvaluationCard.tsx'
import { RnnStoredEvaluationCard } from './RnnStoredEvaluationCard.tsx'
import { GanStoredEvaluationCard } from './GanStoredEvaluationCard.tsx'
import { GanRunComparison } from './GanRunComparison.tsx'
import { GanMetricsChart } from '../gan/GanMetricsChart.tsx'
import { isGanStoredEvaluation } from '../../ml/evaluation/ganStoredEvaluation.ts'
import { isRnnStoredEvaluation } from '../../ml/evaluation/rnnStoredEvaluation.ts'
import { compatibleHistoryRuns, familyLabel, problemLabel, type FamilyFilter } from '../../ml/evaluation/families.ts'

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
  const [family, setFamily] = useState<FamilyFilter>('all')
  const [result, setResult] = useState<HistoryPage>({ items: [], total: 0 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<HistoryRun | null>(null)
  const [detail, setDetail] = useState<HistoryDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [comparison, setComparison] = useState<HistoryRun[]>([])
  const [comparedDetails, setComparedDetails] = useState<[HistoryDetail, HistoryDetail] | null>(null)
  const [comparisonBusy, setComparisonBusy] = useState(false)
  const [comparisonError, setComparisonError] = useState('')

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
    void listHistoryPage(projectId, page, family).then((response) => {
      if (current) setResult(response)
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'No se pudo consultar el historial.')
    }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [permission, projectId, page, family])

  useEffect(() => {
    if (!selected) { setDetail(null); return }
    let current = true
    setDetail(null)
    setDetailLoading(true)
    setDetailError('')
    void loadHistoryDetail(selected.id, selected.problem_type, selected.family).then((response) => {
      if (current) setDetail(response)
    }).catch((cause: unknown) => {
      if (current) setDetailError(cause instanceof Error ? cause.message : 'No se pudo abrir la ejecución.')
    }).finally(() => { if (current) setDetailLoading(false) })
    return () => { current = false }
  }, [selected])

  // Se consultan solamente los dos IDs seleccionados desde la lista filtrada por RLS.
  useEffect(() => {
    if (comparison.length !== 2) { setComparedDetails(null); setComparisonError(''); return }
    let current = true
    setComparisonBusy(true)
    setComparisonError('')
    setComparedDetails(null)
    void Promise.all(comparison.map((run) => loadHistoryDetail(run.id, run.problem_type, run.family)))
      .then((details) => { if (current) setComparedDetails(details as [HistoryDetail, HistoryDetail]) })
      .catch((cause: unknown) => { if (current) setComparisonError(cause instanceof Error ? cause.message : 'No se pudo comparar las ejecuciones.') })
      .finally(() => { if (current) setComparisonBusy(false) })
    return () => { current = false }
  }, [comparison])

  function toggleCompare(run: HistoryRun) {
    setComparison((previous) => {
      if (previous.some((item) => item.id === run.id)) return previous.filter((item) => item.id !== run.id)
      if (previous.length === 2) return previous
      if (previous.length === 1 && !compatibleHistoryRuns(previous[0], run)) return previous
      return [...previous, run]
    })
  }

  if (permission === 'checking') return <Surface className="p-8"><p role="status">Verificando permisos…</p></Surface>
  if (permission === 'denied') return <Notice tone="error">No tienes acceso al historial privado de este proyecto.</Notice>

  return <div className="space-y-6">
    <header>
      <h1 className="text-3xl font-semibold">Historial de entrenamientos</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{projectName} · Datos confirmados en Supabase, sin depender del CSV local. Feedforward, CNN, RNN y GAN con métricas confirmadas y filtros por familia.</p>
    </header>
    <Surface className="space-y-4 p-5 sm:p-7">
      <div className="flex items-center gap-2"><ClipboardList size={20}/><h2 className="text-lg font-semibold">Ejecuciones registradas</h2></div>
      <p className="text-sm text-[var(--muted)]">Filtra por familia y selecciona dos ejecuciones completadas de la misma familia y tipo de problema. Puedes elegirlas en distintas páginas del mismo filtro.</p>
      <div className="max-w-xs"><SelectField id="history-family" label="Familia de red" value={family} options={[{ value: 'all', label: 'Todas las familias' }, { value: 'feedforward', label: 'Feedforward' }, { value: 'cnn', label: 'CNN' }, { value: 'rnn', label: 'RNN' }, { value: 'gan', label: 'GAN' }]} onChange={(event) => { setFamily(event.target.value as FamilyFilter); setPage(1); setSelected(null); setComparison([]) }}/></div>
      {comparison.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
        <span>{comparison.length}/2 seleccionadas</span>
        {comparison.map((run, index) => <span key={run.id} className="rounded-lg border border-[var(--line)] p-2">{index === 0 ? 'A' : 'B'} · {run.id.slice(0, 8)}</span>)}
        <Button variant="ghost" type="button" onClick={() => setComparison([])}>Limpiar comparación</Button>
      </div>}
      {loading && <p role="status">Cargando historial…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {!loading && !error && result.items.length === 0 && <p className="text-sm text-[var(--muted)]">No hay ejecuciones en esta página.</p>}
      {!loading && !error && result.items.length > 0 && <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]">
            <th className="p-2">Fecha</th><th className="p-2">Familia</th><th className="p-2">Problema</th><th className="p-2">Estado persistido</th><th className="p-2">Épocas</th><th className="p-2">Backend</th><th className="p-2">Detalle</th><th className="p-2">Comparar</th>
          </tr></thead>
          <tbody>{result.items.map((run) => <tr key={run.id} className="border-b border-[var(--line)] last:border-0">
            <td className="p-2">{new Date(run.created_at).toLocaleString('es-PE')}</td>
            <td className="p-2">{familyLabel(run.family)}</td><td className="p-2">{problemLabel(run.problem_type)}</td>
            <td className="p-2">{LABELS[run.status] ?? run.status}</td>
            <td className="p-2 tabular-nums">{run.completed_epochs}/{run.epochs_planned}</td>
            <td className="p-2">{run.backend?.toUpperCase() ?? '—'}</td>
            <td className="p-2"><Button variant="outline" type="button" onClick={() => setSelected(run)} aria-pressed={selected?.id === run.id}>Ver métricas</Button></td>
            <td className="p-2"><Button variant="outline" type="button" aria-pressed={comparison.some((item) => item.id === run.id)}
              disabled={run.status !== 'completed' || (!comparison.some((item) => item.id === run.id) &&
                (comparison.length >= 2 || (comparison.length === 1 && !compatibleHistoryRuns(comparison[0], run))))}
              onClick={() => toggleCompare(run)}><GitCompareArrows size={15} aria-hidden="true"/>{comparison.some((item) => item.id === run.id) ? 'Quitar' : 'Comparar'}</Button></td>
          </tr>)}</tbody>
        </table>
      </div>}
      <Pagination page={page} pageSize={HISTORY_PAGE_SIZE} total={result.total} onPageChange={(next) => { setPage(next); setSelected(null) }}/>
    </Surface>
    {comparisonBusy && <p role="status" className="text-sm">Recuperando dos ejecuciones para comparar…</p>}
    {comparisonError && <Notice tone="error">{comparisonError}</Notice>}
    {comparison.length === 2 && comparedDetails && (comparison[0].family === 'gan'
      ? <GanRunComparison first={comparison[0]} second={comparison[1]} firstDetail={comparedDetails[0]} secondDetail={comparedDetails[1]}/>
      : <RunComparison first={comparison[0]} second={comparison[1]} firstDetail={comparedDetails[0]} secondDetail={comparedDetails[1]}/>)}
    {selected && <section className="space-y-4" aria-live="polite">
      <h2 className="break-all text-lg font-semibold">Detalle · {selected.id}</h2>
      {detailLoading && <p role="status" className="text-sm">Recuperando métricas confirmadas…</p>}
      {detailError && <Notice tone="error">{detailError}</Notice>}
      {detail && <>
        {selected.family === 'gan'
          ? (detail.ganEpochs.length ? <GanMetricsChart epochs={detail.ganEpochs}/> : <Notice>Sin épocas GAN completas confirmadas.</Notice>)
          : (detail.epochs.length ? <TrainingMetricsChart epochs={detail.epochs} problemType={selected.problem_type}/> : <Notice>No hay épocas completas confirmadas para representar.</Notice>)}
        {detail.evaluation ? isGanStoredEvaluation(detail.evaluation)
          ? <GanStoredEvaluationCard evaluation={detail.evaluation}/>
          : isRnnStoredEvaluation(detail.evaluation)
          ? <RnnStoredEvaluationCard evaluation={detail.evaluation}/>
          : detail.evaluation.problemType === 'multiclass'
            ? <CnnStoredEvaluationCard evaluation={detail.evaluation}/>
            : <TestEvaluationCard evaluation={detail.evaluation} confirmed/> :
          <Notice>No existe evaluación o resumen final guardado para esta ejecución. Es normal en entrenamientos antiguos, cancelados o fallidos.</Notice>}
      </>}
    </section>}
  </div>
}
