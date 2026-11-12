/** GAN-3: genera nuevas muestras con G entrenado; no usa ejemplos de test ni servidor. */
import { Images, RotateCw } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { SelectField } from '../../components/ui/SelectField'
import { Spinner } from '../../components/ui/Spinner'
import { Surface } from '../../components/ui/Surface'
import { summarizeGanGeneratedBatch, type GanGeneratedBatch, type GanSampleCount } from '../../ml/gan/generation.ts'
import { GanGrayImage } from './GanGrayImage'

export function GanGenerationPanel({ batch, count, onCount, onGenerate, generating, error, ready, canEdit, restored = false }: {
  batch: GanGeneratedBatch | null
  count: GanSampleCount
  onCount: (count: GanSampleCount) => void
  onGenerate: () => void
  generating: boolean
  error: string
  ready: boolean
  canEdit: boolean
  restored?: boolean
}) {
  const summary = batch ? summarizeGanGeneratedBatch(batch) : null
  const dimension = batch?.dimension ?? 8
  const area = dimension ** 2
  return <div className="space-y-5">
    <Surface className="space-y-4 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold"><Images size={19}/> Generación con el modelo entrenado</h2>
      <p className="text-sm text-[var(--muted)]">{restored ? 'El generador se recuperó de Storage privado. Cada generación usa ruido nuevo; ni los PNG ni los píxeles se guardan remotamente.' : 'Cada solicitud utiliza ruido aleatorio nuevo y los pesos del generador de esta sesión. El CSV y los PNG permanecen locales; GAN-4B puede guardar únicamente el primer resumen numérico de generación en Supabase.'}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><SelectField id="gan-generate-count" label="Imágenes nuevas" value={String(count)} disabled={!canEdit || !ready || generating}
          options={[4, 8, 16].map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(event) => onCount(Number(event.target.value) as GanSampleCount)}/></div>
        <Button type="button" disabled={!canEdit || !ready || generating} onClick={onGenerate}><RotateCw size={16}/> Generar imágenes</Button>
      </div>
      {generating && <Spinner label="Calculando muestras nuevas con TensorFlow.js…"/>}
      {!ready && <Notice>Todavía no hay un generador entrenado. {restored ? 'Carga una versión GAN desde Modelos privados.' : 'Termina primero una ejecución en Entrenar.'}</Notice>}
      {!canEdit && <Notice>Necesitas permisos técnicos de proyecto para generar imágenes en GAN.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </Surface>
    {batch && <Surface className="space-y-4 p-5 sm:p-6">
      <h3 className="text-lg font-semibold">{batch.count} imágenes sintéticas · {batch.dimension}×{batch.dimension}</h3>
      <p className="text-xs text-[var(--muted)]">Muestras nuevas generadas por G, no imágenes copiadas del CSV. Puedes descargar cada imagen como PNG local.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: batch.count }, (_unused, index) => <GanGrayImage key={index}
          size={batch.dimension} label={`Generada ${index + 1}`}
          pixels={batch.pixels.subarray(index * area, (index + 1) * area)}
          fileName={`neurolab-gan-${batch.dimension}x${batch.dimension}-${index + 1}.png`}/>) }
      </div>
      {summary && <dl className="grid gap-3 text-sm sm:grid-cols-3">
        {([
          ['Brillo medio', summary.meanIntensity.toFixed(1)],
          ['Diferencia media entre imágenes', summary.meanPairwiseDistance.toFixed(1)],
          ['Rango de píxeles', `${summary.minimumPixel}–${summary.maximumPixel}`],
        ] as Array<[string, string]>).map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--surface-muted)] p-3">
          <dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd>
        </div>)}
      </dl>}
      <Notice>Estos valores describen la intensidad y las diferencias entre imágenes. No miden realismo, FID, IS ni calidad del generador. La apariencia debe evaluarse visualmente; los datasets reales pueden ser más informativos que el CSV sintético.</Notice>
    </Surface>}
  </div>
}
