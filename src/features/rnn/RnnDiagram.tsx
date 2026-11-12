import { ArrowDown, GitBranch } from 'lucide-react'
import { Surface } from '../../components/ui/Surface'
import type { RnnDiagram as RnnDiagramData } from '../../ml/rnn/architecture.ts'

/** Flujo de tensores, sin representar neuronas individuales ni resultados inventados. */
export function RnnDiagram({ diagram }: { diagram: RnnDiagramData }) {
  return <Surface className="p-5 sm:p-6">
    <div className="flex items-center gap-2"><GitBranch size={18} /><h2 className="text-lg font-semibold">Flujo temporal de la red</h2></div>
    <p className="mt-2 text-xs text-[var(--muted)]">Dimensiones por muestra, sin la dimensión de batch. Parámetros teóricos según la configuración actual.</p>
    <ol className="mx-auto mt-6 flex max-w-xl flex-col items-center">
      {diagram.layers.map((layer, i) => <li key={layer.id} className="flex w-full flex-col items-center">
        {i > 0 && <ArrowDown size={20} className="my-2 text-[var(--muted)]" aria-hidden="true" />}
        <div className="w-full rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-sm">{layer.label}</strong><span className="font-mono text-xs">{layer.shape}</span></div>
          <p className="mt-1 text-xs text-[var(--muted)]">{layer.details}</p>
          <p className="mt-2 text-xs tabular-nums">{layer.parameters.toLocaleString('es-PE')} parámetros</p>
        </div>
      </li>)}
    </ol>
    {diagram.layers.length === 0 && <p className="mt-5 text-sm text-[var(--muted)]">Configura dimensiones válidas para ver el diagrama.</p>}
  </Surface>
}
