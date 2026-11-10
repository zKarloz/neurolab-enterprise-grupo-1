import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Database, Image as ImageIcon, Layers3, RefreshCcw, ShieldCheck, SlidersHorizontal, UploadCloud } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { Tabs } from '../../components/ui/Tabs'
import { useAuth } from '../auth/AuthProvider'
import { getProject, listMembers } from '../../services/projects'
import type { Project, ProjectMember } from '../../types/projects'
import {
  defaultCnnConfig, describeCnn, resizeCnnBlocks,
  type CnnBlockConfig, type CnnConfig, type CnnInputShape, type DenseUnits, type Filters, type Kernel, type Padding,
} from '../../ml/cnn/architecture'
import { loadLocalImageCsv, selectLocalImageGallery, type LocalImageDataset, type LocalImageSample } from '../../ml/cnn/localImageCsv'
import { CnnDiagramView } from './CnnDiagram'
import { CnnTrainingPanel, EMPTY_CNN_TRAINING, type CnnTrainingDisplay } from './CnnTrainingPanel'
import { CnnEvaluationPanel } from './CnnEvaluationPanel'
import { CnnPredictionPanel } from './CnnPredictionPanel'
import type { CnnEvaluation } from '../../ml/cnn/cnnEvaluation.ts'
import { startCnnTraining, type CnnSession } from '../../ml/cnn/cnnSession'
import { DEFAULT_CNN_TRAIN_OPTIONS, type CnnTrainOptions, type CnnTrainingEvent } from '../../ml/cnn/trainingTypes'

const TABS = [
  { id: 'datos', label: 'Datos' },
  { id: 'arquitectura', label: 'Arquitectura' },
  { id: 'entrenar', label: 'Entrenar' },
  { id: 'evaluar', label: 'Evaluar' },
  { id: 'predecir', label: 'Predecir' },
] as const

type ViewId = typeof TABS[number]['id']
const numberOptions = (numbers: readonly number[]) => numbers.map((n) => ({ value: String(n), label: String(n) }))
const filterOptions = numberOptions([8, 16, 32, 64])
const kernelOptions = [{ value: '3', label: '3 × 3' }, { value: '5', label: '5 × 5' }]
const denseOptions = numberOptions([32, 64, 128])
const paddingOptions = [{ value: 'same', label: 'Same (mantener tamaño)' }, { value: 'valid', label: 'Valid (sin relleno)' }]

/** Vista previa real de un CSV de imágenes, con resolución dinámica y sin red. */
function DigitPreview({ sample, dimension }: { sample: LocalImageSample; dimension: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const rgba = ctx.createImageData(dimension, dimension)
    sample.pixels.forEach((value, index) => {
      rgba.data[index * 4] = value
      rgba.data[index * 4 + 1] = value
      rgba.data[index * 4 + 2] = value
      rgba.data[index * 4 + 3] = 255
    })
    ctx.putImageData(rgba, 0, 0)
  }, [sample, dimension])
  return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-center">
    <canvas ref={canvasRef} width={dimension} height={dimension} role="img" aria-label={`Imagen de la clase ${sample.label}`}
      style={{ imageRendering: 'pixelated' }} className="mx-auto aspect-square w-full max-w-20 rounded bg-black" />
    <span className="mt-2 block text-xs font-semibold">{sample.label}</span>
  </div>
}

