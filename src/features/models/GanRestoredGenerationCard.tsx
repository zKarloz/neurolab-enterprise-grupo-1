/** GAN-4C: producción local de nuevas imágenes desde G descargado y validado. */
import { useEffect, useRef, useState } from 'react'
import { Notice } from '../../components/ui/Notice'
import { Surface } from '../../components/ui/Surface'
import { GanGenerationPanel } from '../gan/GanGenerationPanel'
import type { GanDimension } from '../../ml/gan/architecture.ts'
import type { GanGeneratedBatch, GanSampleCount } from '../../ml/gan/generation.ts'

export function GanRestoredGenerationCard({ dimension, generate }: {
  dimension: GanDimension
  generate: (count: GanSampleCount) => Promise<GanGeneratedBatch>
}) {
  const [count, setCount] = useState<GanSampleCount>(8)
  const [generated, setGenerated] = useState<GanGeneratedBatch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const token = useRef(0)
  useEffect(() => () => { token.current += 1 }, [])

  async function createImages() {
    if (busy) return
    const id = ++token.current
    setBusy(true); setError(''); setGenerated(null)
    try {
      const result = await generate(count)
      if (result.dimension !== dimension) throw new Error('La generación no corresponde al tamaño del modelo registrado.')
      if (token.current === id) setGenerated(result)
    } catch (cause) {
      if (token.current === id) setError(cause instanceof Error ? cause.message : 'Error al generar con la versión privada.')
    } finally { if (token.current === id) setBusy(false) }
  }

  return <div className="space-y-4">
    <Surface className="p-4 sm:p-6"><Notice>Generador GAN restaurado ({dimension}×{dimension}). Se utilizará ruido aleatorio nuevo en cada generación; no necesitas CSV ni se guardarán estas imágenes en Supabase.</Notice></Surface>
    <GanGenerationPanel batch={generated} count={count} onCount={setCount}
      onGenerate={() => void createImages()} generating={busy} error={error}
      ready canEdit restored/>
  </div>
}
