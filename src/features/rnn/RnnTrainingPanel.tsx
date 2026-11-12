/** Panel RNN-2 compartiendo controles, estados y tokens visuales de NeuroLab. */
import { Activity, Ban, Play } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { RnnMetricsChart } from './RnnMetricsChart'
import type { RnnEpochMetrics, RnnTrainOptions } from '../../ml/rnn/trainingTypes.ts'

export interface RnnTrainingDisplay {
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'error'
  message: string
  backend: string
  context: string
  progress: number
  trainingCount: number
  validationCount: number
  testCount: number
  epochs: RnnEpochMetrics[]
  durationMs?: number
}
export const EMPTY_RNN_TRAINING: RnnTrainingDisplay = {
  phase: 'idle', message: '', backend: '', context: '', progress: 0,
  trainingCount: 0, validationCount: 0, testCount: 0, epochs: [],
}

export function RnnTrainingPanel({ settings, onSettings, display, canTrain, canEdit, regression, onStart, onCancel, hasDataset, locked = false }: {
  settings: RnnTrainOptions
  onSettings: (value: RnnTrainOptions) => void
  display: RnnTrainingDisplay
  canTrain: boolean
  canEdit: boolean
  regression: boolean
  onStart: () => void
  onCancel: () => void
  hasDataset: boolean
  locked?: boolean
}) {
  const trainingBusy = ['starting', 'running', 'stopping'].includes(display.phase)
  const busy = locked || trainingBusy
  const latest = display.epochs.at(-1)
  const value = (n: number | undefined, percent = false) => n === undefined ? '—' : percent ? `${(n * 100).toFixed(1)} %` : n.toFixed(4)
  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
      <Surface className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Play size={19} /> Entrenamiento RNN real</h2>
        <p className="text-sm leading-6 text-[var(--muted)]">Ventanas cronológicas por serie, sin ajustar con datos de validación o prueba. Motor TensorFlow.js local; CPU en Worker cuando está disponible.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField id="rnn-epochs" label="Épocas" value={String(settings.epochs)} disabled={busy || !canEdit} options={[2, 5, 10].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => onSettings({ ...settings, epochs: Number(event.target.value) as RnnTrainOptions['epochs'] })} />
          <SelectField id="rnn-batch" label="Batch size" value={String(settings.batchSize)} disabled={busy || !canEdit} options={[8, 16, 32].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => onSettings({ ...settings, batchSize: Number(event.target.value) as RnnTrainOptions['batchSize'] })} />
          <SelectField id="rnn-learning-rate" label="Learning rate" value={String(settings.learningRate)} disabled={busy || !canEdit} options={[0.001, 0.0005].map((n) => ({ value: String(n), label: String(n) }))} onChange={(event) => onSettings({ ...settings, learningRate: Number(event.target.value) as RnnTrainOptions['learningRate'] })} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onStart} disabled={!canTrain || busy}><Play size={16} /> Entrenar RNN</Button>
          {['starting', 'running', 'stopping'].includes(display.phase) && <Button type="button" variant="outline" onClick={onCancel} disabled={display.phase === 'stopping'}><Ban size={16} /> {display.phase === 'stopping' ? 'Deteniendo…' : 'Cancelar'}</Button>}
        </div>
        {!hasDataset && <Notice>Importa el CSV y valida las secuencias desde Datos antes de entrenar.</Notice>}
        {!canEdit && <Notice>Solo un Ingeniero miembro de un proyecto activo puede entrenar.</Notice>}
        {hasDataset && !canTrain && canEdit && <Notice tone="error">La arquitectura debe ser válida y no puede modificarse durante el entrenamiento.</Notice>}
        <p className="text-xs leading-5 text-[var(--muted)]">RNN-4B registra métricas agregadas y metadatos mediante RPC. El test no participa en fit(); se evalúa únicamente al finalizar el entrenamiento. Para regresión, MSE y MAE usan el objetivo normalizado con estadísticas de train.</p>
      </Surface>
      <Surface className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19} /> Progreso y métricas reales</h2>
        <div className="flex items-center gap-2 text-sm" aria-live="polite">{trainingBusy && <Spinner size="sm" label="Entrenamiento RNN activo" />}{display.phase === 'idle' ? 'Sin entrenamiento iniciado' : display.message}</div>
        <div role="progressbar" aria-label="Progreso RNN" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(display.progress * 100)} className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div style={{ width: `${Math.round(display.progress * 100)}%` }} className="h-full bg-[var(--chart-train)] transition-[width]" />
        </div>
        <p className="text-xs text-[var(--muted)]">{Math.round(display.progress * 100)} % · {display.epochs.length} / {settings.epochs} épocas</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            { label: 'Loss', v: latest?.loss }, { label: regression ? 'MAE' : 'Accuracy', v: latest?.metric, p: !regression },
            { label: 'Val. loss', v: latest?.validationLoss }, { label: regression ? 'Val. MAE' : 'Val. accuracy', v: latest?.validationMetric, p: !regression },
          ].map(({ label, v, p }) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-2 font-semibold tabular-nums">{value(v, p)}</dd></div>)}
        </dl>
        <dl className="space-y-2 text-xs text-[var(--muted)]">
          <div className="flex justify-between"><dt>Backend / ejecución</dt><dd>{display.backend ? `${display.backend} / ${display.context}` : 'Pendiente'}</dd></div>
          <div className="flex justify-between"><dt>Train / Validación / Test reservados</dt><dd>{display.trainingCount ? `${display.trainingCount} / ${display.validationCount} / ${display.testCount}` : '—'}</dd></div>
          {display.durationMs !== undefined && <div className="flex justify-between"><dt>Duración</dt><dd>{(display.durationMs / 1000).toFixed(1)} s</dd></div>}
        </dl>
        {display.phase === 'error' && <Notice tone="error">{display.message}</Notice>}
        {display.phase === 'cancelled' && <Notice>Cancelación confirmada. Los tensores y el modelo se liberaron.</Notice>}
        {display.phase === 'completed' && <Notice>Entrenamiento completado localmente. Comprueba debajo la confirmación de Supabase antes de predecir.</Notice>}
      </Surface>
    </div>
    {display.epochs.length > 0 && <Surface className="p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Curvas por época</h2><RnnMetricsChart epochs={display.epochs} regression={regression} /></Surface>}
  </div>
}
