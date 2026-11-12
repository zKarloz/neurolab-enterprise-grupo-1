import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Database, Image as ImageIcon, Layers3, Save, ShieldCheck, Sparkles } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { LocalCsvDropzone } from '../../components/ui/LocalCsvDropzone'
import { InputField } from '../../components/ui/InputField'
import { saveModelVersion, type RegisteredVersion } from '../../services/modelRegistry.ts'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { Tabs } from '../../components/ui/Tabs'
import { useAuth } from '../auth/AuthProvider'
import { getProject, listMembers } from '../../services/projects'
import type { Project, ProjectMember } from '../../types/projects'
import { DEFAULT_GAN_CONFIG, describeGan, type GanConfig, type GanHiddenUnits, type GanLatentDimension } from '../../ml/gan/architecture.ts'
import { loadGanImageCsv, selectGanExamples, MAX_GAN_IMAGES, type GanImageDataset } from '../../ml/gan/imageDataset.ts'
import { GanDiagram } from './GanDiagram'
import { GanTrainingPanel, EMPTY_GAN_TRAINING, type GanTrainingDisplay } from './GanTrainingPanel'
import { startGanTraining, type GanTrainingSession } from '../../ml/gan/trainingSession.ts'
import { DEFAULT_GAN_TRAIN_OPTIONS, type GanTrainOptions, type GanTrainingEvent } from '../../ml/gan/trainingTypes.ts'
import { validateGanGeneratedBatch, type GanGeneratedBatch, type GanSampleCount } from '../../ml/gan/generation.ts'
import { GanGrayImage } from './GanGrayImage'
import { GanGenerationPanel } from './GanGenerationPanel'
import { sha256LocalFile } from '../../ml/cnn/sha256Stream.ts'
import { createGanPersistenceQueue, type GanPersistenceQueue } from '../../ml/gan/persistenceQueue.ts'
import { createGanRun, finishGanRun, recordGanRuntime, recordGanEpoch, recordGanSummary } from '../../services/ganPersistence.ts'

const tabs = [
  { id: 'datos', label: 'Datos' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'entrenar', label: 'Entrenar' },
  { id: 'generar', label: 'Generar' },
] as const

type GanView = typeof tabs[number]['id']

