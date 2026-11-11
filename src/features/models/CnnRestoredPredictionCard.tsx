/**
 * CNN-4C: predicción de una imagen nueva con una versión privada restaurada.
 * Los ejemplos de test originales nunca se guardan, por lo que esta pantalla
 * solicita una imagen local (PNG/JPG/WebP) y NO muestra resultados ficticios.
 */
import { useEffect, useRef, useState } from 'react'
import { ImageUp, ScanSearch } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { CnnPixelCanvas } from '../cnn/CnnPixelCanvas'
import { prepareCnnPredictionImage } from '../../ml/cnn/cnnImageInput.ts'
import type { CnnInputShape } from '../../ml/cnn/architecture.ts'

interface Props {
  input: CnnInputShape
  classNames: string[]
  predict: (pixels: Uint8Array) => Promise<number[]>
}

export function CnnRestoredPredictionCard({ input, classNames, predict }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [invert, setInvert] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pixels, setPixels] = useState<Uint8Array | null>(null)
  const [probabilities, setProbabilities] = useState<number[] | null>(null)
  // Una predicción terminada tras cambiar de versión no debe actualizar la UI.
  const generation = useRef(0)
  useEffect(() => () => { generation.current += 1 }, [])

  async function infer(selected: File, shouldInvert: boolean) {
    const current = ++generation.current
    setBusy(true); setError(''); setPixels(null); setProbabilities(null)
    try {
      const processed = await prepareCnnPredictionImage(selected, input, shouldInvert)
      const values = await predict(processed)
      if (values.length !== classNames.length || values.some((n) => !Number.isFinite(n) || n < 0 || n > 1)) {
        throw new Error('La CNN restaurada devolvió probabilidades incompatibles.')
      }
      if (current === generation.current) { setPixels(processed); setProbabilities(values) }
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : 'No fue posible predecir.')
    } finally { if (current === generation.current) setBusy(false) }
  }
  const predicted = probabilities ? probabilities.indexOf(Math.max(...probabilities)) : -1
  return <Surface className="space-y-5 p-5 sm:p-6">
    <header className="flex items-center gap-2"><ScanSearch size={19}/><h3 className="text-lg font-semibold">Predicción CNN · versión recuperada</h3></header>
    <p className="text-sm text-[var(--muted)]">Carga una imagen para clasificarla con los pesos de la versión guardada.
      Se aplicará la normalización 0–1 original. No necesitas importar el CSV ni se enviará la imagen a Supabase.</p>
    <p className="text-xs text-[var(--muted)]">Entrada: {input.width} × {input.height}, un canal · {classNames.length} clases.</p>
    <label htmlFor="cnn-restored-image" className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-4 text-center text-sm hover:border-[var(--focus)]">
      <ImageUp size={22}/>{file?.name ?? 'Selecciona PNG, JPG o WebP (máximo 5 MiB)'}
    </label>
    <input id="cnn-restored-image" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
      className="sr-only" onChange={(event) => {
        const selected = event.currentTarget.files?.[0]
        if (selected) { setFile(selected); void infer(selected, invert) }
        event.currentTarget.value = ''
      }}/>
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={invert} disabled={busy} onChange={(event) => {
        setInvert(event.target.checked)
        if (file) void infer(file, event.target.checked)
      }}/>
      Invertir trazos oscuros sobre fondo blanco
    </label>
    {busy && <Spinner size="sm" label="Calculando probabilidades con el modelo restaurado…"/>}
    {error && <Notice tone="error">{error}</Notice>}
    {pixels && probabilities && <div role="status" aria-live="polite" className="space-y-4">
      <div className="flex items-center gap-4 rounded-xl bg-[var(--surface-muted)] p-4">
        <div className="w-20 shrink-0"><CnnPixelCanvas pixels={pixels} size={input.width} label="Imagen procesada"/></div>
        <div><p className="text-xs text-[var(--muted)]">Clase estimada</p>
          <p className="text-2xl font-semibold">{classNames[predicted]}</p>
          <p className="text-sm">Confianza softmax: {(probabilities[predicted] * 100).toFixed(1)} %</p>
        </div>
      </div>
      <h4 className="font-semibold">Probabilidades por clase</h4>
      <div className="space-y-2">{classNames.map((name, index) => <div key={name} className="grid grid-cols-[4rem_1fr_4rem] items-center gap-2 text-xs">
        <span className="truncate font-medium">{name}</span>
        <div className="h-3 rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--chart-train)]" style={{width: `${Math.max(0, Math.min(100, probabilities[index]*100))}%`}}/></div>
        <span className="text-right tabular-nums">{(probabilities[index]*100).toFixed(1)} %</span>
      </div>)}</div>
    </div>}
    <p className="text-xs text-[var(--muted)]">Estas probabilidades no garantizan que una foto externa sea similar al conjunto de entrenamiento.</p>
    <Button type="button" variant="outline" disabled={busy} onClick={() => { generation.current++; setFile(null); setError(''); setPixels(null); setProbabilities(null) }}>Limpiar predicción</Button>
  </Surface>
}
