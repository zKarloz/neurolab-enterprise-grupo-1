import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Database, Image as ImageIcon, Layers3, RefreshCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react'
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
  type CnnBlockConfig, type CnnConfig, type DenseUnits, type Filters, type Kernel, type Padding,
} from '../../ml/cnn/architecture'
import { loadMnistPreview, selectMnistGallery, type MnistPreview, type MnistSample } from '../../ml/cnn/mnistPreview'
import { CnnDiagramView } from './CnnDiagram'

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

/** Renderizado fiel de los 784 bytes de MNIST, sin canvas de entrenamiento ni datos simulados. */
function DigitPreview({ sample }: { sample: MnistSample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const rgba = ctx.createImageData(28, 28)
    for (let index = 0; index < sample.pixels.length; index++) {
      const value = sample.pixels[index]
      rgba.data[index * 4] = value
      rgba.data[index * 4 + 1] = value
      rgba.data[index * 4 + 2] = value
      rgba.data[index * 4 + 3] = 255
    }
    ctx.putImageData(rgba, 0, 0)
  }, [sample])
  return <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2 text-center">
    <canvas ref={canvasRef} width={28} height={28} role="img" aria-label={`Muestra real de MNIST: dígito ${sample.label}`} style={{ imageRendering: 'pixelated' }} className="mx-auto aspect-square w-full max-w-20 rounded bg-black" />
    <span className="mt-2 block text-xs font-semibold">{sample.label}</span>
  </div>
}

