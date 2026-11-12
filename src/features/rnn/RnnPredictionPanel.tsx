/** Inferencia un paso adelante sobre la última ventana observada por serie. */
import { Activity } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import type { RnnInferenceResult } from '../../ml/rnn/inference.ts'

export function RnnPredictionPanel({ series, seriesId, onSeries, onPredict, predicting, result, error, ready }: {
  series: string[]
  seriesId: string
  onSeries: (value: string) => void
  onPredict: () => void
  predicting: boolean
  result: RnnInferenceResult | null
  error: string
  ready: boolean
}) {
  return <Surface className="space-y-5 p-5 sm:p-6">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19} /> Predicción temporal · siguiente observación</h2>
    <p className="text-sm text-[var(--muted)]">Utiliza las últimas observaciones ordenadas de la serie, exclusivamente sus variables de entrada. El objetivo no se usa para predecir. El escalado es el aprendido con train.</p>
    <SelectField label="Serie para inferencia" id="rnn-predict-series" options={series.map((id) => ({ value: id, label: id }))} value={seriesId} onChange={(event) => onSeries(event.target.value)} disabled={!ready || predicting} />
    <Button type="button" onClick={onPredict} disabled={!ready || !seriesId || predicting}><Activity size={16} /> Predecir siguiente paso</Button>
    {predicting && <Spinner label="Calculando predicción RNN…" />}
    {!ready && <Notice>Entrena y completa la evaluación de test primero. El modelo solo existe en esta sesión del navegador.</Notice>}
    {error && <Notice tone="error">{error}</Notice>}
    {result && <div className="space-y-3 rounded-xl bg-[var(--surface-muted)] p-4" aria-live="polite">
      <p className="text-xs text-[var(--muted)]">Serie {result.seriesId} · ventana temporal {result.fromTime} a {result.toTime}. Se estima el paso posterior; su marca temporal exacta no se infiere.</p>
      <p className="text-sm">Predicción: <strong className="text-lg tabular-nums">{typeof result.value === 'number' ? result.value.toFixed(4) : result.value}</strong></p>
      {result.probabilities && <div className="space-y-1">{result.probabilities.map(({ label, probability }) => <p key={label} className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{(probability * 100).toFixed(1)} %</span></p>)}</div>}
    </div>}
    <p className="text-xs text-[var(--muted)]">Predicción local exploratoria. No se almacenan ventanas, valores originales ni inferencias en Supabase. Cerrar o abandonar el módulo libera el modelo.</p>
  </Surface>
}