function CnnDataView({ dataset, loading, error, onFile, disabled }: {
  dataset: LocalImageDataset | null
  loading: boolean
  error: string
  onFile: (file: File) => void
  disabled: boolean
}) {
  const gallery = useMemo(() => dataset ? selectLocalImageGallery(dataset, 3) : [], [dataset])
  const distribution = useMemo(() => dataset ? dataset.classNames.map((_, i) => dataset.labels.filter((label) => label === i).length) : [], [dataset])
  const maximum = Math.max(1, ...distribution)
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-2"><Database size={19} /><h2 className="text-lg font-semibold">Dataset local</h2></div>
        <p className="mt-2 text-sm text-[var(--muted)]">Selecciona un CSV etiquetado. Soporta imágenes en grises de 8 × 8 (Digits) o 28 × 28 (MNIST). No se descargarán datos desde Google.</p>
        <label htmlFor="cnn-upload-csv" className={`mt-5 flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-4 text-center text-sm font-medium ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-[var(--focus)]'}`}>
          <UploadCloud size={22} />{loading ? 'Leyendo CSV…' : 'Seleccionar archivo CSV local'}
        </label>
        <input id="cnn-upload-csv" type="file" accept=".csv,text/csv" disabled={disabled || loading} className="sr-only" onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onFile(file)
          event.currentTarget.value = ''
        }} />
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">Columnas: label y pixel_0… en orden. Se leen hasta 2 000 imágenes y no se envía el CSV a Supabase. Los archivos completos permanecen en tu equipo.</p>
        {disabled && <Notice>Para cambiar el dataset, espera a que termine el entrenamiento o cancélalo.</Notice>}
        {loading && <Spinner className="mt-4" size="sm" label="Validando imágenes y etiquetas…" />}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        {dataset && <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {[
            ['Archivo', dataset.name], ['Muestras', String(dataset.count)],
            ['Clases', String(dataset.classNames.length)], ['Dimensiones', `${dataset.width} × ${dataset.height} × 1`],
            ['Rango original', `0–${dataset.originalScale}`], ['Origen', 'Archivo local'],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 break-all font-semibold">{value}</dd></div>)}
        </dl>}
        {dataset?.truncated && <p className="mt-3 text-xs text-[var(--muted)]">Se utilizó un máximo de 2 000 filas para evitar un consumo elevado de memoria.</p>}
      </Surface>
      <Surface className="min-w-0 p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Imágenes de ejemplo</h2>
        {dataset ? <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10" aria-label="Galería de imágenes locales">
          {gallery.map((sample) => <DigitPreview key={sample.index} sample={sample} dimension={dataset.width} />)}
        </div> : <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] p-6 text-center">
          <ImageIcon size={31} className="text-[var(--muted)]" />
          <p className="mt-3 text-sm font-medium">Sin dataset cargado</p>
          <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">Adjunta tu digits-8x8.csv o un CSV de MNIST para ver sus imágenes reales.</p>
        </div>}
      </Surface>
    </div>
    {dataset && <Surface className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Distribución de las clases importadas</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Distribución de las {dataset.count} imágenes leídas, no del archivo completo si se aplicó un límite.</p>
      <div className="mt-5 grid grid-cols-5 gap-3 sm:grid-cols-10">
        {distribution.map((count, i) => <div key={dataset.classNames[i]} className="flex flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end justify-center rounded-lg bg-[var(--surface-muted)] p-2">
            <div className="w-full max-w-8 rounded-t-md bg-[var(--chart-train)]" style={{ height: `${Math.round(count / maximum * 100)}%` }} title={`${count} imágenes`} />
          </div>
          <span className="text-xs font-semibold">{dataset.classNames[i]}</span>
          <span className="text-xs tabular-nums text-[var(--muted)]">{count}</span>
        </div>)}
      </div>
    </Surface>}
  </div>
}

