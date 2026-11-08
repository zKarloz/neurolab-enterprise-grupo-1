import { useState } from 'react'
import type { FormEvent } from 'react'
import { FlaskConical } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { InputField } from '../../components/ui/InputField'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Surface } from '../../components/ui/Surface'
import type { PreparationManifest } from '../../ml/preprocessing/types.ts'
import { interpretPrediction, preparePredictionInput } from '../../ml/evaluation/inference.ts'
import type { PredictionView } from '../../ml/evaluation/inference.ts'

interface Props {
  manifest: PreparationManifest
  predict: (values: number[]) => Promise<number>
}

/** Inferencia manual con el modelo de esta pestaña; no almacena entradas ni predicciones. */
export function SessionPredictionCard({ manifest, predict }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<PredictionView | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const transformed = preparePredictionInput(values, manifest)
      const value = await predict(transformed)
      setResult(interpretPrediction(value, manifest))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo realizar la predicción.')
    } finally { setBusy(false) }
  }

  return <Surface className="space-y-4 p-5 sm:p-6">
    <div className="flex items-center gap-2"><FlaskConical size={19} aria-hidden="true"/><h3 className="text-lg font-semibold">Predicción local · sesión actual</h3></div>
    <p className="text-sm text-[var(--muted)]">Introduce los valores originales. Se aplicará exactamente el preprocesamiento del entrenamiento. No se envían estas entradas a Supabase.</p>
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {manifest.transformers.map((transformer) => transformer.kind === 'numeric'
          ? <InputField key={transformer.column} id={`predict-${transformer.column}`} label={transformer.column} type="number" step="any" required
              value={values[transformer.column] ?? ''} placeholder="Valor numérico" disabled={busy}
              onChange={(event) => { setValues((prev) => ({ ...prev, [transformer.column]: event.target.value })); setResult(null) }}/>
          : <SelectField key={transformer.column} id={`predict-${transformer.column}`} label={transformer.column} required disabled={busy}
              value={values[transformer.column] ?? ''}
              options={[{ value: '', label: 'Selecciona una categoría' }, ...transformer.categories.map((category) => ({ value: category, label: category }))]}
              onChange={(event) => { setValues((prev) => ({ ...prev, [transformer.column]: event.target.value })); setResult(null) }}/>) }
      </div>
      <Button type="submit" disabled={busy} busy={busy}>Calcular predicción</Button>
    </form>
    {error && <Notice tone="error">{error}</Notice>}
    {result && <div role="status" aria-live="polite" className="rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
      {result.problemType === 'binary'
        ? <><p className="font-semibold">Clase estimada: {result.label}</p><p className="mt-1 text-sm">Probabilidad de «{manifest.targetLabels?.[1]}»: {(result.probabilityPositive * 100).toFixed(2)} % · umbral {result.threshold}</p></>
        : <><p className="font-semibold">Predicción: {result.value.toLocaleString('es-PE', { maximumFractionDigits: 6 })}</p><p className="mt-1 text-sm text-[var(--muted)]">En la escala original de la variable objetivo.</p></>}
    </div>}
    <p className="text-xs text-[var(--muted)]">El modelo se libera al salir de esta pantalla o iniciar otro entrenamiento. La predicción no sustituye un diagnóstico profesional ni representa una garantía clínica.</p>
  </Surface>
}
