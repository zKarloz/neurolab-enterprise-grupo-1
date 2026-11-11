import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Download, FileText, Printer, Layers, Database, ChartNoAxesCombined, Box } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Pagination } from '../../components/ui/Pagination'
import { SelectField } from '../../components/ui/SelectField'
import { familyForReportProblem, familyLabel, reportRunsByFamily, type FamilyFilter } from '../../ml/evaluation/families.ts'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { loadProjectReport, recordExport } from '../../services/reporting'
import type { ProjectReportSnapshot } from '../../services/reporting'
import { saveCsv, toCsv } from '../../ml/reports/csv'
import { FormalReportDocument } from './FormalReportDocument'
import './formalReportPrint.css'

const PAGE_SIZE = 10
const statusNames: Record<string, string> = {
  completed: 'Completada', failed: 'Fallida', cancelled: 'Cancelada',
  interrupted: 'Interrumpida', created: 'Creada', preparing: 'Preparando', running: 'En ejecución',
}

function metric(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(4) : '—'
}

/** M09: instantánea de metadatos protegidos por RLS; nunca consulta ni exporta filas del CSV original. */
export function ProjectReportPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [data, setData] = useState<ProjectReportSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [family, setFamily] = useState<FamilyFilter>('all')

  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    setData(null)
    void loadProjectReport(projectId, userId).then((snapshot) => {
      if (live) setData(snapshot)
    }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : 'No se pudo elaborar el reporte.')
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [projectId, userId])

  const filteredRuns = useMemo(() => reportRunsByFamily(data?.runs ?? [], family), [data, family])
  const pageRuns = useMemo(() => filteredRuns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filteredRuns, page])
  const evaluationByRun = useMemo(() => new Map<string, Record<string, unknown>>(data?.evaluations.map((item): [string, Record<string, unknown>] => [item.run_id, item.metrics_json]) ?? []), [data])
  const architecturesById = useMemo(() => new Map<string, string>(data?.architectures.map((row): [string, string] => [row.id, row.name]) ?? []), [data])
  const datasetsById = useMemo(() => new Map<string, string>(data?.datasets.map((row): [string, string] => [row.id, row.name]) ?? []), [data])
  const completed = data?.runs.filter((run) => run.status === 'completed').length ?? 0

  async function exportReport(format: 'csv' | 'pdf') {
    if (!data || busy) return
    setBusy(true)
    setError('')
    try {
      // El servidor verifica permisos de nuevo antes de generar el archivo.
      await recordExport(projectId, format === 'csv' ? 'report_csv' : 'report_pdf')
      if (format === 'pdf') {
        window.print() // Solo la plantilla formal se muestra al imprimir; no se imprime el módulo.
      } else {
        const rows = filteredRuns.map((run) => {
          const evaluation = evaluationByRun.get(run.id) ?? {}
          return [run.id, run.created_at, familyForReportProblem(run.problem_type) ?? 'desconocida', run.problem_type, run.status, run.completed_epochs,
            run.epochs_planned, run.backend ?? '', architecturesById.get(run.architecture_id) ?? '',
            datasetsById.get(run.dataset_id) ?? '', evaluation.loss ?? '', evaluation.accuracy ?? '',
            evaluation.precision ?? '', evaluation.recall ?? '', evaluation.f1 ?? '', evaluation.mse ?? '',
            evaluation.rmse ?? '', evaluation.mae ?? '', evaluation.r2 ?? '',
            evaluation.macroPrecision ?? '', evaluation.macroRecall ?? '', evaluation.macroF1 ?? '']
        })
        saveCsv(`neurolab-reporte-${projectId.slice(0, 8)}-${family}.csv`, toCsv(
          ['run_id','fecha','familia','problema','estado','epocas_confirmadas','epocas_planificadas','backend',
            'arquitectura','dataset','loss_test','accuracy_test','precision_test','recall_test',
            'f1_test','mse_test','rmse_test','mae_test','r2_test',
            'precision_macro','recall_macro','f1_macro'], rows,
        ))
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el reporte.')
    } finally { setBusy(false) }
  }

  if (loading) return <Surface className="p-8"><Spinner centered label="Construyendo reporte autorizado…" /></Surface>
  if (!data) return <Notice tone="error">{error || 'Reporte no disponible. Se requiere membresía activa en el proyecto.'}</Notice>

  const stats = [
    { name: 'Arquitecturas', value: data.totals.architectures, icon: Layers },
    { name: 'Datasets registrados', value: data.totals.datasets, icon: Database },
    { name: 'Entrenamientos', value: data.totals.runs, icon: ChartNoAxesCombined },
    { name: 'Versiones de modelos', value: data.totals.versions, icon: Box },
  ]
  return <div className="report-printable">
    {/* Vista de pantalla completamente separada del documento imprimible. */}
    <div className="report-screen space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold">Ficha y reporte del proyecto</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">{data.project.name} · Instantánea de metadatos almacenados en Supabase.</p>
      </div>
      <div className="report-no-print flex flex-wrap gap-2">
        <Button type="button" variant="outline" busy={busy} onClick={() => void exportReport('csv')}><Download size={16}/> Exportar CSV</Button>
        <Button type="button" variant="outline" busy={busy} onClick={() => void exportReport('pdf')}><Printer size={16}/> Exportar PDF formal</Button>
      </div>
    </header>
    {error && <Notice tone="error">{error}</Notice>}
    <Surface className="space-y-3 p-5 sm:p-7">
      <div className="flex items-center gap-2"><FileText size={18}/><h2 className="text-lg font-semibold">Ficha de proyecto</h2></div>
      <p className="break-words text-sm">{data.project.description || 'Sin descripción.'}</p>
      <p className="text-xs text-[var(--muted)]">Estado: {data.project.status === 'active' ? 'Activo' : 'Archivado'} · Fecha de creación: {new Date(data.project.created_at).toLocaleString('es-PE')}</p>
    </Surface>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map(({ name, value, icon: Icon }) => <Surface key={name} className="p-5">
        <div className="flex items-center justify-between"><p className="text-xs text-[var(--muted)]">{name}</p><Icon size={18} aria-hidden="true"/></div>
        <p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p>
      </Surface>)}
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Surface className="space-y-3 p-5 sm:p-7"><h2 className="text-lg font-semibold">Resumen de arquitectura</h2>
        {data.architectures.length === 0 ? <p className="text-sm text-[var(--muted)]">Sin arquitecturas.</p> :
          <div className="space-y-3">{data.architectures.slice(0, 6).map((arch) => <div key={arch.id} className="border-b border-[var(--line)] pb-3 text-sm last:border-0">
            <p className="font-medium">{arch.name} · v{arch.version}</p>
            <p className="mt-1 break-words text-xs text-[var(--muted)]">{JSON.stringify(arch.config_json)}</p>
          </div>)}</div>}
      </Surface>
      <Surface className="space-y-4 p-5 sm:p-7"><h2 className="text-lg font-semibold">Entrenamiento y evaluaciones</h2>
        <p className="text-sm">{completed} ejecuciones completadas entre las últimas {data.runs.length} consultadas.</p>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${data.runs.length ? 100 * completed / data.runs.length : 0}%` }}/>
        </div>
        <p className="text-xs leading-5 text-[var(--muted)]">Los totales corresponden al proyecto; los detalles y las proporciones representan hasta las 200 ejecuciones más recientes. Las métricas reportadas fueron calculadas en el navegador, no certificadas en servidor.</p>
        <p className="text-sm">{data.evaluations.length} evaluaciones de prueba consultadas.</p>
        <p className="text-xs text-[var(--muted)]">No se incluyen filas del CSV original ni pesos del modelo.</p>
      </Surface>
    </div>
    <Surface className="space-y-4 p-5 sm:p-7">
      <h2 className="text-lg font-semibold">Historial de entrenamiento</h2>
      <div className="report-no-print max-w-xs"><SelectField id="report-family" label="Filtrar familias en detalle y exportaciones" value={family} options={[{value:'all',label:'Todas las familias'},{value:'feedforward',label:'Feedforward'},{value:'cnn',label:'CNN'}]} onChange={(event) => { setFamily(event.target.value as FamilyFilter); setPage(1) }}/></div>
      <p className="text-xs text-[var(--muted)]">Hasta 200 ejecuciones recientes por proyecto. El filtro afecta al detalle y a las exportaciones CSV/PDF; los totales globales no cambian. Si existen más de 200 ejecuciones, este filtro solo cubre la muestra consultada.</p>
      {filteredRuns.length === 0 ? <Notice>No hay ejecuciones para la familia seleccionada en la muestra reciente.</Notice> : <div className="report-table overflow-x-auto"><table className="w-full min-w-[660px] text-left text-sm"><thead><tr className="border-b border-[var(--line)] text-xs text-[var(--muted)]"><th className="p-3">Fecha</th><th className="p-3">Familia</th><th className="p-3">Arquitectura</th><th className="p-3">Estado</th><th className="p-3">Épocas</th><th className="p-3">Resultado test</th></tr></thead>
        <tbody>{pageRuns.map((run) => {
          const evaluation = evaluationByRun.get(run.id)
          return <tr key={run.id} className="border-b border-[var(--line)] last:border-0"><td className="p-3 whitespace-nowrap">{new Date(run.created_at).toLocaleString('es-PE')}</td><td className="p-3">{familyForReportProblem(run.problem_type) ? familyLabel(familyForReportProblem(run.problem_type)!) : 'Otra'}</td><td className="p-3">{architecturesById.get(run.architecture_id) ?? 'Arquitectura anterior'}</td><td className="p-3">{statusNames[run.status] ?? run.status}</td><td className="p-3 tabular-nums">{run.completed_epochs}/{run.epochs_planned}</td><td className="p-3 tabular-nums">{evaluation ? (run.problem_type === 'multiclass' ? `Accuracy ${metric(evaluation.accuracy)} · F1 macro ${metric(evaluation.macroF1)}` : run.problem_type === 'binary' ? `Exactitud ${metric(evaluation.accuracy)}` : `RMSE ${metric(evaluation.rmse)}`) : 'Sin evaluación'}</td></tr>
        })}</tbody></table></div>}
      <div className="report-no-print"><Pagination page={page} pageSize={PAGE_SIZE} total={filteredRuns.length} onPageChange={setPage}/></div>
    </Surface>
    <p className="text-xs text-[var(--muted)]">Informe emitido desde NeuroLab Enterprise · {new Date().toLocaleString('es-PE')}. Las exportaciones autorizadas generan eventos de auditoría de solicitud.</p>
    </div>
    <FormalReportDocument data={data} familyFilter={family} preparedBy={state.status === 'ready' ? state.profile.display_name : 'Usuario autorizado'} />
  </div>
}
