/** RNN-4C: ventana temporal manual sobre una versión privada restaurada, sin importar CSV. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Activity } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { parseRnnManualWindow, type RnnPreprocessingManifest, type RnnRestoredPrediction } from '../../ml/rnn/modelPersistence.ts'

interface Props {
  manifest: RnnPreprocessingManifest
  predict: (window: number[][]) => Promise<RnnRestoredPrediction>
}

export function RnnRestoredPredictionCard({ manifest, predict }: Props) {
  const [values, setValues] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RnnRestoredPrediction | null>(null)
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1 }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const token = ++generation.current
    setBusy(true); setError(''); setResult(null)
    try {
      // Cada línea corresponde a un instante. Nunca se solicita la columna target.
      const window = parseRnnManualWindow(values, manifest)
      const prediction = await predict(window)
      if (token === generation.current) setResult(prediction)
    } catch (cause) {
      if (token === generation.current) setError(cause instanceof Error ? cause.message : 'No se pudo predecir con la RNN restaurada.')
    } finally { if (token === generation.current) setBusy(false) }
  }

  return <Surface className="space-y-5 p-5 sm:p-6">
    <h3 className="flex items-center gap-2 text-lg font-semibold"><Activity size={19}/> Predicción RNN · versión restaurada</h3>
    <p className="text-sm text-[var(--muted)]">Introduce una ventana nueva con <strong>{manifest.steps} filas</strong>, de más antigua a más reciente. Usa coma para separar columnas y punto como separador decimal. No se necesita CSV, ni se envían tus valores a Supabase.</p>
    <p className="text-sm">Orden de variables: <strong>{manifest.features.join(' · ')}</strong>.</p>
    <p className="text-xs text-[var(--muted)]">Cada fila: {manifest.features.join(', ')}. Escribe valores originales, sin normalizar. Se estimará el siguiente objetivo; no se deduce su instante exacto.</p>
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <label htmlFor="rnn-restored-window" className="block text-sm font-semibold">Observaciones de la ventana ({manifest.steps} filas × {manifest.features.length} variables)</label>
      <textarea id="rnn-restored-window" value={values} rows={Math.min(12, Math.max(5, manifest.steps))} required disabled={busy}
        maxLength={32768} spellCheck={false} placeholder={`Una fila por paso, en este orden:\n${manifest.features.join(', ')}`}
        className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 font-mono text-sm text-[var(--ink)] outline-none focus:border-[var(--focus)] focus:ring-2 focus:ring-[var(--focus)]"
        onChange={(event) => { setValues(event.target.value); setResult(null); setError('') }}/>
      <Button type="submit" busy={busy} disabled={busy}>Predecir siguiente paso</Button>
    </form>
    {busy && <Spinner size="sm" label="Calculando predicción con los pesos restaurados…"/>}
    {error && <Notice tone="error">{error}</Notice>}
    {result && <div role="status" aria-live="polite" className="space-y-3 rounded-xl bg-[var(--surface-muted)] p-4">
      <p className="text-sm">Predicción: <strong className="text-lg tabular-nums">{typeof result.value === 'number' ? result.value.toFixed(4) : result.value}</strong></p>
      {result.probabilities && <div className="space-y-1">{result.probabilities.map(({ label, probability }) => <p key={label} className="flex justify-between gap-3 text-sm"><span>{label}</span><span className="tabular-nums">{(probability * 100).toFixed(1)} %</span></p>)}</div>}
    </div>}
    <p className="text-xs text-[var(--muted)]">Se reutiliza la normalización calculada exclusivamente en train; las predicciones son exploratorias y pueden ser inexactas fuera del rango de entrenamiento.</p>
  </Surface>
}
