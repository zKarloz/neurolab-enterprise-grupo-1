import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Binary, Database, FileSpreadsheet, Layers3, ShieldCheck, Save } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { Tabs } from '../../components/ui/Tabs'
import { useAuth } from '../auth/AuthProvider'
import { getProject, listMembers } from '../../services/projects'
import type { Project, ProjectMember } from '../../types/projects'
import { readLocalCsv, MAX_CSV_BYTES, MAX_CSV_ROWS } from '../../ml/preprocessing/readCsv.ts'
import type { RawTable } from '../../ml/preprocessing/types.ts'
import {
  DEFAULT_RNN_CONFIG, describeRnn,
  type RnnConfig, type RnnProblemType, type RnnShape,
} from '../../ml/rnn/architecture.ts'
import { describeSequenceDataset, type RnnDatasetOptions, type RnnDatasetSummary } from '../../ml/rnn/sequenceDataset.ts'
import { RnnDiagram } from './RnnDiagram'
import { RnnEvaluationPanel } from './RnnEvaluationPanel'
import { RnnPredictionPanel } from './RnnPredictionPanel'
import type { RnnTestEvaluation } from '../../ml/rnn/evaluation.ts'
import type { RnnInferenceResult } from '../../ml/rnn/inference.ts'
import { RnnTrainingPanel, EMPTY_RNN_TRAINING, type RnnTrainingDisplay } from './RnnTrainingPanel'
import { startRnnTraining, type RnnSession } from '../../ml/rnn/trainingSession.ts'
import { DEFAULT_RNN_TRAIN_OPTIONS, type RnnTrainOptions, type RnnTrainingEvent } from '../../ml/rnn/trainingTypes.ts'
import { prepareRnnTrainingData } from '../../ml/rnn/trainingData.ts'
import { sha256LocalFile } from '../../ml/cnn/sha256Stream.ts'
import { saveModelVersion, type RegisteredVersion } from '../../services/modelRegistry.ts'
import { createRnnPersistenceQueue, type RnnPersistenceQueue } from '../../ml/rnn/persistenceQueue.ts'
import {
  createRnnRun, recordRnnRuntime, recordRnnEpoch, recordRnnEvaluation, finishRnnRun,
} from '../../services/rnnPersistence.ts'

const viewTabs = [
  { id: 'datos', label: 'Datos' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'entrenar', label: 'Entrenar' },
  { id: 'evaluar', label: 'Evaluar' },
  { id: 'predecir', label: 'Predecir' },
] as const

type View = typeof viewTabs[number]['id']

function defaultColumns(columns: string[]): RnnDatasetOptions {
  const seriesColumn = columns.includes('series_id') ? 'series_id' : columns[0]
  const timeColumn = columns.includes('step') ? 'step' : columns.find((name) => name !== seriesColumn) ?? ''
  const targetColumn = columns.includes('target') ? 'target' : columns.filter((name) => name !== seriesColumn && name !== timeColumn).at(-1) ?? ''
  const features = columns.filter((name) => ![seriesColumn, timeColumn, targetColumn].includes(name)).slice(0, 8)
  return { seriesColumn, timeColumn, targetColumn, features, steps: 8, problemType: 'regression' }
}

