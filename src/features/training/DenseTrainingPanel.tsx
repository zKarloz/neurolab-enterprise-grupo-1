import { useEffect, useMemo, useRef, useState } from 'react'
import { Cpu, Layers3, Plus, Square, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import { supabase } from '../../lib/supabase'
import { DEFAULT_DENSE_CONFIG, validateDenseConfig } from '../../ml/networks/config.ts'
import type { DenseTrainConfig, HiddenActivation } from '../../ml/networks/config.ts'
import type { PreparedDataset } from '../../ml/preprocessing/types.ts'
import type { LocalCsvMetadata } from '../../ml/preprocessing/fileMetadata.ts'
import { startBrowserTraining } from '../../ml/training/browserSession.ts'
import type { TrainingSession } from '../../ml/training/browserSession.ts'
import type { EpochMetrics, TrainingEvent, TrainingSummary } from '../../ml/training/types.ts'
import type { TestEvaluation } from '../../ml/evaluation/metrics.ts'
import { persistTestEvaluation } from '../../services/evaluationPersistence.ts'
import { TestEvaluationCard } from '../evaluation/TestEvaluationCard.tsx'
import { getProject } from '../../services/projects'
import { createPersistedRun, finalizeRun, recordBackend, recordEpoch } from '../../services/trainingPersistence.ts'
import type { FinalRunStatus } from '../../services/trainingPersistence.ts'
import { TrainingMetricsChart } from './TrainingMetricsChart.tsx'

interface DenseTrainingPanelProps {
  dataset: PreparedDataset
  source: LocalCsvMetadata
  projectId: string
  userId: string
  onPersisted: () => void
}

interface RunPersistenceStream {
  id: string
  chain: Promise<void>
  failed: boolean
  terminalQueued: boolean
}
type RunStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'failed'
const ACTIVATIONS = [
  { value: 'relu', label: 'ReLU' },
  { value: 'tanh', label: 'Tanh' },
  { value: 'sigmoid', label: 'Sigmoide' },
] as const

function showMetric(value: number | null): string {
  return value === null ? 'No disponible' : Number(value.toFixed(6)).toLocaleString('es-PE', { maximumFractionDigits: 6 })
}

/** Vista de F3 con gráfica incremental solicitada: nunca usa métricas ficticias. */
export function DenseTrainingPanel({ dataset, source, projectId, userId, onPersisted }: DenseTrainingPanelProps) {
  const [config, setConfig] = useState<DenseTrainConfig>(() => ({ ...DEFAULT_DENSE_CONFIG, hiddenLayers: [...DEFAULT_DENSE_CONFIG.hiddenLayers] }))
  const [status, setStatus] = useState<RunStatus>('idle')
  const [error, setError] = useState('')
  const [backend, setBackend] = useState('')
  const [epochs, setEpochs] = useState<EpochMetrics[]>([])
  const [summary, setSummary] = useState<TrainingSummary | null>(null)
  const [evaluation, setEvaluation] = useState<TestEvaluation | null>(null)
  const [evaluationConfirmed, setEvaluationConfirmed] = useState(false)
  const [savedEpochs, setSavedEpochs] = useState(0)
  const [runId, setRunId] = useState('')
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'confirmed' | 'error'>('idle')
  const [syncError, setSyncError] = useState('')
  const session = useRef<TrainingSession | null>(null)
  const persistence = useRef<RunPersistenceStream | null>(null)
  const cancelledBeforeStart = useRef(false)
  const trainingActive = ['starting', 'running', 'stopping'].includes(status)
  const active = trainingActive || (syncState === 'pending' && ['completed', 'cancelled', 'failed'].includes(status))
  const features = dataset.manifest.featureNames.length

  const configurationCheck = useMemo(() => {
    try { return { valid: validateDenseConfig(config, features, dataset.train.x.length, dataset.manifest.problemType), error: '' } }
    catch (cause) { return { valid: null, error: cause instanceof Error ? cause.message : 'Configuración inválida.' } }
  }, [config, dataset, features])

  /** Las RPC se encadenan para conservar orden y confirmar cada época antes de finalizar. */
  function queuePersist(stream: RunPersistenceStream, operation: () => Promise<void>) {
    stream.chain = stream.chain.then(async () => {
      if (!stream.failed) await operation()
    }).catch((cause: unknown) => {
      stream.failed = true
      if (persistence.current === stream) {
        setSyncState('error')
        setSyncError(cause instanceof Error ? cause.message : 'Falló la confirmación en Supabase.')
        onPersisted() // Permite volver a consultar el último progreso realmente confirmado.
        // Sin persistencia íntegra no conviene seguir generando épocas sin trazabilidad.
        session.current?.cancel()
      }
    })
  }

  function queueFinish(stream: RunPersistenceStream, finalStatus: FinalRunStatus, finalSummary?: TrainingSummary, message?: string) {
    if (stream.terminalQueued) return
    stream.terminalQueued = true
    queuePersist(stream, async () => {
      await finalizeRun(stream.id, finalStatus, finalSummary, message)
      if (persistence.current === stream) {
        setSyncState('confirmed')
        onPersisted()
      }
    })
  }

  // Al abandonar esta ruta, el entrenamiento local se detiene y se intenta registrar interrupción.
  // El navegador cerrado abruptamente puede impedir la última escritura: no se promete recuperación automática.
  useEffect(() => () => {
    cancelledBeforeStart.current = true
    session.current?.dispose()
    const stream = persistence.current
    if (stream && !stream.terminalQueued) queueFinish(stream, 'interrupted')
  }, [])

  function changeLayer(index: number, change: Partial<DenseTrainConfig['hiddenLayers'][number]>) {
    setConfig((previous) => ({ ...previous, hiddenLayers: previous.hiddenLayers.map((layer, i) => i === index ? { ...layer, ...change } : layer) }))
  }

  function onTrainingEvent(event: TrainingEvent, stream: RunPersistenceStream) {
    if (persistence.current !== stream) return
    switch (event.type) {
      case 'initializing':
        setStatus('starting')
        setBackend(`Inicializando en ${event.context === 'worker' ? 'Web Worker' : 'hilo principal'}…`)
        break
      case 'backend':
        setStatus((previous) => previous === 'stopping' ? previous : 'running')
        setBackend(`${event.backend.toUpperCase()} · ${event.context === 'worker' ? 'Web Worker' : 'hilo principal'} · TF.js ${event.tfjsVersion}`)
        queuePersist(stream, () => recordBackend(stream.id, event.backend, event.context, event.tfjsVersion))
        break
      case 'epoch':
        setEpochs((previous) => [...previous, event.metrics])
        queuePersist(stream, async () => {
          await recordEpoch(stream.id, event.metrics)
          if (persistence.current === stream) setSavedEpochs(event.metrics.epoch)
        })
        break
      case 'evaluation':
        setEvaluation(event.evaluation)
        queuePersist(stream, async () => {
          await persistTestEvaluation(stream.id, event.evaluation)
          if (persistence.current === stream) setEvaluationConfirmed(true)
        })
        break
      case 'completed':
        setSummary(event.summary)
        setStatus('completed')
        queueFinish(stream, 'completed', event.summary)
        break
      case 'cancelled':
        setStatus('cancelled')
        queueFinish(stream, 'cancelled')
        break
      case 'error':
        setError(event.message)
        setStatus('failed')
        queueFinish(stream, 'failed', undefined, event.message)
        break
    }
  }

  async function start() {
    if (active || !configurationCheck.valid) return
    setError('')
    setBackend('')
    setEpochs([])
    setSummary(null)
    setEvaluation(null)
    setEvaluationConfirmed(false)
    setSavedEpochs(0)
    setRunId('')
    setSyncError('')
    setSyncState('idle')
    setStatus('starting')
    cancelledBeforeStart.current = false
    let stream: RunPersistenceStream | null = null
    try {
      // La UI verifica permisos para dar feedback; el límite de seguridad real es la RPC + RLS.
      if (!supabase) throw new Error('Supabase no está configurado.')
      const [project, membership] = await Promise.all([
        getProject(projectId),
        supabase.from('project_members').select('role').eq('project_id', projectId).eq('user_id', userId).maybeSingle(),
      ])
      if (membership.error) throw membership.error
      if (!project || project.status !== 'active' || membership.data?.role !== 'engineer') {
        throw new Error('Ya no tienes permiso de Ingeniero en este proyecto activo.')
      }
      if (cancelledBeforeStart.current) { setStatus('cancelled'); return }

      // Crear run + instantáneas antes de iniciar TensorFlow.js. No se envía ninguna fila del CSV.
      const id = await createPersistedRun(projectId, source, dataset, config)
      stream = { id, chain: Promise.resolve(), failed: false, terminalQueued: false }
      persistence.current = stream
      setRunId(id)
      setSyncState('pending')
      onPersisted()
      if (cancelledBeforeStart.current) {
        setStatus('cancelled')
        queueFinish(stream, 'cancelled')
        return
      }
      session.current?.dispose()
      const currentStream = stream
      session.current = startBrowserTraining(dataset, config, (event) => onTrainingEvent(event, currentStream))
    } catch (cause) {
      setStatus('failed')
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el entrenamiento.')
      if (stream) queueFinish(stream, 'failed', undefined, 'Error al inicializar el entrenamiento local')
    }
  }

  function cancel() {
    if (!active || status === 'stopping') return
    cancelledBeforeStart.current = true
    session.current?.cancel()
    setStatus('stopping')
  }

  const latest = epochs.at(-1)
  const metricLabel = dataset.manifest.problemType === 'binary' ? 'Exactitud' : 'MAE'
  const progress = latest ? Math.round(latest.epoch / config.epochs * 100) : 0

  return (
    <Surface className="space-y-6 p-5 sm:p-7">
      <header className="space-y-2">
        <div className="flex items-center gap-2"><Layers3 size={21} aria-hidden="true" /><h2 className="text-lg font-semibold">Constructor Feedforward Dense</h2></div>
        <p className="text-sm leading-6 text-[var(--muted)]">Entrenamiento real en este dispositivo. El conjunto de prueba se evalúa una sola vez al terminar, sin modificar los pesos. Si sales de esta pantalla, se interrumpe el entrenamiento.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">Entradas</p><p className="mt-1 text-xl font-semibold">{features}</p></div>
        <div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">Salida</p><p className="mt-1 text-sm font-semibold">1 · {dataset.manifest.problemType === 'binary' ? 'Sigmoide' : 'Lineal'}</p></div>
        <div className="rounded-xl bg-[var(--surface-muted)] p-4"><p className="text-xs text-[var(--muted)]">Pérdida</p><p className="mt-1 text-sm font-semibold">{dataset.manifest.problemType === 'binary' ? 'Binary crossentropy' : 'MSE'}</p></div>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Capas ocultas (1–3)</h3><Button variant="outline" disabled={active || config.hiddenLayers.length >= 3} onClick={() => setConfig((prev) => ({ ...prev, hiddenLayers: [...prev.hiddenLayers, { units: 12, activation: 'relu' }] }))}><Plus size={16}/> Capa</Button></div>
        {config.hiddenLayers.map((layer, index) => (
          <div key={index} className="grid items-end gap-3 rounded-xl border border-[var(--line)] p-3 sm:grid-cols-[1fr_1fr_auto]">
            <InputField id={`layer-${index}-units`} label={`Capa ${index + 1} · Neuronas`} type="number" min={1} max={64} step={1} disabled={active} value={layer.units} onChange={(e) => changeLayer(index, { units: Number(e.target.value) })}/>
            <SelectField id={`layer-${index}-activation`} label="Activación" disabled={active} value={layer.activation} options={ACTIVATIONS} onChange={(e) => changeLayer(index, { activation: e.target.value as HiddenActivation })}/>
            <Button type="button" variant="ghost" aria-label={`Quitar capa ${index + 1}`} disabled={active || config.hiddenLayers.length === 1} onClick={() => setConfig((prev) => ({ ...prev, hiddenLayers: prev.hiddenLayers.filter((_, i) => i !== index) }))}><Trash2 size={17}/></Button>
          </div>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <InputField id="train-epochs" label="Épocas (1–50)" type="number" min={1} max={50} step={1} disabled={active} value={config.epochs} onChange={(e) => setConfig((prev) => ({ ...prev, epochs: Number(e.target.value) }))}/>
        <InputField id="train-batch" label="Batch size" type="number" min={1} max={Math.min(128, dataset.train.x.length)} step={1} disabled={active} value={config.batchSize} onChange={(e) => setConfig((prev) => ({ ...prev, batchSize: Number(e.target.value) }))}/>
        <InputField id="train-rate" label="Learning rate" type="number" min="0.00001" max="0.1" step="0.001" disabled={active} value={config.learningRate} onChange={(e) => setConfig((prev) => ({ ...prev, learningRate: Number(e.target.value) }))}/>
        <InputField id="train-seed" label="Semilla de inicialización" type="number" min={0} max={2147483647} step={1} disabled={active} value={config.seed} onChange={(e) => setConfig((prev) => ({ ...prev, seed: Number(e.target.value) }))}/>
      </div>
      {configurationCheck.valid ? <p className="text-xs text-[var(--muted)]">{configurationCheck.valid.parameters.toLocaleString('es-PE')} parámetros entrenables estimados · Optimizador Adam.</p> : <Notice tone="error">{configurationCheck.error}</Notice>}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={active || !configurationCheck.valid} onClick={() => void start()} busy={status === 'starting'}><Cpu size={17}/> {status === 'completed' || status === 'cancelled' || status === 'failed' ? 'Entrenar nuevamente' : 'Iniciar entrenamiento'}</Button>
        {trainingActive && <Button type="button" variant="outline" disabled={status === 'stopping'} onClick={cancel}><Square size={15}/> {status === 'stopping' ? 'Deteniendo…' : 'Solicitar cancelación'}</Button>}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {status !== 'idle' && <div className="space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><strong>{status === 'completed' ? 'Entrenamiento completado' : status === 'cancelled' ? 'Entrenamiento cancelado' : status === 'failed' ? 'Entrenamiento fallido' : status === 'stopping' ? 'Cancelación solicitada; esperando confirmación' : 'Entrenamiento en curso'}</strong><span>{latest?.epoch ?? 0} / {config.epochs} épocas</span></div>
        <div role="progressbar" aria-label="Progreso del entrenamiento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${progress}%` }}/></div>
        {backend && <p className="text-xs text-[var(--muted)]">Backend: {backend}</p>}
        {latest && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['Pérdida train', latest.loss], ['Pérdida validación', latest.validationLoss],
            [metricLabel + ' train', latest.metric], [metricLabel + ' validación', latest.validationMetric],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[var(--surface-muted)] p-3"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-1 font-semibold tabular-nums">{showMetric(value as number | null)}</p></div>)}
        </div>}
        {epochs.length > 0 && <TrainingMetricsChart epochs={epochs} problemType={dataset.manifest.problemType} />}
        {summary && <Notice tone="success">{summary.epochsCompleted} épocas reales · {summary.durationMs.toLocaleString('es-PE')} ms · {summary.parameters.toLocaleString('es-PE')} parámetros · {summary.backend.toUpperCase()}.</Notice>}
      </div>}
      {evaluation && <TestEvaluationCard evaluation={evaluation} confirmed={evaluationConfirmed} />}
      {runId && <div className="space-y-2 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4" aria-live="polite">
        <p className="text-sm font-semibold">Persistencia en Supabase</p>
        <p className="text-sm">{savedEpochs} / {config.epochs} épocas confirmadas · {syncState === 'confirmed' ? 'Estado final confirmado' : syncState === 'error' ? 'Guardado parcial o fallido' : 'Sincronizando escrituras'}</p>
        <p className="break-all text-xs text-[var(--muted)]">Ejecución: {runId}</p>
        {syncError && <Notice tone="error">{syncError} Las métricas locales pueden diferir de las confirmadas. No cierres la pestaña hasta revisar el problema.</Notice>}
      </div>}
      <Notice>El CSV permanece local y no se guardan pesos del modelo. Los datos de preparación, la configuración, el backend y cada época confirmada se conservan en Supabase. Si se pierde la red, solo cuentan como guardados los datos confirmados. La evaluación de prueba y el historial se incorporan progresivamente en la Fase 4; los pesos y predicción desde una versión recuperada quedan para Fase 5.</Notice>
    </Surface>
  )
}
