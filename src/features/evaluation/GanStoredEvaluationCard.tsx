/** GAN-4D: solo diagnósticos agregados de la primera generación confirmada. */
import { Surface } from '../../components/ui/Surface'
import type { GanStoredEvaluation } from '../../ml/evaluation/ganStoredEvaluation.ts'

export function GanStoredEvaluationCard({ evaluation }: { evaluation: GanStoredEvaluation }) {
  const values = [
    ['Imágenes resumidas', evaluation.sampleCount.toString()],
    ['Resolución', `${evaluation.dimension}×${evaluation.dimension}`],
    ['Brillo medio', evaluation.meanIntensity.toFixed(2)],
    ['Diferencia media', evaluation.meanPairwiseDistance.toFixed(2)],
    ['Rango de píxeles', `${evaluation.minimumPixel}–${evaluation.maximumPixel}`],
  ]
  return <Surface className="space-y-4 p-5 sm:p-6">
    <h3 className="text-lg font-semibold">GAN · resumen descriptivo de generación</h3>
    <p className="text-sm text-[var(--muted)]">Primer lote de imágenes generado y confirmado en Supabase. No se almacenaron píxeles ni imágenes. Estas estadísticas NO miden realismo, FID ni calidad generativa.</p>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{values.map(([name, value]) =>
      <div key={name} className="rounded-xl bg-[var(--surface-muted)] p-3">
        <dt className="text-xs text-[var(--muted)]">{name}</dt>
        <dd className="mt-2 font-semibold tabular-nums">{value}</dd>
      </div>)}</dl>
  </Surface>
}