function CnnArchitectureView({ config, setConfig, canConfigure, isTraining, input }: { config: CnnConfig; setConfig: (value: CnnConfig) => void; canConfigure: boolean; isTraining: boolean; input: CnnInputShape }) {
  const diagram = useMemo(() => describeCnn(config, input), [config, input])
  const updateBlock = (index: number, change: Partial<CnnBlockConfig>) => {
    setConfig({ ...config, blocks: config.blocks.map((item, i) => i === index ? { ...item, ...change } : item) })
  }
  return <div className="space-y-5">
    <CnnDiagramView diagram={diagram} />
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-2"><SlidersHorizontal size={18} /><h2 className="text-lg font-semibold">Constructor CNN</h2></div>
        <p className="mt-2 text-xs text-[var(--muted)]">El esquema se actualiza al modificar los bloques. La configuración es local y no se guarda todavía en Supabase.</p>
        <div className="mt-5 max-w-xs">
          <SelectField id="cnn-block-count" label="Bloques convolucionales" options={numberOptions([1, 2, 3])} value={String(config.blocks.length)} disabled={!canConfigure} onChange={(event) => setConfig(resizeCnnBlocks(config, Number(event.target.value)))} />
        </div>
        <div className="mt-4 space-y-4">
          {config.blocks.map((block, index) => <fieldset key={block.id} disabled={!canConfigure} className="rounded-xl border border-[var(--line)] p-4">
            <legend className="px-2 text-sm font-semibold">Bloque {index + 1}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label="Filtros" id={`cnn-filters-${index}`} options={filterOptions} value={String(block.filters)} onChange={(event) => updateBlock(index, { filters: Number(event.target.value) as Filters })} />
              <SelectField label="Kernel" id={`cnn-kernel-${index}`} options={kernelOptions} value={String(block.kernel)} onChange={(event) => updateBlock(index, { kernel: Number(event.target.value) as Kernel })} />
              <div className="sm:col-span-2"><SelectField label="Padding" id={`cnn-padding-${index}`} options={paddingOptions} value={block.padding} onChange={(event) => updateBlock(index, { padding: event.target.value as Padding })} /></div>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={block.pool} onChange={(event) => updateBlock(index, { pool: event.target.checked })} className="size-4 accent-[var(--focus)]" /> Añadir MaxPooling 2 × 2</label>
          </fieldset>)}
        </div>
        <div className="mt-5 max-w-xs"><SelectField id="cnn-dense" label="Neuronas de capa densa" options={denseOptions} value={String(config.denseUnits)} disabled={!canConfigure} onChange={(event) => setConfig({ ...config, denseUnits: Number(event.target.value) as DenseUnits })} /></div>
        {canConfigure && <Button className="mt-5" type="button" variant="outline" onClick={() => setConfig(defaultCnnConfig())}><RefreshCcw size={16} /> Restablecer arquitectura</Button>}
        {!canConfigure && <div className="mt-4"><Notice>{isTraining ? 'La arquitectura se bloquea mientras hay un entrenamiento en marcha.' : 'El rol Ingeniero en un proyecto activo es el que configura arquitecturas. Esta vista es de consulta para tu rol actual.'}</Notice></div>}
      </Surface>
      <div className="space-y-4">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-center gap-2"><Layers3 size={18} /><h2 className="text-lg font-semibold">Resumen técnico</h2></div>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Entrada</dt><dd>{input.height} × {input.width} × {input.channels}</dd></div>
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Bloques CNN</dt><dd>{config.blocks.length}</dd></div>
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Salida</dt><dd>{input.classes} clases · Softmax</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Parámetros entrenables</dt><dd className="font-semibold tabular-nums">{diagram.parameterCount.toLocaleString('es-PE')}</dd></div>
          </dl>
        </Surface>
        {diagram.errors.length ? <Notice tone="error">{diagram.errors.join(' ')}</Notice> : <Notice tone="success"><ShieldCheck className="mr-1 inline size-4" /> Dimensiones compatibles y parámetros calculados. Puedes entrenar esta arquitectura en la pestaña Entrenar.</Notice>}
        <Surface className="p-5 sm:p-6">
          <h3 className="text-base font-semibold">Estructura planeada</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Entrada → Convoluciones y pooling → Flatten → Dense (ReLU) → Salida multiclase (Softmax). Se añadirán dropout y opciones avanzadas cuando estén respaldadas por el motor de entrenamiento.</p>
        </Surface>
      </div>
    </div>
  </div>
}

