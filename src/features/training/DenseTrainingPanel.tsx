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
import { startBrowserTraining } from '../../ml/training/browserSession.ts'
import type { TrainingSession } from '../../ml/training/browserSession.ts'
import type { EpochMetrics, TrainingEvent, TrainingSummary } from '../../ml/training/types.ts'
import { getProject } from '../../services/projects'

interface DenseTrainingPanelProps { dataset: PreparedDataset; projectId: string; userId: string }
type RunStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'failed'
const ACTIVATIONS = [
  { value: 'relu', label: 'ReLU' },
  { value: 'tanh', label: 'Tanh' },
  { value: 'sigmoid', label: 'Sigmoide' },
] as const

function showMetric(value: number | null): string {
  return value === null ? 'No disponible' : Number(value.toFixed(6)).toLocaleString('es-PE', { maximumFractionDigits: 6 })
}

/** Diseño mínimo de F3: valores reales por época, sin gráficos ni historial ficticio. */
export function DenseTrainingPanel({ dataset, projectId, userId }: DenseTrainingPanelProps) {
  const [config, setConfig] = useState<DenseTrainConfig>(() => ({ ...DEFAULT_DENSE_CONFIG, hiddenLayers: [...DEFAULT_DENSE_CONFIG.hiddenLayers] }))
  const [status, setStatus] = useState<RunStatus>('idle')
  const [error, setError] = useState('')
  const [backend, setBackend] = useState('')
  const [epochs, setEpochs] = useState<EpochMetrics[]>([])
  const [summary, setSummary] = useState<TrainingSummary | null>(null)
  const session = useRef<TrainingSession | null>(null)
  const cancelledBeforeStart = useRef(false)
  const active = ['starting', 'running', 'stopping'].includes(status)
  const features = dataset.manifest.featureNames.length

  const configurationCheck = useMemo(() => {
    try { return { valid: validateDenseConfig(config, features, dataset.train.x.length, dataset.manifest.problemType), error: '' } }
    catch (cause) { return { valid: null, error: cause instanceof Error ? cause.message : 'Configuración inválida.' } }
  }, [config, dataset, features])

  // Al abandonar la ruta, el Worker se detiene. El fallback en hilo principal para en el siguiente callback.
  useEffect(() => () => session.current?.dispose(), [])

  function changeLayer(index: number, change: Partial<DenseTrainConfig['hiddenLayers'][number]>) {
    setConfig((previous) => ({ ...previous, hiddenLayers: previous.hiddenLayers.map((layer, i) => i === index ? { ...layer, ...change } : layer) }))
  }

  function onTrainingEvent(event: TrainingEvent) {
    switch (event.type) {
      case 'initializing':
        setStatus('starting')
        setBackend(`Inicializando en ${event.context === 'worker' ? 'Web Worker' : 'hilo principal'}…`)
        break
      case 'backend':
        setStatus((previous) => previous === 'stopping' ? previous : 'running')
        setBackend(`${event.backend.toUpperCase()} · ${event.context === 'worker' ? 'Web Worker' : 'hilo principal'} · TF.js ${event.tfjsVersion}`)
        break
      case 'epoch':
        setEpochs((previous) => [...previous, event.metrics])
        break
      case 'completed':
        setSummary(event.summary)
        setStatus('completed')
        break
      case 'cancelled':
        setStatus('cancelled')
        break
      case 'error':
        setError(event.message)
        setStatus('failed')
        break
    }
  }

  async function start() {
    if (active || !configurationCheck.valid) return
    setError('')
    setBackend('')
    setEpochs([])
    setSummary(null)
    setStatus('starting')
    cancelledBeforeStart.current = false
    try {
      // Volver a comprobar la membresía antes de iniciar; ninguna autorización depende del indicador visual.
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
      session.current?.dispose()
      session.current = startBrowserTraining(dataset, config, onTrainingEvent)
    } catch (cause) {
      setStatus('failed')
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el entrenamiento.')
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
        <p className="text-sm leading-6 text-[var(--muted)]">Entrenamiento real en este dispositivo. El conjunto de prueba se reserva para la Fase 4. Si sales de esta pantalla, se interrumpe el entrenamiento.</p>
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
        {active && <Button type="button" variant="outline" disabled={status === 'stopping'} onClick={cancel}><Square size={15}/> {status === 'stopping' ? 'Deteniendo…' : 'Solicitar cancelación'}</Button>}
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
        {epochs.length > 0 && <div className="text-xs text-[var(--muted)]">Épocas observadas: {epochs.length}. Métricas obtenidas de <code>onEpochEnd</code>, sin simulación.</div>}
        {summary && <Notice tone="success">{summary.epochsCompleted} épocas reales · {summary.durationMs.toLocaleString('es-PE')} ms · {summary.parameters.toLocaleString('es-PE')} parámetros · {summary.backend.toUpperCase()}.</Notice>}
      </div>}
      <Notice>En este incremento el modelo se libera al finalizar y los resultados permanecen en memoria. La persistencia de ejecuciones se incorporará en el siguiente incremento de Fase 3; las gráficas, evaluación de test e historial corresponden a Fase 4.</Notice>
    </Surface>
  )
}
