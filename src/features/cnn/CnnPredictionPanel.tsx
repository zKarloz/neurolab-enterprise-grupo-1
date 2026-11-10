/** Predicción desde muestras test y desde imágenes locales sin envío al servidor. */
import { useEffect, useState } from 'react'
import { ImageUp, ScanSearch } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { checkCnnPredictionFile, prepareCnnPredictionImage } from '../../ml/cnn/cnnImageInput.ts'
import type { CnnEvaluation } from '../../ml/cnn/cnnEvaluation.ts'
import type { CnnInputShape } from '../../ml/cnn/architecture.ts'
import { CnnPixelCanvas } from './CnnPixelCanvas'

const percent = (value: number) => `${(100 * value).toFixed(1)} %`

export function CnnPredictionPanel({ report, input, onPredict, onTrain }: {
  report: CnnEvaluation | null
  input: CnnInputShape
  onPredict: (pixels: Uint8Array) => Promise<number[]>
  onTrain: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [invert, setInvert] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pixels, setPixels] = useState<Uint8Array | null>(null)
  const [probabilities, setProbabilities] = useState<number[] | null>(null)
  const [actual, setActual] = useState<string | null>(null)
  useEffect(() => {
    setFile(null); setPixels(null); setProbabilities(null); setActual(null); setError('')
  }, [report])

  if (!report) return <Surface className="flex min-h-56 flex-col items-center justify-center gap-3 p-8 text-center">
    <ScanSearch size={30} className="text-[var(--muted)]" />
    <h2 className="text-lg font-semibold">Entrena una CNN antes de predecir</h2>
    <p className="max-w-xl text-sm text-[var(--muted)]">La predicción necesita el modelo entrenado de la sesión actual, no únicamente el CSV.</p>
    <button type="button" className="text-sm font-semibold underline underline-offset-4" onClick={onTrain}>Ir a Entrenar</button>
  </Surface>
  const prediction = probabilities ? probabilities.indexOf(Math.max(...probabilities)) : -1
  const selectTest = (index: number) => {
    const example = report.examples[index]
    if (!example) return
    setFile(null); setError(''); setPixels(example.pixels); setProbabilities(example.probabilities)
    setActual(report.classNames[example.actual])
  }
  const predictFile = async (selected: File, shouldInvert: boolean) => {
    setBusy(true); setError(''); setProbabilities(null); setPixels(null); setActual(null)
    try {
      checkCnnPredictionFile(selected)
      const processed = await prepareCnnPredictionImage(selected, input, shouldInvert)
      const values = await onPredict(processed)
      if (values.length !== report.classNames.length) throw new Error('La salida del modelo no coincide con el número de clases.')
      setPixels(processed); setProbabilities(values)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No fue posible procesar la imagen.')
    } finally { setBusy(false) }
  }
  return <div className="space-y-5">
    <div className="grid gap-4 lg:grid-cols-2">
      <Surface className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ImageUp size={19} /> Imagen para clasificar</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Selecciona una muestra test o adjunta una imagen propia. El archivo no se envía a Supabase.</p>
        <label htmlFor="cnn-prediction-file" className="mt-5 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-4 text-sm font-medium hover:border-[var(--focus)]">
          <ImageUp size={22} /> {file ? file.name : 'Elegir PNG, JPG o WebP · máximo 5 MiB'}
        </label>
        <input id="cnn-prediction-file" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(event) => {
          const selected = event.currentTarget.files?.[0]
          if (selected) { setFile(selected); void predictFile(selected, invert) }
          event.currentTarget.value = ''
        }} />
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={invert} disabled={busy} onChange={(event) => {
            setInvert(event.target.checked)
            if (file) void predictFile(file, event.target.checked)
          }}/>
          Invertir colores (trazo oscuro sobre fondo blanco)
        </label>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">La imagen se centra, redimensiona a {input.width} × {input.height} y convierte a grises. El modelo se entrenó con trazos claros sobre fondo oscuro. La precisión puede bajar con fotografías o estilos muy diferentes del CSV.</p>
        {busy && <Spinner className="mt-4" size="sm" label="Calculando inferencia local…" />}
        {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
        <h3 className="mt-6 text-sm font-semibold">Ejemplos del conjunto test</h3>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {report.examples.slice(0, 12).map((example, index) => <button key={example.index} type="button" className="rounded-lg border border-[var(--line)] p-2 text-center hover:border-[var(--focus)]" onClick={() => selectTest(index)} disabled={busy}>
            <CnnPixelCanvas pixels={example.pixels} size={input.width} label={`Ejemplo real ${report.classNames[example.actual]}`} />
            <span className="mt-1 block text-xs">{report.classNames[example.actual]}</span>
          </button>)}
        </div>
      </Surface>
      <Surface className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><ScanSearch size={19} /> Predicción CNN</h2>
        {pixels && probabilities ? <>
          <div className="mt-4 flex flex-wrap items-center gap-5 rounded-xl bg-[var(--surface-muted)] p-4">
            <div className="w-24"><CnnPixelCanvas pixels={pixels} size={input.width} label="Imagen normalizada que recibe CNN" /></div>
            <div><p className="text-sm text-[var(--muted)]">Clase predicha</p><p className="mt-1 text-3xl font-semibold">{report.classNames[prediction]}</p>
              <p className="mt-1 text-sm">Confianza softmax: {percent(probabilities[prediction])}</p>
              {actual !== null && <p className="text-sm text-[var(--muted)]">Clase real: {actual}</p>}
            </div>
          </div>
          <h3 className="mt-5 text-sm font-semibold">Probabilidades por clase</h3>
          <div className="mt-3 space-y-2">{report.classNames.map((name, index) => <div key={name} className="grid grid-cols-[4rem_1fr_4rem] items-center gap-3 text-xs">
            <span className="truncate font-medium">{name}</span><div className="h-3 rounded-full bg-[var(--surface-muted)]"><div className="h-full rounded-full bg-[var(--chart-train)]" style={{ width: `${Math.max(0, Math.min(100, probabilities[index] * 100))}%` }}/></div>
            <span className="text-right tabular-nums">{percent(probabilities[index])}</span>
          </div>)}</div>
        </> : <div className="flex min-h-60 flex-col items-center justify-center text-center"><ScanSearch size={30} className="text-[var(--muted)]" />
          <p className="mt-3 text-sm text-[var(--muted)]">Elige una imagen o un ejemplo test para ver una predicción real.</p></div>}
      </Surface>
    </div>
    <div className="flex justify-end"><Button type="button" variant="outline" onClick={onTrain}>Volver a Entrenar</Button></div>
  </div>
}
