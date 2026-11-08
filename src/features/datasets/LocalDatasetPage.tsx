import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, FileSpreadsheet, ShieldAlert } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import { useAuth } from '../auth/AuthProvider'
import { DenseTrainingPanel } from '../training/DenseTrainingPanel'
import { getProject } from '../../services/projects'
import { supabase } from '../../lib/supabase'
import { prepareDataset } from '../../ml/preprocessing/prepare.ts'
import { MAX_CSV_BYTES, MAX_CSV_ROWS, readLocalCsv } from '../../ml/preprocessing/readCsv.ts'
import type { PreparedDataset, ProblemType, RawTable } from '../../ml/preprocessing/types.ts'

/** Primera pantalla de Fase 3: comprueba rol de Ingeniero antes de preparar datos locales. */
export function LocalDatasetPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [permission, setPermission] = useState<'loading' | 'allowed' | 'denied'>('loading')
  const [projectName, setProjectName] = useState('')
  const [table, setTable] = useState<RawTable | null>(null)
  const [filename, setFilename] = useState('')
  const [target, setTarget] = useState('')
  const [problemType, setProblemType] = useState<ProblemType>('binary')
  const [prepared, setPrepared] = useState<PreparedDataset | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const authorize = useCallback(async () => {
    setPermission('loading')
    try {
      if (!supabase || !projectId || !userId) throw new Error('No autorizado')
      const [project, membership] = await Promise.all([
        getProject(projectId),
        supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
      ])
      if (membership.error) throw membership.error
      if (!project || project.status !== 'active' || membership.data?.role !== 'engineer') {
        setPermission('denied')
        return
      }
      setProjectName(project.name)
      setPermission('allowed')
    } catch { setPermission('denied') }
  }, [projectId, userId])

  useEffect(() => { void authorize() }, [authorize])

  async function loadFile(file: File | undefined) {
    setTable(null)
    setPrepared(null)
    setTarget('')
    setFilename('')
    setError('')
    if (!file) return
    setBusy(true)
    try {
      const parsed = await readLocalCsv(file)
      setTable(parsed)
      setFilename(file.name)
      setTarget(parsed.columns[parsed.columns.length - 1])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el CSV.')
    } finally { setBusy(false) }
  }

  function prepare() {
    if (!table || !target) return
    setError('')
    setPrepared(null)
    try {
      // El conjunto original permanece solo en memoria durante esta sesión.
      setPrepared(prepareDataset(table, { targetColumn: target, problemType, seed: 42, scaling: 'standard' }))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron preparar los datos.')
    }
  }

  if (permission === 'loading') return <Surface className="p-8"><p role="status">Verificando el rol de proyecto…</p></Surface>
  if (permission === 'denied') return (
    <div className="space-y-5"><Link to={`/proyectos/${projectId}`} className="inline-flex items-center gap-2 text-sm"><ArrowLeft size={16}/> Volver al proyecto</Link>
      <Notice tone="error"><ShieldAlert size={16} className="inline"/> Solo un Ingeniero/analista de IA asignado a este proyecto activo puede utilizar el preparador local.</Notice>
    </div>
  )

  return (
    <div className="space-y-7">
      <Link to={`/proyectos/${projectId}`} className="inline-flex items-center gap-2 text-sm text-[var(--muted)]"><ArrowLeft size={16}/> Volver al proyecto</Link>
      <header><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--muted)]">M05 · Fase 3 · Preparación local</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Preparar un CSV</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">{projectName} · El CSV se procesa solo en tu navegador y no se sube a Supabase.</p>
      </header>
      <Surface className="space-y-5 p-5 sm:p-7">
        <div className="flex items-center gap-3"><FileSpreadsheet size={21} aria-hidden="true"/><h2 className="text-lg font-semibold">Importación local</h2></div>
        <p className="text-sm leading-6 text-[var(--muted)]">Límite: {MAX_CSV_BYTES / 1024 / 1024} MiB y {MAX_CSV_ROWS.toLocaleString('es-PE')} filas, lo que se alcance primero. Se requiere cabecera.</p>
        <label htmlFor="csv-file" className="block text-sm font-medium">Archivo CSV</label>
        <input id="csv-file" type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => void loadFile(event.target.files?.[0])}
          className="block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--surface-muted)] file:px-4 file:py-2 file:text-[var(--ink)]" />
        {busy && <p role="status" className="text-sm text-[var(--muted)]">Validando el CSV local…</p>}
        {table && <p role="status" className="text-sm">{filename}: <strong>{table.rows.length}</strong> filas y <strong>{table.columns.length}</strong> columnas.</p>}
      </Surface>
      {table && <Surface className="space-y-5 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Preparación reproducible</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField id="target-column" label="Columna objetivo" value={target} options={table.columns.map((column) => ({ value: column, label: column }))}
            onChange={(event) => { setTarget(event.target.value); setPrepared(null) }}/>
          <SelectField id="problem-type" label="Problema" value={problemType} options={[{ value: 'binary', label: 'Clasificación binaria' }, { value: 'regression', label: 'Regresión' }]}
            onChange={(event) => { setProblemType(event.target.value as ProblemType); setPrepared(null) }}/>
        </div>
        <p className="text-xs text-[var(--muted)]">Partición 70/15/15, semilla 42, estandarización con estadísticas exclusivas de entrenamiento y codificación de categorías.</p>
        <Button type="button" onClick={prepare} disabled={busy}>Validar y preparar</Button>
      </Surface>}
      {error && <Notice tone="error">{error}</Notice>}
      {prepared && <Surface className="space-y-4 p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Datos preparados en memoria</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Entrenamiento', prepared.train.x.length],
            ['Validación', prepared.validation.x.length],
            ['Prueba', prepared.test.x.length],
            ['Características', prepared.manifest.featureNames.length],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}
        </div>
        <Notice>Partición y transformaciones calculadas localmente. Puedes configurar y entrenar una Feedforward Dense debajo sin subir el CSV.</Notice>
      </Surface>}
      {prepared && <DenseTrainingPanel dataset={prepared} projectId={projectId} userId={userId}/>}
    </div>
  )
}