/** CNN-3: evalúa un subconjunto test e infiere imágenes con un modelo temporal. */
export function CnnPage() {
  const { projectId = '' } = useParams()
  const { state } = useAuth()
  const userId = state.status === 'ready' ? state.user.id : ''
  const [project, setProject] = useState<Project | null>(null)
  const [membership, setMembership] = useState<ProjectMember | null>(null)
  const [checking, setChecking] = useState(true)
  const [projectError, setProjectError] = useState('')
  const [tab, setTab] = useState<ViewId>('datos')
  const [config, setConfig] = useState<CnnConfig>(defaultCnnConfig)
  const [dataset, setDataset] = useState<LocalImageDataset | null>(null)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleError, setSampleError] = useState('')
  const loadAbort = useRef<AbortController | null>(null)
  const session = useRef<CnnSession | null>(null)
  const [trainOptions, setTrainOptions] = useState<CnnTrainOptions>(DEFAULT_CNN_TRAIN_OPTIONS)
  const [training, setTraining] = useState<CnnTrainingDisplay>(EMPTY_CNN_TRAINING)
  const [evaluation, setEvaluation] = useState<CnnEvaluation | null>(null)

  const loadProject = useCallback(async (signal?: { cancelled: boolean }) => {
    setChecking(true)
    setProjectError('')
    try {
      const found = await getProject(projectId)
      const members = found ? await listMembers(projectId) : []
      if (signal?.cancelled) return
      setProject(found)
      setMembership(members.find((member) => member.user_id === userId) ?? null)
    } catch (error) {
      if (signal?.cancelled) return
      setProjectError(error instanceof Error ? error.message : 'No se pudo consultar el proyecto.')
      setProject(null)
      setMembership(null)
    } finally { if (!signal?.cancelled) setChecking(false) }
  }, [projectId, userId])

  useEffect(() => {
    const signal = { cancelled: false }
    void loadProject(signal)
    return () => { signal.cancelled = true }
  }, [loadProject])

  useEffect(() => () => {
    loadAbort.current?.abort()
    session.current?.dispose()
  }, [])

  // Una nueva identidad o proyecto no debe reutilizar datos/modelos de la sesión anterior.
  useEffect(() => {
    loadAbort.current?.abort()
    session.current?.dispose()
    session.current = null
    setDataset(null)
    setTraining(EMPTY_CNN_TRAINING)
    setEvaluation(null)
    setSampleError('')
  }, [projectId, userId])

  /** Recibe únicamente métricas reales del motor de TensorFlow.js. */
  function handleTrainingEvent(event: CnnTrainingEvent) {
    // El reporte pertenece a la sesión concreta: nunca se reutiliza tras cambiar datos.
    if (event.type === 'evaluated') { setEvaluation(event.report); return }
    if (event.type === 'prediction' || event.type === 'prediction-error') return
    setTraining((previous) => {
      switch (event.type) {
        case 'status': return { ...previous, phase: 'running', message: event.message, backend: event.backend ?? previous.backend, trainingCount: event.trainingCount ?? previous.trainingCount, validationCount: event.validationCount ?? previous.validationCount, testCount: event.testCount ?? previous.testCount }
        case 'batch': return { ...previous, progress: Math.max(previous.progress, (event.epoch - 1 + event.batch / event.batches) / event.epochs) }
        case 'epoch': return { ...previous, epochs: [...previous.epochs, event.metrics], progress: Math.max(previous.progress, event.metrics.epoch / trainOptions.epochs) }
        case 'completed': return { ...previous, phase: 'completed', message: 'Entrenamiento terminado.', durationMs: event.durationMs, backend: event.backend, progress: 1 }
        case 'cancelled': return { ...previous, phase: 'cancelled', message: 'Entrenamiento cancelado.' }
        case 'error': return { ...previous, phase: 'error', message: event.message }
      }
    })
  }

  function startTraining() {
    if (training.phase === 'running') return
    if (!dataset || membership?.role !== 'engineer' || project?.status !== 'active' || describeCnn(config, input).errors.length || trainOptions.samples > dataset.count) return
    session.current?.dispose()
    setEvaluation(null)
    setTraining({ ...EMPTY_CNN_TRAINING, phase: 'running', message: 'Iniciando TensorFlow.js…' })
    // Copias independientes: los selectores no alteran una ejecución en marcha.
    session.current = startCnnTraining(structuredClone(config), { ...trainOptions }, handleTrainingEvent, dataset)
  }

  /** Importa imágenes solo en memoria, sin red y sin alterar un entrenamiento activo. */
  async function loadFile(file: File) {
    if (training.phase === 'running') return
    loadAbort.current?.abort()
    const controller = new AbortController()
    loadAbort.current = controller
    setLoadingSamples(true)
    setSampleError('')
    try {
      const loaded = await loadLocalImageCsv(file, controller.signal)
      if (!controller.signal.aborted) {
        // El modelo anterior no debe clasificar imágenes de otro CSV.
        session.current?.dispose()
        session.current = null
        setEvaluation(null)
        setDataset(loaded)
        setTrainOptions((previous) => ({ ...previous, samples: Math.min(previous.samples, loaded.count) }))
        setTraining(EMPTY_CNN_TRAINING)
      }
    } catch (error) {
      if (!controller.signal.aborted) setSampleError(error instanceof Error ? error.message : 'No se pudo leer el CSV seleccionado.')
    } finally {
      if (!controller.signal.aborted) setLoadingSamples(false)
    }
  }

  /** Cambiar la red invalida pesos y evaluación antiguos; evita predicciones obsoletas. */
  function changeConfig(next: CnnConfig) {
    if (training.phase === 'running') return
    session.current?.dispose()
    session.current = null
    setEvaluation(null)
    setTraining(EMPTY_CNN_TRAINING)
    setConfig(next)
  }

  if (checking) return <Surface className="p-8"><Spinner label="Comprobando proyecto y permisos…" centered /></Surface>
  if (projectError) return <Notice tone="error">{projectError} <Button type="button" variant="outline" className="ml-2" onClick={() => void loadProject()}>Reintentar</Button></Notice>
  if (!project || !membership) return <Notice tone="error">Proyecto no encontrado o sin membresía autorizada. El Administrador global no obtiene acceso técnico automáticamente.</Notice>

  const canTrain = membership.role === 'engineer' && project.status === 'active'
  const input: CnnInputShape = dataset
    ? { width: dataset.width, height: dataset.height, channels: dataset.channels, classes: dataset.classNames.length }
    : { width: 28, height: 28, channels: 1, classes: 10 }
  const isTraining = training.phase === 'running'
  const canConfigure = canTrain && !isTraining
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs text-[var(--muted)]"><Link className="underline-offset-4 hover:underline" to={`/proyectos/${projectId}`}>{project.name}</Link> <ArrowRight className="mx-1 inline size-3" /> CNN</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Red convolucional (CNN)</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Adjunta un CSV, entrena, evalúa con datos reservados y clasifica imágenes. El modelo permanece solo durante esta sesión del navegador.</p>
      </div>
      <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold">{dataset ? `${dataset.width} × ${dataset.height} · ${dataset.name}` : 'Dataset local · CSV'}</span>
    </header>
    <Tabs label="Secciones del módulo CNN" idPrefix="cnn" items={TABS} value={tab} onChange={(next) => setTab(next as ViewId)} />
    <div id={`cnn-panel-${tab}`} role="tabpanel" aria-labelledby={`cnn-tab-${tab}`} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
      {tab === 'datos' && <CnnDataView dataset={dataset} loading={loadingSamples} error={sampleError} onFile={(file) => void loadFile(file)} disabled={isTraining} />}
      {tab === 'arquitectura' && <CnnArchitectureView config={config} setConfig={changeConfig} canConfigure={canConfigure} isTraining={isTraining} input={input} />}
      {tab === 'entrenar' && <CnnTrainingPanel options={trainOptions} setOptions={setTrainOptions} display={training} canTrain={canTrain} architectureValid={describeCnn(config, input).errors.length === 0} datasetCount={dataset?.count ?? 0} datasetName={dataset?.name ?? null} onStart={startTraining} onCancel={() => session.current?.cancel()} />}
      {tab === 'evaluar' && <CnnEvaluationPanel report={training.phase === 'completed' ? evaluation : null} inputSize={input.width} onTrain={() => setTab('entrenar')} />}
      {tab === 'predecir' && <CnnPredictionPanel report={training.phase === 'completed' ? evaluation : null} input={input} onPredict={(pixels) => session.current?.predict(pixels) ?? Promise.reject(new Error('No hay una CNN entrenada en esta sesión.'))} onTrain={() => setTab('entrenar')} />}
    </div>
  </div>
}