/** GAN-4B: entrenamiento local con métricas confirmadas por RPC; píxeles siempre locales. */
export function GanPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [project, setProject] = useState<Project | null>(null)
  const [membership, setMembership] = useState<ProjectMember | null>(null)
  const [checking, setChecking] = useState(true)
  const [accessError, setAccessError] = useState('')
  const [view, setView] = useState<GanView>('datos')
  const [dataset, setDataset] = useState<GanImageDataset | null>(null)
  const [config, setConfig] = useState<GanConfig>(DEFAULT_GAN_CONFIG)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<GanTrainOptions>(DEFAULT_GAN_TRAIN_OPTIONS)
  const [training, setTraining] = useState<GanTrainingDisplay>(EMPTY_GAN_TRAINING)
  const [generated, setGenerated] = useState<GanGeneratedBatch | null>(null)
  const [sampleCount, setSampleCount] = useState<GanSampleCount>(8)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const trainingSession = useRef<GanTrainingSession | null>(null)
  const trainingRequest = useRef(0)
  const activeLoad = useRef<AbortController | null>(null)
  const request = useRef(0)
  const authRequest = useRef(0)
  // La identidad del archivo es privada: se conserva para el hash, nunca se sube.
  const sourceFile = useRef<File | null>(null)
  const startAbort = useRef<AbortController | null>(null)
  const queueRef = useRef<GanPersistenceQueue | null>(null)
  const generatingLock = useRef(false)
  const [runId, setRunId] = useState('')
  const [savedEpochs, setSavedEpochs] = useState(0)
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'confirmed' | 'error'>('idle')
  const [syncError, setSyncError] = useState('')
  const [summaryState, setSummaryState] = useState<'idle' | 'saving' | 'confirmed' | 'error'>('idle')
  const [summaryError, setSummaryError] = useState('')
  const [modelName, setModelName] = useState('GAN Generador')
  const [savingModel, setSavingModel] = useState(false)
  const [saveModelError, setSaveModelError] = useState('')
  const [publishedVersion, setPublishedVersion] = useState<RegisteredVersion | null>(null)
  const publishLock = useRef(false)

  // Si cambian los datos o la arquitectura, los resultados de otra GAN quedan invalidados.
  const resetTraining = useCallback(() => {
    trainingRequest.current += 1
    startAbort.current?.abort()
    startAbort.current = null
    if (queueRef.current && !queueRef.current.terminalQueued) queueRef.current.finish('interrupted')
    queueRef.current = null
    setRunId('')
    setSavedEpochs(0)
    setSyncState('idle')
    setSyncError('')
    setSummaryState('idle')
    setSummaryError('')
    setSaveModelError('')
    setPublishedVersion(null)
    setSavingModel(false)
    publishLock.current = false
    generatingLock.current = false
    trainingSession.current?.dispose()
    trainingSession.current = null
    setTraining(EMPTY_GAN_TRAINING)
    setGenerated(null)
    setGenerating(false)
    setGenerationError('')
  }, [])

  const authorize = useCallback(async () => {
    const authorization = ++authRequest.current
    setChecking(true)
    setAccessError('')
    setProject(null)
    setMembership(null)
    try {
      const current = await getProject(projectId)
      if (!current) throw new Error('Proyecto inexistente o sin permiso de lectura.')
      const members = await listMembers(projectId)
      if (authorization !== authRequest.current) return // Respuesta de otro proyecto/usuario: no aplicar.
      const ownMembership = members.find((member) => member.user_id === userId)
      if (!ownMembership) throw new Error('Requiere membresía explícita: el Administrador global no obtiene acceso técnico automático.')
      setProject(current)
      setMembership(ownMembership)
    } catch (cause) {
      if (authorization === authRequest.current) setAccessError(cause instanceof Error ? cause.message : 'No se pudo comprobar la membresía.')
    } finally { if (authorization === authRequest.current) setChecking(false) }
  }, [projectId, userId])

  useEffect(() => {
    // Al cambiar de ruta, usuario o proyecto se descartan datos privados de la memoria local.
    request.current += 1
    authRequest.current += 1
    activeLoad.current?.abort()
    activeLoad.current = null
    resetTraining()
    sourceFile.current = null
    setDataset(null)
    setError('')
    setLoading(false)
    setView('datos')
    setConfig(DEFAULT_GAN_CONFIG)
    setSettings(DEFAULT_GAN_TRAIN_OPTIONS)
    void authorize()
    return () => {
      request.current += 1
      authRequest.current += 1
      activeLoad.current?.abort()
      sourceFile.current = null
      if (queueRef.current && !queueRef.current.terminalQueued) queueRef.current.finish('interrupted')
      queueRef.current = null
      startAbort.current?.abort()
      trainingRequest.current += 1
      trainingSession.current?.dispose()
      trainingSession.current = null
    }
  }, [authorize, resetTraining])

  const canEdit = membership?.role === 'engineer' && project?.status === 'active'
  const architecture = useMemo(() => describeGan(config, dataset?.dimension ?? 8), [config, dataset])
  const examples = useMemo(() => dataset ? selectGanExamples(dataset) : [], [dataset])

  async function onImport(file: File | undefined) {
    if (!canEdit || !file) return
    activeLoad.current?.abort()
    sourceFile.current = null
    resetTraining()
    const controller = new AbortController()
    activeLoad.current = controller
    const id = ++request.current
    setLoading(true)
    setDataset(null)
    setError('')
    try {
      const prepared = await loadGanImageCsv(file, controller.signal)
      if (id === request.current && !controller.signal.aborted) {
        sourceFile.current = file
        setDataset(prepared)
      }
    } catch (cause) {
      if (id === request.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Error al importar imágenes.')
    } finally {
      if (id === request.current) { setLoading(false); activeLoad.current = null }
    }
  }

  const trainingBusy = ['starting', 'running', 'stopping'].includes(training.phase)
  // No cambiar dataset, arquitectura u opciones durante confirmaciones remotas.
  const locked = trainingBusy || syncState === 'pending' || generating || summaryState === 'saving' || savingModel

  function changeConfig(next: GanConfig) {
    if (locked || !canEdit) return
    resetTraining()
    setConfig(next)
  }

  /** Registrar primero la ejecución; iniciar TensorFlow.js solo después del UUID confirmado. */
  async function startTraining() {
    if (!dataset || !sourceFile.current || !canEdit || architecture.errors.length || locked || loading) return
    resetTraining()
    const id = trainingRequest.current
    const controller = new AbortController()
    startAbort.current = controller
    const file = sourceFile.current
    const currentDataset = dataset
    const currentConfig = { ...config }
    const currentSettings = { ...settings }
    setTraining({ ...EMPTY_GAN_TRAINING, phase: 'starting',
      message: 'Calculando huella SHA-256 y preparando Supabase…', images: dataset.count })
    try {
      const hash = await sha256LocalFile(file, controller.signal)
      if (id !== trainingRequest.current) return
      if (controller.signal.aborted) {
        setTraining((previous) => ({ ...previous, phase: 'cancelled', message: 'Preparación cancelada.' }))
        return
      }
      setTraining((previous) => ({ ...previous, message: 'Registrando ejecución GAN…' }))
      const persistedId = await createGanRun(projectId, {
        name: file.name, byteSize: file.size, sha256: hash,
      }, currentDataset, currentConfig, currentSettings)
      if (id !== trainingRequest.current) {
        await finishGanRun(persistedId, 'interrupted').catch(() => undefined)
        return
      }
      const queue = createGanPersistenceQueue(persistedId, currentSettings.epochs, {
        runtime: recordGanRuntime, epoch: recordGanEpoch,
        finish: finishGanRun, summary: recordGanSummary,
      }, {
        epochConfirmed: (epoch) => {
          if (queueRef.current === queue) setSavedEpochs(epoch)
        },
        finishedConfirmed: (status) => {
          if (queueRef.current === queue) setSyncState(status === 'completed' ? 'confirmed' : 'idle')
        },
        failed: (message) => {
          if (queueRef.current !== queue) return
          setSyncState('error')
          setSyncError(message)
          trainingSession.current?.cancel()
        },
      })
      queueRef.current = queue
      setRunId(persistedId)
      setSyncState('pending')
      if (controller.signal.aborted) {
        queue.finish('cancelled')
        setTraining((previous) => ({ ...previous, phase: 'cancelled', message: 'Preparación cancelada.' }))
        return
      }
      const onEvent = (event: GanTrainingEvent) => {
        if (id !== trainingRequest.current || queueRef.current !== queue) return
        if (event.type === 'status') queue.runtime(event.backend, event.context, event.tfjsVersion)
        if (event.type === 'epoch') queue.epoch(event.metrics)
        if (event.type === 'completed') queue.finish('completed', event.durationMs)
        if (event.type === 'cancelled') queue.finish('cancelled')
        if (event.type === 'error') queue.finish('failed', undefined, event.message)
        setTraining((previous): GanTrainingDisplay => {
          switch (event.type) {
            case 'status': return { ...previous, phase: previous.phase === 'stopping' ? 'stopping' : 'running',
              message: event.message, backend: event.backend, context: event.context, images: event.images }
            case 'batch': return { ...previous,
              phase: previous.phase === 'stopping' ? 'stopping' : 'running',
              message: `Época ${event.epoch}/${event.epochs}, lote ${event.batch}/${event.batches}`,
              progress: ((event.epoch - 1) + event.batch / event.batches) / event.epochs }
            case 'epoch': return { ...previous, epochs: [...previous.epochs, event.metrics] }
            case 'completed': return { ...previous, phase: 'completed',
              message: 'Entrenamiento local completado. Confirmando Supabase…',
              progress: 1, durationMs: event.durationMs, backend: event.backend }
            case 'cancelled': return { ...previous, phase: 'cancelled', message: 'Entrenamiento cancelado.' }
            case 'error': return { ...previous, phase: 'error', message: event.message }
            default: return previous
          }
        })
      }
      trainingSession.current = startGanTraining(currentDataset, currentConfig, currentSettings, onEvent)
    } catch (cause) {
      if (id !== trainingRequest.current) return
      const message = cause instanceof Error ? cause.message : 'No se pudo preparar el entrenamiento GAN.'
      if (queueRef.current && !queueRef.current.terminalQueued) {
        queueRef.current.finish(controller.signal.aborted ? 'cancelled' : 'failed', undefined, message)
      }
      if (!controller.signal.aborted) {
        setSyncState('error')
        setSyncError(message)
      }
      setTraining((previous) => ({ ...previous,
        phase: controller.signal.aborted ? 'cancelled' : 'error',
        message: controller.signal.aborted ? 'Preparación cancelada.' : message }))
    } finally {
      if (startAbort.current === controller) startAbort.current = null
    }
  }

  /** Publicación privada solo tras entrenamiento, resumen y cierre confirmados por Supabase.
   * Se exportan exclusivamente pesos G; nunca D, CSV o imágenes individuales.
   */
  async function publishGanModel() {
    if (publishLock.current || savingModel || !canEdit || !runId || !trainingSession.current ||
      training.phase !== 'completed' || syncState !== 'confirmed' || summaryState !== 'confirmed') return
    const name = modelName.trim()
    if (!name || name.length > 120) {
      setSaveModelError('El nombre del modelo debe tener de 1 a 120 caracteres.')
      return
    }
    const session = trainingSession.current
    const id = trainingRequest.current
    const associatedRun = runId
    publishLock.current = true
    setSavingModel(true)
    setSaveModelError('')
    setPublishedVersion(null)
    try {
      const bundle = await session.exportModel()
      if (id !== trainingRequest.current || trainingSession.current !== session) {
        throw new Error('La sesión GAN cambió antes de exportar el modelo.')
      }
      const version = await saveModelVersion(associatedRun, name, bundle)
      if (id === trainingRequest.current && trainingSession.current === session) setPublishedVersion(version)
    } catch (cause) {
      if (id === trainingRequest.current) setSaveModelError(cause instanceof Error ? cause.message : 'No se pudo guardar el generador GAN.')
    } finally {
      publishLock.current = false
      if (id === trainingRequest.current) setSavingModel(false)
    }
  }

  function cancelTraining() {
    if (!trainingBusy) return
    setTraining((previous) => ({ ...previous, phase: 'stopping',
      message: 'Deteniendo el entrenamiento al finalizar el lote actual…' }))
    startAbort.current?.abort()
    trainingSession.current?.cancel()
  }

  /** Las imágenes permanecen en memoria; se persiste solo el primer resumen descriptivo. */
  async function generateImages() {
    if (!canEdit || training.phase !== 'completed' || generatingLock.current || !trainingSession.current) return
    const session = trainingSession.current
    const sessionId = trainingRequest.current
    const queue = queueRef.current
    generatingLock.current = true
    setGenerating(true)
    setGenerationError('')
    try {
      const batch = await session.generate(sampleCount)
      validateGanGeneratedBatch(batch)
      if (sessionId !== trainingRequest.current) return
      setGenerated(batch)
      // No crear evaluaciones ficticias: la RPC exige run remoto completed.
      if (queue && summaryState === 'idle') {
        await queue.idle()
        if (sessionId !== trainingRequest.current) return
        if (queue.isCompletedConfirmed && !queue.hasFailed) {
          setSummaryState('saving')
          try {
            const stored = await queue.summary(batch)
            if (sessionId === trainingRequest.current && stored) setSummaryState('confirmed')
          } catch (cause) {
            if (sessionId !== trainingRequest.current) return
            setSummaryState('error')
            setSummaryError(cause instanceof Error ? cause.message : 'No se confirmó el resumen GAN.')
          }
        }
      }
    } catch (cause) {
      if (sessionId === trainingRequest.current) {
        setGenerationError(cause instanceof Error ? cause.message : 'No se pudo generar imágenes.')
      }
    } finally {
      generatingLock.current = false
      if (sessionId === trainingRequest.current) setGenerating(false)
    }
  }

  if (checking) return <Surface className="p-6"><Spinner label="Comprobando permisos del proyecto…"/></Surface>
  if (!project || !membership) return <Notice tone="error">{accessError || 'No tienes acceso al módulo GAN.'}</Notice>

  return <div className="space-y-6">
    <header className="space-y-2">
      <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight"><Sparkles size={25}/> Red generativa adversarial · GAN</h1>
      <p className="text-sm text-[var(--muted)]">{project.name} · GAN-4C: generador versionado y generación privada.</p>
    </header>
    <Tabs items={tabs} value={view} onChange={(next) => setView(next as GanView)} label="Módulo GAN" idPrefix="gan"/>
    <div id={`gan-panel-${view}`} role="tabpanel" aria-labelledby={`gan-tab-${view}`} tabIndex={0} className="space-y-5">
      {view === 'datos' && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
        <Surface className="space-y-4 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Database size={19}/> CSV local de imágenes reales</h2>
          <p className="text-sm text-[var(--muted)]">Imágenes en gris de 8×8 (64 píxeles) o 28×28 (784). Encabezados pixel_0…; columna label opcional al principio o al final. No se envía el archivo a Supabase.</p>
          <LocalCsvDropzone id="gan-csv" disabled={!canEdit || loading || locked} loading={loading}
            onFile={(file) => onImport(file)} hint="CSV de imágenes 8×8 o 28×28; las etiquetas son opcionales y el archivo permanece local." />
          {!canEdit && <Notice>Solo Ingeniero en un proyecto activo puede importar imágenes o editar la arquitectura. Otros integrantes tienen acceso de lectura.</Notice>}
          {loading && <Spinner label="Analizando imágenes locales…"/>}
          {error && <Notice tone="error">{error}</Notice>}
          {dataset && <dl className="grid grid-cols-2 gap-3 text-sm">{[
            ['Archivo', dataset.name], ['Imágenes', dataset.count],
            ['Forma', `${dataset.dimension} × ${dataset.dimension} × 1`], ['Rango original', `0–${dataset.originalScale}`],
            ['Etiquetas', dataset.hadLabels ? 'Ignoradas (GAN no condicional)' : 'Sin etiquetas'],
            ['Máximo', MAX_GAN_IMAGES],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd>
          </div>)}</dl>}
          {dataset?.truncated && <Notice>Se cargaron las primeras {MAX_GAN_IMAGES} imágenes para limitar el uso de memoria.</Notice>}
          {dataset && <Button type="button" variant="outline" onClick={() => setView('arquitectura')}><Layers3 size={16}/> Ver arquitectura</Button>}
        </Surface>
        <Surface className="space-y-4 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><ImageIcon size={19}/> Vista previa de imágenes reales</h2>
          <p className="text-xs text-[var(--muted)]">Estas son imágenes reales del CSV; las muestras artificiales se muestran en Generar.</p>
          {dataset ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {examples.map((example) => <GanGrayImage key={example.index} size={dataset.dimension} pixels={example.pixels} label={`Imagen real ${example.index + 1}`}/>)}
          </div> : <p className="rounded-xl border border-dashed border-[var(--line)] p-8 text-center text-sm text-[var(--muted)]">Importa un CSV para visualizar imágenes reales.</p>}
        </Surface>
      </div>}
      {view === 'arquitectura' && <>
        <Surface className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold">Diseñador de GAN densa no condicional</h2>
          <p className="text-sm text-[var(--muted)]">El generador crea candidatos a partir de ruido. El discriminador aprende a distinguir imágenes reales de generadas. Ambos se entrenan de forma alternada con optimizadores Adam independientes en GAN-2.</p>
          <fieldset disabled={!canEdit || locked} className="grid gap-4 sm:grid-cols-3">
            <SelectField id="gan-latent" label="Dimensión de ruido z" value={String(config.latentSize)} options={[16, 32, 64].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => changeConfig({ ...config, latentSize: Number(event.target.value) as GanLatentDimension })}/>
            <SelectField id="gan-generator-units" label="Unidades generador" value={String(config.generatorUnits)} options={[32, 64, 128].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => changeConfig({ ...config, generatorUnits: Number(event.target.value) as GanHiddenUnits })}/>
            <SelectField id="gan-discriminator-units" label="Unidades discriminador" value={String(config.discriminatorUnits)} options={[32, 64, 128].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => changeConfig({ ...config, discriminatorUnits: Number(event.target.value) as GanHiddenUnits })}/>
          </fieldset>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">{[
            ['Imagen prevista', `${dataset?.dimension ?? 8}×${dataset?.dimension ?? 8}×1${!dataset ? ' (ilustrativa)' : ''}`],
            ['Parámetros generador', architecture.generator.totalParameters.toLocaleString('es-PE')],
            ['Parámetros discriminador', architecture.discriminator.totalParameters.toLocaleString('es-PE')],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-[var(--surface-muted)] p-3"><dt className="text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>)}</dl>
          {architecture.errors.length ? <Notice tone="error">{architecture.errors.join(' ')}</Notice> : <Notice tone="success">Dimensiones y parámetros teóricos consistentes. Puedes entrenar desde la pestaña Entrenar.</Notice>}
          {!dataset && <Notice>Sin dataset, el diagrama utiliza 8×8 solo como ilustración. Importa datos reales para fijar la forma de salida.</Notice>}
        </Surface>
        <GanDiagram generator={architecture.generator} discriminator={architecture.discriminator}/>
      </>}
      {view === 'entrenar' && <GanTrainingPanel
        settings={settings} persistenceLocked={locked} onSettings={(next) => { if (locked) return; resetTraining(); setSettings(next) }}
        display={training} canEdit={Boolean(canEdit)} hasDataset={Boolean(dataset)}
        canTrain={Boolean(dataset && !architecture.errors.length && !loading && !locked)}
        onStart={startTraining} onCancel={cancelTraining}
      />}
      {view === 'entrenar' && <Surface className="space-y-2 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Database size={19}/> Persistencia GAN · Supabase</h2>
        <p className="text-sm" aria-live="polite">{syncState === 'confirmed' ? 'Ejecución completada y confirmada en Supabase.' :
          syncState === 'pending' ? 'Confirmando backend, épocas y estado remoto…' :
          syncState === 'error' ? 'Error de persistencia: no se confirmó el entrenamiento.' :
          runId ? 'Ejecución terminada; revisa su estado en el historial.' : 'Todavía no se ha registrado ninguna ejecución.'}</p>
        {runId && <p className="break-all text-xs text-[var(--muted)]">ID ejecución: <code>{runId}</code></p>}
        {runId && <p className="text-xs text-[var(--muted)]">Épocas confirmadas: {savedEpochs} / {settings.epochs} · 4 métricas por época.</p>}
        {syncState === 'pending' && <Spinner size="sm" label="Sincronizando entrenamiento GAN…"/>}
        {syncError && <Notice tone="error">{syncError}</Notice>}
        <p className="text-xs text-[var(--muted)]">Solo se guardan metadatos y pérdidas adversariales. El CSV y los pesos del generador siguen en este navegador.</p>
      </Surface>}
      {view === 'generar' && <GanGenerationPanel batch={generated} count={sampleCount} onCount={setSampleCount}
        onGenerate={() => { void generateImages() }} generating={generating} error={generationError}
        ready={training.phase === 'completed'} canEdit={Boolean(canEdit)}/>}
      {view === 'generar' && runId && <Surface className="space-y-2 p-5 sm:p-6">
        <h3 className="text-sm font-semibold">Resumen remoto de generación</h3>
        <p className="text-xs text-[var(--muted)]">Se almacena únicamente el primer resumen numérico de 4, 8 o 16 imágenes; nunca los píxeles ni archivos PNG.</p>
        {summaryState === 'confirmed' && <Notice tone="success">Resumen descriptivo confirmado en Supabase.</Notice>}
        {summaryState === 'saving' && <Spinner size="sm" label="Guardando resumen numérico…"/>}
        {summaryState === 'error' && <Notice tone="error">{summaryError} No se reintenta automáticamente para evitar duplicados.</Notice>}
        {summaryState === 'idle' && syncState === 'confirmed' && <Notice>Genera imágenes para guardar el primer resumen descriptivo.</Notice>}
        {summaryState === 'idle' && syncState !== 'confirmed' && <Notice>La generación local funciona, pero el resumen remoto necesita una ejecución confirmada.</Notice>}
      </Surface>}
      {view === 'generar' && canEdit && training.phase === 'completed' && <Surface className="space-y-4 p-5 sm:p-6">
        <header className="flex items-center gap-2"><Save size={19}/><h3 className="text-lg font-semibold">Guardar versión GAN · solo generador</h3></header>
        <p className="text-sm text-[var(--muted)]">Publica G con sus pesos en Storage privado, no el discriminador ni las imágenes. Después podrás recuperar esta versión desde Modelos privados y generar nuevas imágenes sin CSV.</p>
        <div className="max-w-md"><InputField id="gan-model-name" label="Nombre del modelo" maxLength={120}
          value={modelName} disabled={savingModel || Boolean(publishedVersion)}
          onChange={(event) => { setModelName(event.target.value); setSaveModelError('') }}/></div>
        <Button type="button" busy={savingModel} disabled={savingModel || Boolean(publishedVersion) ||
          syncState !== 'confirmed' || summaryState !== 'confirmed'} onClick={() => void publishGanModel()}>
          <Save size={16}/> Guardar versión inmutable
        </Button>
        {(syncState !== 'confirmed' || summaryState !== 'confirmed') && <Notice>Primero completa el entrenamiento, genera un lote y espera la confirmación del resumen descriptivo en Supabase.</Notice>}
        {saveModelError && <Notice tone="error">{saveModelError}</Notice>}
        {publishedVersion && <Notice tone="success">Versión v{publishedVersion.version} publicada y verificada. Puedes recuperar el generador en{' '}
          <Link to={`/proyectos/${projectId}/modelos`} className="underline">Modelos privados</Link> sin volver a entrenar.</Notice>}
      </Surface>}
      <p className="flex items-center gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={16}/> CSV, píxeles y muestras permanecen en este navegador. Solo se guardan metadatos, métricas por época y un resumen numérico de generación; los pesos G se publican solo cuando el ingeniero guarda una versión.</p>
    </div>
  </div>
}
