/** Configuración y monitor de ejecución local CNN; no simula resultados. */
import { Activity, Ban, Play, Timer, Cpu } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import { Spinner } from '../../components/ui/Spinner'
import { CnnMetricsChart } from './CnnMetricsChart'
import type { CnnEpochMetrics, CnnTrainOptions } from '../../ml/cnn/trainingTypes.ts'

export interface CnnTrainingDisplay {
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'error'
  message: string
  backend: string
  trainingCount: number
  validationCount: number
  testCount: number
  progress: number
  epochs: CnnEpochMetrics[]
  durationMs?: number
}

export const EMPTY_CNN_TRAINING: CnnTrainingDisplay = {
  phase: 'idle', message: '', backend: '', trainingCount: 0, validationCount: 0, testCount: 0, progress: 0, epochs: [],
}

export interface CnnSaveDisplay {
  runId: string
  savedEpochs: number
  evaluationSaved: boolean
  state: 'idle' | 'pending' | 'confirmed' | 'error'
  error: string
}

export function CnnTrainingPanel({ options, setOptions, display, save, canTrain, architectureValid, datasetCount, datasetName, onStart, onCancel, publishing = false }: {
  options: CnnTrainOptions
  setOptions: (value: CnnTrainOptions) => void
  display: CnnTrainingDisplay
  save: CnnSaveDisplay
  canTrain: boolean
  architectureValid: boolean
  datasetCount: number
  datasetName: string | null
  onStart: () => void
  onCancel: () => void
  publishing?: boolean
}) {
  const running = ['starting', 'running', 'stopping'].includes(display.phase)
  const busy = running || save.state === 'pending' || publishing
  const canStart = canTrain && architectureValid && datasetCount >= 100 && options.samples <= datasetCount && !busy
  const sampleOptions = [...new Set([Math.min(200, datasetCount), Math.min(500, datasetCount), Math.min(1000, datasetCount), Math.min(2000, datasetCount)])].filter((n) => n >= 100).sort((a,b) => a-b)
  const latest = display.epochs.at(-1)
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-[.75fr_1.25fr]">
      <Surface className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Cpu size={20} /> Entrenamiento con imágenes locales</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted)]">CNN real sobre el CSV cargado. Píxeles normalizados a [0, 1]; partición estratificada de entrenamiento/validación/test, semilla 42.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <SelectField label="Muestras del CSV" id="cnn-train-samples" value={String(options.samples)} disabled={busy || !canTrain || !datasetCount} options={sampleOptions.map((value) => ({ value: String(value), label: `${value} imágenes` }))} onChange={(event) => setOptions({ ...options, samples: Number(event.target.value) as CnnTrainOptions['samples'] })} />
          <SelectField label="Épocas" id="cnn-train-epochs" value={String(options.epochs)} disabled={busy || !canTrain} options={[2,5,10].map((value) => ({ value: String(value), label: String(value) }))} onChange={(event) => setOptions({ ...options, epochs: Number(event.target.value) as CnnTrainOptions['epochs'] })} />
          <SelectField label="Tamaño del lote" id="cnn-train-batch" value={String(options.batchSize)} disabled={busy || !canTrain} options={[16,32,64].map((value) => ({ value: String(value), label: String(value) }))} onChange={(event) => setOptions({ ...options, batchSize: Number(event.target.value) as CnnTrainOptions['batchSize'] })} />
          <SelectField label="Learning rate" id="cnn-train-rate" value={String(options.learningRate)} disabled={busy || !canTrain} options={[{ value:'0.001', label:'0.001' },{ value:'0.0005', label:'0.0005' }]} onChange={(event) => setOptions({ ...options, learningRate: Number(event.target.value) as CnnTrainOptions['learningRate'] })} />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" onClick={onStart} disabled={!canStart}><Play size={16} /> Entrenar CNN</Button>
          {running && <Button type="button" variant="outline" onClick={onCancel}><Ban size={16} /> Cancelar</Button>}
        </div>
        {!datasetCount && <div className="mt-4"><Notice>Primero selecciona un CSV en la pestaña Datos. No se descargan datasets automáticamente.</Notice></div>}
        {datasetName && <p className="mt-3 text-xs text-[var(--muted)]">Dataset de esta sesión: {datasetName} · {datasetCount} imágenes</p>}
        {!canTrain && <div className="mt-4"><Notice>Solo un Ingeniero integrante de un proyecto activo puede iniciar un entrenamiento CNN.</Notice></div>}
        {!architectureValid && <div className="mt-4"><Notice tone="error">Corrige la arquitectura en la pestaña Arquitectura antes de entrenar.</Notice></div>}
        <p className="mt-4 text-xs leading-5 text-[var(--muted)]">CNN-4B guarda configuración, métricas y evaluación agregada. CNN-4C permite publicar pesos en Storage privado tras confirmar la ejecución. El CSV sigue siendo local.</p>
      </Surface>
      <Surface className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={20} /> Monitor en tiempo real</h2>
        <div className="mt-5 flex items-center gap-2 text-sm">
          {running && <Spinner size="sm" label="CNN entrenando" />}
          {display.phase === 'idle' ? <span className="text-[var(--muted)]">Listo para iniciar</span> : <span className="font-medium">{display.phase === 'completed' ? 'Entrenamiento local completado' : display.phase === 'cancelled' ? 'Entrenamiento cancelado' : display.phase === 'error' ? 'Error de entrenamiento' : display.message}</span>}
        </div>
        <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]" role="progressbar" aria-label="Progreso del entrenamiento" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(display.progress * 100)}>
          <div className="h-full rounded-full bg-[var(--chart-train)] transition-[width]" style={{ width: `${Math.round(display.progress * 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between gap-2 text-xs text-[var(--muted)]"><span>{Math.round(display.progress * 100)} %</span><span>Épocas completadas: {display.epochs.length} / {options.epochs}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Loss', value: latest?.loss },
            { label: 'Accuracy', value: latest?.accuracy, percent: true },
            { label: 'Val. loss', value: latest?.validationLoss },
            { label: 'Val. accuracy', value: latest?.validationAccuracy, percent: true },
          ].map(({label, value, percent}) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{value === undefined ? '—' : percent ? `${(value * 100).toFixed(1)} %` : value.toFixed(4)}</p></div>)}
        </div>
        <dl className="mt-5 space-y-2 text-xs text-[var(--muted)]">
          <div className="flex justify-between gap-2"><dt>Motor</dt><dd className="font-semibold text-[var(--ink)]">{display.backend || 'Pendiente'}</dd></div>
          <div className="flex justify-between gap-2"><dt>Train / Validación / Test</dt><dd>{display.trainingCount ? `${display.trainingCount} / ${display.validationCount} / ${display.testCount}` : '—'}</dd></div>
          <div className="flex justify-between gap-2"><dt><Timer size={14} className="mr-1 inline"/> Tiempo total</dt><dd>{display.durationMs === undefined ? '—' : `${(display.durationMs / 1000).toFixed(1)} s`}</dd></div>
        </dl>
        {display.phase === 'error' && <div className="mt-4"><Notice tone="error">{display.message}</Notice></div>}
        {display.phase === 'cancelled' && <div className="mt-4"><Notice>Cancelación confirmada; el modelo temporal se ha liberado.</Notice></div>}
        {save.runId && <div className="mt-5 rounded-xl border border-[var(--line)] p-3 text-sm" aria-live="polite">
          <p className="font-semibold">Registro en Supabase</p>
          <p className="mt-1 break-all text-xs text-[var(--muted)]">Ejecución: {save.runId}</p>
          <p className="mt-1 text-xs">Épocas confirmadas: {save.savedEpochs} / {options.epochs}</p>
          <p className="mt-1 text-xs">Evaluación confirmada: {save.evaluationSaved ? 'Sí' : 'No'}</p>
          <p className="mt-1 text-xs">Estado: {save.state === 'pending' ? 'Guardando / esperando confirmación…' : save.state === 'confirmed' ? 'Estado terminal confirmado' : save.state === 'error' ? 'Guardado parcial o fallido' : 'Pendiente'}</p>
        </div>}
        {save.state === 'error' && <div className="mt-4"><Notice tone="error">No se confirmó todo el historial. {save.error} Consulta el estado en Supabase antes de reintentar; no se duplicará automáticamente.</Notice></div>}
        {display.phase === 'completed' && <div className="mt-4"><Notice tone={save.state === 'confirmed' ? 'success' : undefined}>Se completaron {display.epochs.length} épocas reales. Puedes abrir Evaluar o Predecir. Si el estado final está confirmado, podrás guardar una versión privada del modelo debajo del monitor.</Notice></div>}
      </Surface>
    </div>
    {display.epochs.length > 0 && <Surface className="p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Métricas por época</h2><CnnMetricsChart epochs={display.epochs}/></Surface>}
  </div>
}