function CnnDataView({ preview, loading, error, onLoad }: { preview: MnistPreview | null; loading: boolean; error: string; onLoad: () => void }) {
  const gallery = useMemo(() => preview ? selectMnistGallery(preview, 3) : [], [preview])
  const maximum = Math.max(1, ...(preview?.distribution ?? [1]))
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-2"><Database size={19} /><h2 className="text-lg font-semibold">MNIST</h2></div>
        <p className="mt-2 text-sm text-[var(--muted)]">Dígitos manuscritos del 0 al 9, imágenes de 28 × 28 en escala de grises.</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {[
            ['Entrenamiento', '60 000'], ['Prueba', '10 000'],
            ['Clases', '10'], ['Dimensiones', '28 × 28 × 1'],
          ].map(([label, value]) => <div key={label} className="rounded-lg bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}
        </dl>
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">Fuente: MNIST original, espejo de CVDF. La vista previa carga hasta 240 ejemplos reales del conjunto de entrenamiento. Los 60 000 ejemplos no se descargan en CNN-1.</p>
        <Button className="mt-5 w-full" type="button" onClick={onLoad} disabled={loading}>
          {preview ? <RefreshCcw size={17} /> : <ImageIcon size={17} />}{preview ? 'Recargar vista previa' : 'Cargar muestras reales'}
        </Button>
        {loading && <Spinner className="mt-4" size="sm" label="Descargando y decodificando muestras MNIST…" />}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      </Surface>
      <Surface className="min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Imágenes de ejemplo</h2>
          <span className="text-xs text-[var(--muted)]">{preview ? `${preview.inspected} registros inspeccionados` : 'Pendiente de cargar'}</span>
        </div>
        {preview ? <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-6 lg:grid-cols-10" aria-label="Galería de dígitos reales">
          {gallery.map((sample) => <DigitPreview key={sample.index} sample={sample} />)}
        </div> : <div className="mt-4 flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-[var(--line)] p-6 text-center">
          <ImageIcon size={31} className="text-[var(--muted)]" />
          <p className="mt-3 text-sm font-medium">Sin imágenes cargadas</p>
          <p className="mt-1 max-w-sm text-xs text-[var(--muted)]">Pulsa «Cargar muestras reales» para ver imágenes auténticas de MNIST, no ejemplos generados.</p>
        </div>}
      </Surface>
    </div>
    {preview && <Surface className="p-5 sm:p-6">
      <h2 className="text-lg font-semibold">Distribución de la muestra cargada</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">Frecuencia entre los {preview.inspected} ejemplos descargados. No representa la distribución completa de MNIST.</p>
      <div className="mt-5 grid grid-cols-5 gap-3 sm:grid-cols-10">
        {preview.distribution.map((count, digit) => <div key={digit} className="flex flex-col items-center gap-2">
          <div className="flex h-24 w-full items-end justify-center rounded-lg bg-[var(--surface-muted)] p-2">
            <div className="w-full max-w-8 rounded-t-md bg-[var(--chart-train)] transition-[height]" style={{ height: `${Math.round(count / maximum * 100)}%` }} title={`${count} imágenes`} />
          </div>
          <span className="text-xs font-semibold tabular-nums">{digit}</span>
          <span className="text-xs tabular-nums text-[var(--muted)]">{count}</span>
        </div>)}
      </div>
    </Surface>}
  </div>
}

function CnnArchitectureView({ config, setConfig, canConfigure }: { config: CnnConfig; setConfig: (value: CnnConfig) => void; canConfigure: boolean }) {
  const diagram = useMemo(() => describeCnn(config), [config])
  const updateBlock = (index: number, change: Partial<CnnBlockConfig>) => {
    setConfig({ ...config, blocks: config.blocks.map((item, i) => i === index ? { ...item, ...change } : item) })
  }
  return <div className="space-y-5">
    <CnnDiagramView diagram={diagram} />
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      <Surface className="p-5 sm:p-6">
        <div className="flex items-center gap-2"><SlidersHorizontal size={18} /><h2 className="text-lg font-semibold">Constructor CNN</h2></div>
        <p className="mt-2 text-xs text-[var(--muted)]">El esquema se actualiza al modificar los bloques. En CNN-1 la configuración es local y no se guarda en Supabase.</p>
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
        {!canConfigure && <div className="mt-4"><Notice>El rol Ingeniero en un proyecto activo es el que configura arquitecturas. Esta vista es de consulta para tu rol actual.</Notice></div>}
      </Surface>
      <div className="space-y-4">
        <Surface className="p-5 sm:p-6">
          <div className="flex items-center gap-2"><Layers3 size={18} /><h2 className="text-lg font-semibold">Resumen técnico</h2></div>
          <dl className="mt-5 space-y-4 text-sm">
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Entrada</dt><dd>28 × 28 × 1</dd></div>
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Bloques CNN</dt><dd>{config.blocks.length}</dd></div>
            <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-3"><dt className="text-[var(--muted)]">Salida</dt><dd>10 clases · Softmax</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted)]">Parámetros entrenables</dt><dd className="font-semibold tabular-nums">{diagram.parameterCount.toLocaleString('es-PE')}</dd></div>
          </dl>
        </Surface>
        {diagram.errors.length ? <Notice tone="error">{diagram.errors.join(' ')}</Notice> : <Notice tone="success"><ShieldCheck className="mr-1 inline size-4" /> Dimensiones compatibles y parámetros calculados. Entrenamiento disponible en CNN-2.</Notice>}
        <Surface className="p-5 sm:p-6">
          <h3 className="text-base font-semibold">Estructura planeada</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Entrada → Convoluciones y pooling → Flatten → Dense (ReLU) → Salida multiclase (Softmax). Se añadirán dropout y opciones avanzadas cuando estén respaldadas por el motor de entrenamiento.</p>
        </Surface>
      </div>
    </div>
  </div>
}

function UpcomingPanel({ tab }: { tab: ViewId }) {
  const next = tab === 'entrenar' ? 'CNN-2' : 'CNN-3'
  const description = tab === 'entrenar'
    ? 'Entrenamiento real con TensorFlow.js, cancelación, métricas y progreso por época.'
    : tab === 'evaluar'
      ? 'Matriz de confusión, métricas por clase y ejemplos de errores sobre el conjunto de test.'
      : 'Predicción con imágenes de prueba y archivos cargados por el usuario.'
  return <Surface className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
    <Layers3 size={32} className="text-[var(--muted)]" />
    <h2 className="mt-4 text-xl font-semibold">Disponible en {next}</h2>
    <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">{description}</p>
    <p className="mt-3 text-xs text-[var(--muted)]">Esta vista todavía no ejecuta cálculos ni presenta resultados simulados.</p>
  </Surface>
}

/** Pantalla CNN-1: solo lectura de Supabase para resolver el rol; no hay escrituras. */
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
  const [preview, setPreview] = useState<MnistPreview | null>(null)
  const [loadingSamples, setLoadingSamples] = useState(false)
  const [sampleError, setSampleError] = useState('')
  const loadAbort = useRef<AbortController | null>(null)

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

  useEffect(() => () => loadAbort.current?.abort(), [])

  async function loadSamples() {
    loadAbort.current?.abort()
    const controller = new AbortController()
    loadAbort.current = controller
    setLoadingSamples(true)
    setSampleError('')
    try {
      const loaded = await loadMnistPreview(controller.signal)
      if (!controller.signal.aborted) setPreview(loaded)
    } catch (error) {
      if (!controller.signal.aborted) setSampleError(error instanceof Error ? error.message : 'Error descargando MNIST. Revisa conexión, CORS o navegador y vuelve a intentar.')
    } finally { if (!controller.signal.aborted) setLoadingSamples(false) }
  }

  if (checking) return <Surface className="p-8"><Spinner label="Comprobando proyecto y permisos…" centered /></Surface>
  if (projectError) return <Notice tone="error">{projectError} <Button type="button" variant="outline" className="ml-2" onClick={() => void loadProject()}>Reintentar</Button></Notice>
  if (!project || !membership) return <Notice tone="error">Proyecto no encontrado o sin membresía autorizada. El Administrador global no obtiene acceso técnico automáticamente.</Notice>

  const canConfigure = membership.role === 'engineer' && project.status === 'active'
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs text-[var(--muted)]"><Link className="underline-offset-4 hover:underline" to={`/proyectos/${projectId}`}>{project.name}</Link> <ArrowRight className="mx-1 inline size-3" /> CNN</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Red convolucional (CNN)</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Explora MNIST y construye visualmente una red para clasificar imágenes. Este primer incremento no entrena ni guarda modelos.</p>
      </div>
      <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold">MNIST · CNN-1</span>
    </header>
    <Tabs label="Secciones del módulo CNN" idPrefix="cnn" items={TABS} value={tab} onChange={(next) => setTab(next as ViewId)} />
    <div id={`cnn-panel-${tab}`} role="tabpanel" aria-labelledby={`cnn-tab-${tab}`} tabIndex={0} className="min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--focus)]">
      {tab === 'datos' && <CnnDataView preview={preview} loading={loadingSamples} error={sampleError} onLoad={() => void loadSamples()} />}
      {tab === 'arquitectura' && <CnnArchitectureView config={config} setConfig={setConfig} canConfigure={canConfigure} />}
      {tab !== 'datos' && tab !== 'arquitectura' && <UpcomingPanel tab={tab} />}
    </div>
  </div>
}