/** RNN-4B: el cálculo permanece local; solo metadatos y métricas pasan por RPC protegidas. */
export function RnnPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [project, setProject] = useState<Project | null>(null)
  const [membership, setMembership] = useState<ProjectMember | null>(null)
  const [checking, setChecking] = useState(true)
  const [accessError, setAccessError] = useState('')
  const [tab, setTab] = useState<View>('datos')
  const [table, setTable] = useState<RawTable | null>(null)
  const [fileName, setFileName] = useState('')
  const [options, setOptions] = useState<RnnDatasetOptions | null>(null)
  const [summary, setSummary] = useState<RnnDatasetSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<RnnConfig>(DEFAULT_RNN_CONFIG)
  const loadSequence = useRef(0)
  const [trainOptions, setTrainOptions] = useState<RnnTrainOptions>(DEFAULT_RNN_TRAIN_OPTIONS)
  const [training, setTraining] = useState<RnnTrainingDisplay>(EMPTY_RNN_TRAINING)
  const [evaluation, setEvaluation] = useState<RnnTestEvaluation | null>(null)
  const [selectedSeries, setSelectedSeries] = useState('')
  const [prediction, setPrediction] = useState<RnnInferenceResult | null>(null)
  const [predictionError, setPredictionError] = useState('')
  const [predicting, setPredicting] = useState(false)
  const trainingSession = useRef<RnnSession | null>(null)
  const trainingGeneration = useRef(0)
  const sourceFile = useRef<File | null>(null)
  const startAbort = useRef<AbortController | null>(null)
  const persistence = useRef<RnnPersistenceQueue | null>(null)
  const [runId, setRunId] = useState('')
  const [savedEpochs, setSavedEpochs] = useState(0)
  const [evaluationSaved, setEvaluationSaved] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'confirmed' | 'error'>('idle')
  const [syncError, setSyncError] = useState('')
  const [modelName, setModelName] = useState('RNN Temporal')
  const [savingModel, setSavingModel] = useState(false)
  const [saveModelError, setSaveModelError] = useState('')
  const [publishedVersion, setPublishedVersion] = useState<RegisteredVersion | null>(null)
  // No permitir que la sesión cambie durante una escritura o creación pendientes.
  const busy = ['starting', 'running', 'stopping'].includes(training.phase) || syncState === 'pending' || savingModel

  // Cada sesión se cancela al salir de la ruta o cambiar de identidad/proyecto.
  useEffect(() => {
    // Nunca conservar un CSV local al navegar a otro proyecto o identidad.
    startAbort.current?.abort()
    loadSequence.current += 1
    if (persistence.current && !persistence.current.terminalQueued) persistence.current.finish('interrupted')
    persistence.current = null
    sourceFile.current = null
    setRunId('')
    setSavedEpochs(0)
    setEvaluationSaved(false)
    setSyncState('idle')
    setSyncError('')
    setPublishedVersion(null)
    setSaveModelError('')
    setTable(null)
    setOptions(null)
    setSummary(null)
    setFileName('')
    setError('')
    setTab('datos')
    setTraining(EMPTY_RNN_TRAINING)
    setEvaluation(null)
    setPrediction(null)
    setSelectedSeries('')
    setPredicting(false)
    return () => {
      trainingGeneration.current += 1
      startAbort.current?.abort()
      trainingSession.current?.dispose()
      trainingSession.current = null
      if (persistence.current && !persistence.current.terminalQueued) persistence.current.finish('interrupted')
      persistence.current = null
    }
  }, [projectId, userId])

  function invalidateTraining() {
    startAbort.current?.abort()
    if (persistence.current && !persistence.current.terminalQueued) persistence.current.finish('interrupted')
    persistence.current = null
    setRunId('')
    setSavedEpochs(0)
    setEvaluationSaved(false)
    setSyncState('idle')
    setSyncError('')
    setSaveModelError('')
    setPublishedVersion(null)
    trainingGeneration.current += 1
    trainingSession.current?.dispose()
    trainingSession.current = null
    setTraining(EMPTY_RNN_TRAINING)
    setEvaluation(null)
    setPrediction(null)
    setPredictionError('')
    setPredicting(false)
  }

  function onTrainEvent(event: RnnTrainingEvent, generation: number, queue: RnnPersistenceQueue,
    problemType: RnnDatasetOptions['problemType']) {
    if (generation !== trainingGeneration.current || persistence.current !== queue) return
    // Este orden es obligatorio: runtime, N épocas, evaluación, transición final.
    if (event.type === 'status') queue.runtime(event.backend, event.context, event.tfjsVersion)
    if (event.type === 'epoch') queue.epoch(event.metrics)
    if (event.type === 'evaluation') {
      setEvaluation(event.result)
      queue.evaluation(problemType, event.result)
      return
    }
    if (event.type === 'completed') queue.finish('completed', event.durationMs)
    if (event.type === 'cancelled') queue.finish('cancelled')
    if (event.type === 'error') queue.finish('failed', undefined, event.message)
    setTraining((previous): RnnTrainingDisplay => {
      switch (event.type) {
        case 'status': return { ...previous, phase: previous.phase === 'stopping' ? 'stopping' : 'running', message: event.message,
          backend: event.backend, context: event.context, trainingCount: event.trainingCount,
          validationCount: event.validationCount, testCount: event.testCount }
        case 'batch': return { ...previous, phase: previous.phase === 'stopping' ? 'stopping' : 'running',
          progress: Math.min(0.999, (previous.epochs.length + event.batch / event.batches) / event.epochs) }
        case 'epoch': return { ...previous, epochs: [...previous.epochs, event.metrics],
          progress: event.metrics.epoch / trainOptions.epochs }
        case 'completed': return { ...previous, phase: 'completed', progress: 1,
          durationMs: event.durationMs, backend: event.backend, message: 'Entrenamiento local completado. Confirmando Supabase…' }
        case 'cancelled': return { ...previous, phase: 'cancelled', message: 'Entrenamiento cancelado por el motor.' }
        case 'error': return { ...previous, phase: 'error', message: event.message }
        default: return previous
      }
    })
  }

  /** Nunca lanzar TF.js antes de que Supabase confirme la creación del run RNN. */
  async function startTraining() {
    if (!table || !options || !summary || !canEdit || busy || startAbort.current || diagram.errors.length || !sourceFile.current) return
    invalidateTraining()
    const generation = trainingGeneration.current
    const controller = new AbortController()
    startAbort.current = controller
    const file = sourceFile.current
    const sourceTable = table
    const dataset = structuredClone(options)
    const architecture = { ...config }
    const hyperparameters = { ...trainOptions }
    setTraining({ ...EMPTY_RNN_TRAINING, phase: 'starting', message: 'Verificando ventanas y calculando huella SHA-256…' })
    try {
      // Normalización y split exclusivamente locales; se persisten solo sus estadísticas.
      const prepared = prepareRnnTrainingData(sourceTable, dataset)
      const hash = await sha256LocalFile(file, controller.signal)
      if (controller.signal.aborted) {
        if (generation === trainingGeneration.current) setTraining({ ...EMPTY_RNN_TRAINING, phase: 'cancelled', message: 'Preparación cancelada.' })
        return
      }
      setTraining((previous) => ({ ...previous, message: 'Registrando ejecución RNN en Supabase…' }))
      const id = await createRnnRun(projectId, file.name, file.size, hash,
        sourceTable, dataset, architecture, hyperparameters, prepared)
      if (generation !== trainingGeneration.current) {
        // Cambio de proyecto/identidad durante la RPC: cerrar sin montar un Worker nuevo.
        await finishRnnRun(id, 'interrupted').catch(() => undefined)
        return
      }
      const queue = createRnnPersistenceQueue(id, {
        runtime: recordRnnRuntime, epoch: recordRnnEpoch,
        evaluation: recordRnnEvaluation, finish: finishRnnRun,
      }, {
        epochConfirmed: (epoch) => { if (persistence.current === queue) setSavedEpochs(epoch) },
        evaluationConfirmed: () => { if (persistence.current === queue) setEvaluationSaved(true) },
        finishedConfirmed: () => { if (persistence.current === queue) setSyncState('confirmed') },
        failed: (message) => {
          if (persistence.current !== queue) return
          setSyncState('error')
          setSyncError(message)
          trainingSession.current?.cancel()
        },
      })
      persistence.current = queue
      setRunId(id)
      setSyncState('pending')
      if (controller.signal.aborted) {
        setTraining({ ...EMPTY_RNN_TRAINING, phase: 'cancelled', message: 'Preparación cancelada.' })
        queue.finish('cancelled')
        return
      }
      trainingSession.current = startRnnTraining(sourceTable, dataset, architecture, hyperparameters,
        (event) => onTrainEvent(event, generation, queue, dataset.problemType))
    } catch (cause) {
      if (generation !== trainingGeneration.current) return
      const message = cause instanceof Error ? cause.message : 'No se pudo preparar RNN-4B.'
      if (persistence.current && !persistence.current.terminalQueued) {
        persistence.current.finish(controller.signal.aborted ? 'cancelled' : 'failed', undefined, message)
      }
      setTraining({ ...EMPTY_RNN_TRAINING, phase: controller.signal.aborted ? 'cancelled' : 'error',
        message: controller.signal.aborted ? 'Preparación cancelada.' : message })
    } finally {
      if (startAbort.current === controller) startAbort.current = null
    }
  }

  async function predictLatest() {
    const nextSeries = seriesIds.includes(selectedSeries) ? selectedSeries : seriesIds[0] ?? ''
    if (!nextSeries || training.phase !== 'completed' || syncState !== 'confirmed' || !evaluationSaved || !trainingSession.current || predicting) return
    const generation = trainingGeneration.current
    setPredicting(true); setPredictionError(''); setPrediction(null)
    try {
      const result = await trainingSession.current.predict(nextSeries)
      if (generation === trainingGeneration.current) setPrediction(result)
    } catch (cause) {
      if (generation === trainingGeneration.current) setPredictionError(cause instanceof Error ? cause.message : 'No se pudo predecir.')
    } finally {
      if (generation === trainingGeneration.current) setPredicting(false)
    }
  }

  /** Los archivos se suben solo tras confirmar evaluación y cierre de la ejecución en Supabase. */
  async function publishRnnModel() {
    if (savingModel || !trainingSession.current || !runId || !canEdit ||
      syncState !== 'confirmed' || !evaluationSaved || training.phase !== 'completed') return
    const activeSession = trainingSession.current
    const generation = trainingGeneration.current
    const name = modelName.trim()
    if (!name || name.length > 120) {
      setSaveModelError('Escribe un nombre de modelo de 1 a 120 caracteres.')
      return
    }
    setSavingModel(true); setSaveModelError(''); setPublishedVersion(null)
    try {
      const bundle = await activeSession.exportModel()
      if (generation !== trainingGeneration.current || trainingSession.current !== activeSession) {
        throw new Error('La sesión RNN cambió durante la exportación.')
      }
      const version = await saveModelVersion(runId, name, bundle)
      if (generation === trainingGeneration.current && trainingSession.current === activeSession) setPublishedVersion(version)
    } catch (cause) {
      if (generation === trainingGeneration.current) setSaveModelError(cause instanceof Error ? cause.message : 'No se pudo guardar la RNN.')
    } finally { if (generation === trainingGeneration.current) setSavingModel(false) }
  }

  function cancelTraining() {
    if (!busy || training.phase === 'stopping') return
    if (startAbort.current) {
      startAbort.current.abort()
      setTraining((previous) => ({ ...previous, phase: 'stopping', message: 'Cancelando preparación RNN…' }))
      return
    }
    // Tras completar el cálculo no se cancela una confirmación de Supabase en curso.
    if (training.phase === 'completed') return
    setTraining((previous) => ({ ...previous, phase: 'stopping', message: 'Solicitando cancelación al motor…' }))
    trainingSession.current?.cancel()
  }

  const authorize = useCallback(async () => {
    setChecking(true)
    setAccessError('')
    setProject(null)
    setMembership(null)
    try {
      const current = await getProject(projectId)
      if (!current) throw new Error('Proyecto inexistente o sin permiso de lectura.')
      const members = await listMembers(projectId)
      const self = members.find((item) => item.user_id === userId)
      if (!self) throw new Error('Se requiere membresía explícita en este proyecto; Administrador global no equivale a integrante.')
      setProject(current)
      setMembership(self)
    } catch (cause) {
      setAccessError(cause instanceof Error ? cause.message : 'Acceso no autorizado.')
    } finally { setChecking(false) }
  }, [projectId, userId])

  useEffect(() => { void authorize() }, [authorize])
  const canEdit = membership?.role === 'engineer' && project?.status === 'active'

  async function importCsv(file: File | undefined) {
    if (busy) return
    invalidateTraining()
    const request = ++loadSequence.current
    setSummary(null)
    setTable(null)
    setOptions(null)
    setFileName('')
    sourceFile.current = null
    setError('')
    if (!file || !canEdit) return
    setLoading(true)
    try {
      const parsed = await readLocalCsv(file)
      if (request !== loadSequence.current) return
      if (parsed.columns.length < 4) throw new Error('Un CSV temporal requiere serie, tiempo, objetivo y al menos una variable de entrada.')
      setTable(parsed)
      sourceFile.current = file
      setFileName(file.name)
      setOptions(defaultColumns(parsed.columns))
      setSelectedSeries(parsed.rows[0]?.[parsed.columns.indexOf(defaultColumns(parsed.columns).seriesColumn)]?.trim() ?? '')
    } catch (cause) {
      if (request === loadSequence.current) setError(cause instanceof Error ? cause.message : 'Error al leer el CSV.')
    } finally { if (request === loadSequence.current) setLoading(false) }
  }

  // Cambiar los campos invalida la descripción: no mostrar un shape de un CSV anterior.
  function updateOptions(next: RnnDatasetOptions) {
    if (busy) return
    invalidateTraining()
    setOptions(next)
    setSummary(null)
    setError('')
  }

  function validate() {
    if (!table || !options || !canEdit || busy) return
    invalidateTraining()
    setError('')
    setSummary(null)
    try { setSummary(describeSequenceDataset(table, options)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Error al preparar secuencias.') }
  }

  const shape: RnnShape = useMemo(() => ({
    steps: options?.steps ?? 8,
    features: summary?.featureNames.length ?? 1,
    problemType: options?.problemType ?? 'regression',
    classes: options?.problemType === 'regression' || !summary ? 1 : summary.classes.length,
  }), [options, summary])
  const diagram = useMemo(() => describeRnn(config, shape), [config, shape])
  function updateConfig(next: RnnConfig) {
    if (busy) return
    invalidateTraining()
    setConfig(next)
  }

  const seriesIds = useMemo(() => {
    if (!table || !options) return []
    const column = table.columns.indexOf(options.seriesColumn)
    return column < 0 ? [] : Array.from(new Set(table.rows.map((row) => row[column].trim()))).sort()
  }, [table, options])

  const columnOptions = table?.columns.map((name) => ({ value: name, label: name })) ?? []

  if (checking) return <Surface className="p-6"><Spinner label="Comprobando acceso al proyecto…" /></Surface>
  if (!project || !membership) return <Notice tone="error">{accessError || 'No tienes acceso a este módulo.'}</Notice>

  return <div className="space-y-6">
    <header>
      <h1 className="text-3xl font-semibold tracking-tight">Red recurrente · RNN</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">{project.name} · RNN-4C: entrenamiento persistido y modelos versionados para predicción sin CSV.</p>
    </header>
    <Tabs items={viewTabs} value={tab} onChange={(next) => setTab(next as View)} label="Módulo RNN" idPrefix="rnn" />
    <div id={`rnn-panel-${tab}`} role="tabpanel" aria-labelledby={`rnn-tab-${tab}`} tabIndex={0}>
      {tab === 'datos' && <div className="space-y-5">
        <Surface className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2"><FileSpreadsheet size={19} /><h2 className="text-lg font-semibold">CSV temporal local</h2></div>
          <p className="text-sm text-[var(--muted)]">Hasta {MAX_CSV_BYTES / (1024 * 1024)} MiB y {MAX_CSV_ROWS.toLocaleString('es-PE')} filas. Cabeceras obligatorias; columnas numéricas para tiempo y variables. Cada serie se ordena por tiempo, sin mezclar series.</p>
          <p className="text-xs text-[var(--muted)]">Formato de ejemplo: <code>series_id,step,temperatura,consumo,target</code>. El objetivo corresponde al siguiente paso posterior a la ventana.</p>
          <label htmlFor="rnn-local-file" className="block text-sm font-semibold">Seleccionar CSV</label>
          <input id="rnn-local-file" type="file" accept=".csv,text/csv" disabled={!canEdit || loading || busy} onChange={(event) => void importCsv(event.target.files?.[0])} className="block w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-[var(--surface-muted)] file:px-4 file:py-2" />
          {loading && <Spinner label="Validando CSV local…" />}
          {!canEdit && <Notice>Solo el Ingeniero de un proyecto activo puede importar datos y editar arquitecturas. El resto de miembros puede consultar el diseñador.</Notice>}
          {table && <p role="status" className="text-sm">Archivo: <strong>{fileName}</strong> · {table.rows.length} registros · {table.columns.length} columnas.</p>}
        </Surface>
        {table && options && <Surface className="space-y-5 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Definición de secuencias</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField id="rnn-series" label="Identificador de serie" options={columnOptions} value={options.seriesColumn} disabled={!canEdit || busy} onChange={(event) => updateOptions({ ...options, seriesColumn: event.target.value, features: options.features.filter((name) => name !== event.target.value) })} />
            <SelectField id="rnn-time" label="Orden temporal numérico" options={columnOptions} value={options.timeColumn} disabled={!canEdit || busy} onChange={(event) => updateOptions({ ...options, timeColumn: event.target.value, features: options.features.filter((name) => name !== event.target.value) })} />
            <SelectField id="rnn-target" label="Columna objetivo (próximo paso)" options={columnOptions} value={options.targetColumn} disabled={!canEdit || busy} onChange={(event) => updateOptions({ ...options, targetColumn: event.target.value, features: options.features.filter((name) => name !== event.target.value) })} />
            <SelectField id="rnn-task" label="Tipo de problema" options={[{ value: 'regression', label: 'Regresión' }, { value: 'binary', label: 'Clasificación binaria' }, { value: 'multiclass', label: 'Clasificación multiclase (3–10)' }]} value={options.problemType} disabled={!canEdit || busy} onChange={(event) => updateOptions({ ...options, problemType: event.target.value as RnnProblemType })} />
            <SelectField id="rnn-steps" label="Pasos por ventana" options={[4, 8, 16, 32].map((value) => ({ value: String(value), label: String(value) }))} value={String(options.steps)} disabled={!canEdit || busy} onChange={(event) => updateOptions({ ...options, steps: Number(event.target.value) as RnnDatasetOptions['steps'] })} />
          </div>
          <fieldset disabled={!canEdit || busy} className="rounded-xl border border-[var(--line)] p-4">
            <legend className="px-2 text-sm font-semibold">Variables de entrada (1–16)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {table.columns.filter((name) => ![options.seriesColumn, options.timeColumn, options.targetColumn].includes(name)).map((name) => <label key={name} className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--focus)]" checked={options.features.includes(name)} onChange={(event) => updateOptions({ ...options, features: event.target.checked ? [...options.features, name] : options.features.filter((feature) => feature !== name) })} />{name}</label>)}
            </div>
          </fieldset>
          <p className="text-xs text-[var(--muted)]">RNN-1 permite previsualizar ventanas. RNN-2 separa cronológicamente cada serie en train/validación/test y purga ventanas solapadas entre particiones. La normalización usa solo train. El CSV breve de RNN-1 requiere más filas para entrenar.</p>
          <Button type="button" disabled={!canEdit || busy} onClick={validate}><ShieldCheck size={16} /> Validar secuencias</Button>
        </Surface>}
        {error && <Notice tone="error">{error}</Notice>}
        {summary && <Surface className="space-y-4 p-5 sm:p-6">
          <div className="flex items-center gap-2"><Database size={19} /><h2 className="text-lg font-semibold">Ventanas reales identificadas</h2></div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">{[
            ['Filas originales', summary.rowCount], ['Series', summary.seriesCount],
            ['Ventanas posibles', summary.windowCount], ['Series cortas omitidas', summary.skippedShortSeries],
          ].map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-2 font-semibold tabular-nums">{value}</dd></div>)}</dl>
          {summary.classes.length > 0 && <p className="text-sm">Clases detectadas: {summary.classes.join(', ')}</p>}
          <h3 className="text-sm font-semibold">Primeras ventanas (valores originales, sin escalar)</h3>
          <div className="grid gap-3 lg:grid-cols-3">{summary.exampleWindows.map((window, i) => <div key={`${window.seriesId}-${i}`} className="min-w-0 rounded-xl border border-[var(--line)] p-3 text-xs">
            <p className="font-semibold">Serie {window.seriesId}</p>
            <p className="mt-1 text-[var(--muted)]">Entradas: {window.fromTime} a {window.toTime} · objetivo en t={window.predictedTime}</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words">{window.values.slice(0, 4).map((step) => step.join(', ')).join('\n')}{window.values.length > 4 ? '\n…' : ''}</pre>
            <p className="mt-2">Objetivo futuro: <strong>{window.target}</strong></p>
          </div>)}</div>
          <Button type="button" variant="outline" onClick={() => setTab('arquitectura')}><Layers3 size={16} /> Ver arquitectura para estos datos</Button>
        </Surface>}
      </div>}
      {tab === 'arquitectura' && <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <Surface className="space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-2"><Binary size={19} /><h2 className="text-lg font-semibold">Constructor RNN</h2></div>
          <p className="text-sm text-[var(--muted)]">Las dimensiones se calculan con el CSV validado. Sin CSV se utiliza una entrada ilustrativa de 8 pasos y 1 variable.</p>
          <SelectField id="rnn-kind" label="Capa recurrente" disabled={!canEdit || busy} value={config.kind} options={[{ value: 'simpleRNN', label: 'SimpleRNN' }, { value: 'lstm', label: 'LSTM' }]} onChange={(event) => updateConfig({ ...config, kind: event.target.value as RnnConfig['kind'] })} />
          <SelectField id="rnn-layers" label="Capas recurrentes" disabled={!canEdit || busy} value={String(config.layers)} options={[1, 2].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => updateConfig({ ...config, layers: Number(event.target.value) as RnnConfig['layers'] })} />
          <SelectField id="rnn-units" label="Unidades por capa" disabled={!canEdit || busy} value={String(config.units)} options={[8, 16, 32, 64].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => updateConfig({ ...config, units: Number(event.target.value) as RnnConfig['units'] })} />
          <SelectField id="rnn-dense" label="Capa Dense adicional" disabled={!canEdit || busy} value={String(config.denseUnits)} options={[0, 16, 32].map((n) => ({ value: String(n), label: n === 0 ? 'Sin capa Dense' : `${n} neuronas` }))} onChange={(event) => updateConfig({ ...config, denseUnits: Number(event.target.value) as RnnConfig['denseUnits'] })} />
          <dl className="space-y-2 border-t border-[var(--line)] pt-4 text-sm">
            <div className="flex justify-between gap-3"><dt>Entrada</dt><dd className="font-mono">{shape.steps} × {shape.features}</dd></div>
            <div className="flex justify-between gap-3"><dt>Parámetros</dt><dd className="font-semibold tabular-nums">{diagram.parameterCount.toLocaleString('es-PE')}</dd></div>
            <div className="flex justify-between gap-3"><dt>Objetivo</dt><dd>{shape.problemType}</dd></div>
          </dl>
          {!summary && <Notice>Diagrama ilustrativo. Importa y valida datos en la pestaña Datos para obtener dimensiones reales.</Notice>}
          {diagram.errors.length > 0 ? <Notice tone="error">{diagram.errors.join(' ')}</Notice> : <Notice tone="success">Dimensiones y parámetros calculados. Entrenamiento habilitado en la pestaña Entrenar si las secuencias están validadas.</Notice>}
        </Surface>
        <RnnDiagram diagram={diagram} />
      </div>}
      {tab === 'entrenar' && <><RnnTrainingPanel
        settings={trainOptions} onSettings={(value) => { if (!busy) { invalidateTraining(); setTrainOptions(value) } }} display={training} locked={syncState === 'pending' || savingModel}
        canEdit={canEdit} hasDataset={!!summary}
        canTrain={!!summary && canEdit && !busy && diagram.errors.length === 0}
        regression={options?.problemType === 'regression'}
        onStart={() => void startTraining()} onCancel={cancelTraining}
      />
      <Surface className="space-y-3 p-5 sm:p-6">
        <h3 className="flex items-center gap-2 font-semibold"><Save size={17} /> Persistencia RNN · Supabase</h3>
        <p className="text-sm text-[var(--muted)]">Solo se registran huella SHA-256, metadatos, métricas por época y evaluación agregada. CSV, series, ventanas y predicciones individuales permanecen locales.</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-[var(--muted)]">Ejecución</dt><dd className="break-all font-mono text-xs">{runId || 'Sin registrar'}</dd></div>
          <div><dt className="text-[var(--muted)]">Épocas confirmadas</dt><dd className="font-semibold tabular-nums">{savedEpochs} / {trainOptions.epochs}</dd></div>
          <div><dt className="text-[var(--muted)]">Test / estado remoto</dt><dd className="font-semibold">{evaluationSaved ? 'Evaluación guardada' : 'Sin evaluación confirmada'} · {syncState === 'confirmed' ? 'Confirmado' : syncState === 'pending' ? 'Guardando…' : syncState === 'error' ? 'Error' : 'Pendiente'}</dd></div>
        </dl>
        {syncError && <Notice tone="error">{syncError}</Notice>}
        {syncState === 'confirmed' && training.phase === 'completed' && <Notice tone="success">Supabase confirmó la ejecución completada, las épocas y la evaluación RNN.</Notice>}
      </Surface>
      {training.phase === 'completed' && canEdit && <Surface className="space-y-4 p-5 sm:p-6">
        <header className="flex items-center gap-2"><Save size={19}/><h3 className="text-lg font-semibold">Guardar versión RNN</h3></header>
        <p className="text-sm text-[var(--muted)]">Publica los pesos SimpleRNN/LSTM en Storage privado con el normalizador y el orden de variables asociados a esta ejecución.
          Después podrás introducir una nueva ventana desde Modelos privados, sin importar el CSV ni reentrenar.</p>
        <div className="max-w-md"><InputField id="rnn-model-name" label="Nombre del modelo" value={modelName} maxLength={120}
          disabled={savingModel} onChange={(event) => { setModelName(event.target.value); setPublishedVersion(null); setSaveModelError('') }}/></div>
        <Button type="button" busy={savingModel} disabled={!runId || syncState !== 'confirmed' || !evaluationSaved || !!publishedVersion}
          onClick={() => void publishRnnModel()}><Save size={16}/> Guardar versión inmutable</Button>
        {(syncState !== 'confirmed' || !evaluationSaved) && <Notice>Espera la confirmación de las épocas, test y cierre remoto antes de publicar.</Notice>}
        {saveModelError && <Notice tone="error">{saveModelError}</Notice>}
        {publishedVersion && <Notice tone="success">Versión v{publishedVersion.version} publicada y verificada. Puedes recuperarla en{' '}
          <Link className="underline" to={`/proyectos/${projectId}/modelos`}>Modelos privados</Link> sin CSV.</Notice>}
      </Surface>}
      </>}

      {tab === 'evaluar' && <RnnEvaluationPanel report={evaluation} />}
      {tab === 'predecir' && <RnnPredictionPanel
        series={seriesIds} seriesId={seriesIds.includes(selectedSeries) ? selectedSeries : seriesIds[0] ?? ''}
        onSeries={(value) => { setSelectedSeries(value); setPrediction(null); setPredictionError('') }}
        onPredict={predictLatest} predicting={predicting} result={prediction} error={predictionError}
        ready={training.phase === 'completed' && evaluation !== null && evaluationSaved && syncState === 'confirmed'}
      />}
    </div>
  </div>
}
