/** Panel GAN-2: controles compartidos, progreso accesible y métricas adversariales reales. */
import { Activity, Ban, Play } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { GanMetricsChart } from './GanMetricsChart'
import { GAN_ALLOWED_EPOCHS, type GanEpochMetrics, type GanTrainOptions } from '../../ml/gan/trainingTypes.ts'

export interface GanTrainingDisplay {
  phase: 'idle' | 'starting' | 'running' | 'stopping' | 'completed' | 'cancelled' | 'error'
  message: string
  backend: string
  context: string
  progress: number
  images: number
  epochs: GanEpochMetrics[]
  durationMs?: number
}

export const EMPTY_GAN_TRAINING: GanTrainingDisplay = {
  phase: 'idle', message: '', backend: '', context: '', progress: 0, images: 0, epochs: [],
}

export function GanTrainingPanel({ settings, onSettings, display, canEdit, hasDataset, canTrain, onStart, onCancel, persistenceLocked = false }: {
  settings: GanTrainOptions
  onSettings: (value: GanTrainOptions) => void
  display: GanTrainingDisplay
  canEdit: boolean
  hasDataset: boolean
  canTrain: boolean
  onStart: () => void
  onCancel: () => void
  persistenceLocked?: boolean
}) {
  const busy = ['starting', 'running', 'stopping'].includes(display.phase)
  const latest = display.epochs.at(-1)
  const formatted = (value: number | undefined) => value === undefined ? '—' : value.toFixed(4)
  return <div className="space-y-5">
    <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]">
      <Surface className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Play size={19}/> Entrenamiento GAN real</h2>
        <p className="text-sm leading-6 text-[var(--muted)]">Entrenamiento adversarial alternado en TensorFlow.js: primero D(real/falso), después G. Dos optimizadores Adam independientes, normalización [-1, 1] y CPU local.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectField id="gan-epochs" label="Épocas" disabled={busy || persistenceLocked || !canEdit} value={String(settings.epochs)} options={GAN_ALLOWED_EPOCHS.map((v) => ({ value: String(v), label: String(v) }))} onChange={(event) => onSettings({ ...settings, epochs: Number(event.target.value) as GanTrainOptions['epochs'] })}/>
          <SelectField id="gan-batch" label="Batch" disabled={busy || persistenceLocked || !canEdit} value={String(settings.batchSize)} options={[16, 32, 64].map((v) => ({ value: String(v), label: String(v) }))} onChange={(event) => onSettings({ ...settings, batchSize: Number(event.target.value) as GanTrainOptions['batchSize'] })}/>
          <SelectField id="gan-learning-rate" label="Learning rate" disabled={busy || persistenceLocked || !canEdit} value={String(settings.learningRate)} options={[0.0002, 0.0001].map((v) => ({ value: String(v), label: String(v) }))} onChange={(event) => onSettings({ ...settings, learningRate: Number(event.target.value) as GanTrainOptions['learningRate'] })}/>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!canEdit || !canTrain || busy} onClick={onStart}><Play size={16}/> Entrenar GAN</Button>
          {busy && <Button type="button" variant="outline" disabled={display.phase === 'stopping'} onClick={onCancel}><Ban size={16}/> {display.phase === 'stopping' ? 'Deteniendo…' : 'Cancelar'}</Button>}
        </div>
        {!hasDataset && <Notice>Importa al menos 100 imágenes en Datos para habilitar el entrenamiento.</Notice>}
        {!canEdit && <Notice>Solo el Ingeniero miembro de un proyecto activo puede entrenar.</Notice>}
        <p className="text-xs leading-5 text-[var(--muted)]">Las pérdidas G/D y las probabilidades estimadas por D son diagnósticos de entrenamiento, no métricas de calidad generativa. Con datasets reales, comienza con 20–30 épocas y aumenta si las imágenes aún no muestran patrones. Entrenar durante más épocas puede tardar más y no garantiza calidad visual.</p>
      </Surface>
      <Surface className="space-y-4 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19}/> Progreso y métricas adversariales</h2>
        <div className="flex items-center gap-2 text-sm" aria-live="polite">{busy && <Spinner size="sm" label="Entrenamiento GAN activo"/>}{display.phase === 'idle' ? 'Sin entrenamiento iniciado' : display.message}</div>
        <div role="progressbar" aria-label="Progreso GAN" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(display.progress * 100)} className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-muted)]">
          <div className="h-full bg-[var(--chart-train)] transition-[width]" style={{ width: `${Math.round(display.progress * 100)}%` }}/>
        </div>
        <p className="text-xs text-[var(--muted)]">{Math.round(display.progress * 100)} % · {display.epochs.length} / {settings.epochs} épocas completadas</p>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {[
            ['Loss G', latest?.generatorLoss], ['Loss D', latest?.discriminatorLoss],
            ['D(real)', latest?.realScore], ['D(falso)', latest?.fakeScore],
          ].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-[var(--surface-muted)] p-3">
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd className="mt-2 font-semibold tabular-nums">{formatted(typeof value === 'number' ? value : undefined)}</dd>
          </div>)}
        </dl>
        <dl className="space-y-2 text-xs text-[var(--muted)]">
          <div className="flex justify-between"><dt>Backend / ejecución</dt><dd>{display.backend ? `${display.backend} / ${display.context}` : 'Pendiente'}</dd></div>
          <div className="flex justify-between"><dt>Imágenes reales</dt><dd>{display.images || '—'}</dd></div>
          {display.durationMs !== undefined && <div className="flex justify-between"><dt>Duración</dt><dd>{(display.durationMs / 1000).toFixed(1)} s</dd></div>}
        </dl>
        {display.phase === 'error' && <Notice tone="error">{display.message}</Notice>}
        {display.phase === 'cancelled' && <Notice>Cancelación confirmada. Se liberaron los tensores y las redes.</Notice>}
        {display.phase === 'completed' && <Notice tone="success">Entrenamiento completado. Abre Generar para producir imágenes nuevas con los pesos de G de esta sesión.</Notice>}
      </Surface>
    </div>
    {display.epochs.length > 0 && <Surface className="p-4 sm:p-6"><h2 className="mb-4 text-lg font-semibold">Curvas de entrenamiento G/D</h2><GanMetricsChart epochs={display.epochs}/></Surface>}
  </div>
}
